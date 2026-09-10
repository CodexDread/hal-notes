import { app, safeStorage } from 'electron'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { AppSettings } from '@shared/types'
import { getMeta, setMeta } from './db'

const DEFAULTS: AppSettings = {
  theme: 'dark',
  syncIntervalMs: 30_000,
  vaultFolderName: 'HAL Notes',
  chatModel: '',
  geminiKeySet: false,
  geminiEmail: '',
  defaultViewMode: 'split',
  captureDelayMs: 12_000,
  editorFontSize: 15,
  accentColor: '',
  pathLengthCards: 7,
  debugConsole: false,
  readingWidth: 'full'
}

const KEY_FILE = 'gemini-key.bin'

export function getSettings(): AppSettings {
  const raw = getMeta('settings')
  if (!raw) return { ...DEFAULTS }
  try {
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<AppSettings>) }
  } catch {
    return { ...DEFAULTS }
  }
}

export function updateSettings(patch: Partial<AppSettings>): AppSettings {
  const next = { ...getSettings(), ...patch }
  setMeta('settings', JSON.stringify(next))
  return next
}

function keyPath(): string {
  return join(app.getPath('userData'), KEY_FILE)
}

function encrypt(plain: string): string {
  if (safeStorage.isEncryptionAvailable()) {
    return `enc:${safeStorage.encryptString(plain).toString('base64')}`
  }
  return `plain:${Buffer.from(plain, 'utf8').toString('base64')}`
}

function decrypt(stored: string): string | null {
  if (stored.startsWith('enc:')) {
    try {
      return safeStorage.decryptString(Buffer.from(stored.slice(4), 'base64'))
    } catch {
      return null
    }
  }
  if (stored.startsWith('plain:')) {
    return Buffer.from(stored.slice(6), 'base64').toString('utf8')
  }
  return null
}

export function setGeminiKey(key: string): void {
  writeFileSync(keyPath(), encrypt(key.trim()), 'utf8')
  updateSettings({ geminiKeySet: key.trim().length > 0 })
}

export function getGeminiKey(): string | null {
  if (!existsSync(keyPath())) return null
  const stored = readFileSync(keyPath(), 'utf8')
  return decrypt(stored)
}

export function clearGeminiKey(): void {
  if (existsSync(keyPath())) rmSync(keyPath())
  updateSettings({ geminiKeySet: false })
}
