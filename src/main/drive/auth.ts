import http from 'http'
import { AddressInfo } from 'net'
import { app, safeStorage, shell } from 'electron'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { google, type drive_v3, type Auth } from 'googleapis'
import { bus } from '../events'

const SCOPES = ['https://www.googleapis.com/auth/drive']
const SECRET_FILE = 'client-secret.json'
const TOKENS_FILE = 'drive-tokens.json'

interface ParsedSecret {
  clientId: string
  clientSecret: string
}

class DriveAuth {
  private client: Auth.OAuth2Client | null = null
  private secret: ParsedSecret | null = null
  connected = false

  private secretPath(): string {
    return join(app.getPath('userData'), SECRET_FILE)
  }

  private tokensPath(): string {
    return join(app.getPath('userData'), TOKENS_FILE)
  }

  isConfigured(): boolean {
    return existsSync(this.secretPath())
  }

  configure(secretJson: string): void {
    const parsed = JSON.parse(secretJson) as Record<string, { client_id: string; client_secret: string }>
    const creds = parsed.installed ?? parsed.web
    if (!creds?.client_id || !creds?.client_secret) {
      throw new Error('Not an OAuth client secret file: expected "installed" or "web" with client_id/client_secret')
    }
    writeFileSync(this.secretPath(), secretJson, 'utf8')
    this.secret = { clientId: creds.client_id, clientSecret: creds.client_secret }
  }

  private loadSecret(): ParsedSecret | null {
    if (this.secret) return this.secret
    if (!existsSync(this.secretPath())) return null
    try {
      const parsed = JSON.parse(readFileSync(this.secretPath(), 'utf8')) as Record<
        string,
        { client_id: string; client_secret: string }
      >
      const creds = parsed.installed ?? parsed.web
      if (!creds?.client_id) return null
      this.secret = { clientId: creds.client_id, clientSecret: creds.client_secret }
      return this.secret
    } catch {
      return null
    }
  }

  isConnected(): boolean {
    return this.connected && this.client !== null
  }

  /** Opens the system browser for consent and captures the code on a loopback redirect. */
  async connect(onAuthUrl?: (url: string) => void): Promise<void> {
    const secret = this.loadSecret()
    if (!secret) throw new Error('Client secret not configured')

    const server = http.createServer()
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', () => resolve())
    })
    const port = (server.address() as AddressInfo).port
    const redirectUri = `http://127.0.0.1:${port}`
    const oauth2 = new google.auth.OAuth2(secret.clientId, secret.clientSecret, redirectUri)

    const authUrl = oauth2.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: SCOPES
    })
    onAuthUrl?.(authUrl)
    console.log(`[drive] sign-in page: ${authUrl}`)
    try {
      await shell.openExternal(authUrl)
      console.log('[drive] browser open requested')
    } catch (err) {
      // Not fatal: the renderer shows a manual link to the same URL.
      console.error('[drive] failed to open the browser automatically:', err)
    }

    const code = await new Promise<string>((resolvePromise, rejectPromise) => {
      const timer = setTimeout(() => {
        server.close()
        rejectPromise(new Error('Timed out waiting for Google sign-in'))
      }, 5 * 60 * 1000)
      server.on('request', (req, res) => {
        const url = new URL(req.url ?? '/', redirectUri)
        const code = url.searchParams.get('code')
        const err = url.searchParams.get('error')
        if (code || err) {
          res.writeHead(200, { 'Content-Type': 'text/html' })
          res.end('<html><body style="font-family:system-ui;background:#0f1116;color:#e5e7eb;display:grid;place-items:center;height:100vh"><h1>HAL Notes connected — you can close this tab.</h1></body></html>')
          clearTimeout(timer)
          server.close()
          if (code) resolvePromise(code)
          else rejectPromise(new Error(`Google returned: ${err}`))
        } else {
          res.writeHead(404)
          res.end()
        }
      })
    })

    const { tokens } = await oauth2.getToken(code)
    if (!tokens.refresh_token) throw new Error('Google did not return a refresh token; try connecting again')
    this.persistTokens(tokens.refresh_token)
    oauth2.setCredentials(tokens)
    this.client = oauth2
    this.connected = true
    bus.emit('drive:status-changed')
  }

  private persistTokens(refreshToken: string): void {
    let stored: string
    if (safeStorage.isEncryptionAvailable()) {
      stored = `enc:${safeStorage.encryptString(refreshToken).toString('base64')}`
    } else {
      stored = `plain:${Buffer.from(refreshToken, 'utf8').toString('base64')}`
    }
    writeFileSync(this.tokensPath(), stored, 'utf8')
  }

  /** Restores a session from the persisted refresh token, if any. */
  async restore(): Promise<boolean> {
    const secret = this.loadSecret()
    if (!secret || !existsSync(this.tokensPath())) return false
    const raw = readFileSync(this.tokensPath(), 'utf8')
    let refreshToken: string | null = null
    if (raw.startsWith('enc:')) {
      try {
        refreshToken = safeStorage.decryptString(Buffer.from(raw.slice(4), 'base64'))
      } catch {
        refreshToken = null
      }
    } else if (raw.startsWith('plain:')) {
      refreshToken = Buffer.from(raw.slice(6), 'base64').toString('utf8')
    }
    if (!refreshToken) return false
    const oauth2 = new google.auth.OAuth2(secret.clientId, secret.clientSecret)
    oauth2.setCredentials({ refresh_token: refreshToken })
    this.client = oauth2
    this.connected = true
    return true
  }

  disconnect(): void {
    if (existsSync(this.tokensPath())) rmSync(this.tokensPath())
    this.client = null
    this.connected = false
    bus.emit('drive:status-changed')
  }

  getClient(): Auth.OAuth2Client {
    if (!this.client) throw new Error('Google Drive is not connected')
    return this.client
  }

  getDrive(): drive_v3.Drive {
    return google.drive({ version: 'v3', auth: this.getClient() })
  }
}

export const driveAuth = new DriveAuth()
