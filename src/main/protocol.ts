import { net, protocol } from 'electron'
import { readFile } from 'fs/promises'
import { extname } from 'path'
import { attachmentPath, ensureAttachmentsDir } from './store/attachments'

const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.txt': 'text/plain'
}

/** Must run before app ready so the renderer can use hal-att:// URLs. */
export function registerAttachmentScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: 'hal-att', privileges: { standard: true, secure: true, supportFetchAPI: true } }
  ])
}

/** Serves vault attachments from the local cache dir: hal-att://<urlencoded name> */
export function initAttachmentProtocol(): void {
  ensureAttachmentsDir()
  protocol.handle('hal-att', (request) => {
    const url = new URL(request.url)
    // With standard: true the name parses as the hostname; fall back to pathname.
    const raw = url.hostname || decodeURIComponent(url.pathname.replace(/^\//, ''))
    const name = decodeURIComponent(raw)
    if (!name || name.includes('/') || name.includes('\\') || name.includes('..')) {
      return new Response('Bad attachment name', { status: 400 })
    }
    return net.fetch(`file://${attachmentPath(name).replace(/\\/g, '/')}`).then(
      (res) => {
        if (res.status === 200) {
          const mime = MIME_BY_EXT[extname(name).toLowerCase()] ?? 'application/octet-stream'
          const headers = new Headers(res.headers)
          headers.set('Content-Type', mime)
          return new Response(res.body, { status: 200, headers })
        }
        return new Response('Not found', { status: 404 })
      },
      () => new Response('Not found', { status: 404 })
    )
  })
}

export async function readAttachmentBytes(name: string): Promise<Uint8Array | null> {
  try {
    const buf = await readFile(attachmentPath(name))
    return new Uint8Array(buf)
  } catch {
    return null
  }
}
