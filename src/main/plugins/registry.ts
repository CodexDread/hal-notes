import { app, dialog } from 'electron'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { PluginDescriptor } from '@shared/types'
import { bus } from '../events'
import { getDb } from '../store/db'
import { getSettings, updateSettings } from '../store/settings'

export interface ThirdPartyManifest {
  id: string
  name: string
  version: string
  halVersion?: string
  description?: string
  entry: string
  permissions?: string[]
}

export const BUNDLED_PLUGINS: PluginDescriptor[] = [
  {
    id: 'hal.research',
    name: 'Research',
    version: '1.0.0',
    description: 'Learning-path notebooks: HAL researches the web + your vault and builds interactive paths.',
    bundled: true
  },
  {
    id: 'hal.review',
    name: 'Review',
    version: '1.0.0',
    description: 'Vault-wide spaced recall: cards from notes and learning paths on a gentle 1/3/7/14/30-day ladder.',
    bundled: true
  },
  {
    id: 'hal.screenplay',
    name: 'Screenplay',
    version: '1.0.0',
    description: 'Fountain-format screenplay editor with character/scene autocomplete, stats, and .fountain export.',
    bundled: true
  }
]

export function pluginsDir(): string {
  return join(app.getPath('userData'), 'plugins')
}

function readThirdParty(): PluginDescriptor[] {
  const dir = pluginsDir()
  if (!existsSync(dir)) return []
  const out: PluginDescriptor[] = []
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require('fs') as typeof import('fs')
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const manifestPath = join(dir, entry.name, 'manifest.json')
    if (!existsSync(manifestPath)) continue
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as ThirdPartyManifest
      if (!manifest.id || !manifest.name || !manifest.entry) continue
      if (!existsSync(join(dir, entry.name, manifest.entry))) continue
      out.push({
        id: manifest.id,
        name: manifest.name,
        version: manifest.version ?? '0.0.0',
        description: manifest.description ?? '',
        bundled: false,
        dirName: entry.name,
        permissions: manifest.permissions ?? []
      })
    } catch {
      // malformed manifest — skip
    }
  }
  return out
}

/** Plugin enable state lives in settings.plugins.enabled[id]; bundled default on, third-party default off. */
export function pluginEnabledState(): Record<string, boolean> {
  const s = getSettings()
  const states: Record<string, boolean> = {}
  for (const p of BUNDLED_PLUGINS) {
    states[p.id] = s.plugins?.enabled?.[p.id] ?? true
  }
  for (const p of readThirdParty()) {
    states[p.id] = s.plugins?.enabled?.[p.id] ?? false
  }
  return states
}

export function listPlugins(): PluginDescriptor[] {
  const states = pluginEnabledState()
  return [...BUNDLED_PLUGINS, ...readThirdParty()].map((p) => ({ ...p, enabled: states[p.id] ?? false }))
}

export function setPluginEnabled(id: string, enabled: boolean): void {
  const s = getSettings()
  const current = s.plugins?.enabled ?? {}
  updateSettings({ plugins: { enabled: { ...current, [id]: enabled } } })
  bus.emit('plugins:changed')
}

export function installPluginFromFolder(srcPath: string): PluginDescriptor {
  const manifestPath = join(srcPath, 'manifest.json')
  if (!existsSync(manifestPath)) throw new Error('No manifest.json in the selected folder')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as ThirdPartyManifest
  if (!manifest.id || !manifest.name || !manifest.entry) {
    throw new Error('manifest.json needs id, name, and entry')
  }
  if (BUNDLED_PLUGINS.some((p) => p.id === manifest.id)) throw new Error(`Plugin id "${manifest.id}" is reserved`)
  mkdirSync(pluginsDir(), { recursive: true })
  const dest = join(pluginsDir(), manifest.id)
  if (existsSync(dest)) rmSync(dest, { recursive: true })
  cpSync(srcPath, dest, { recursive: true })
  bus.emit('plugins:changed')
  return {
    id: manifest.id,
    name: manifest.name,
    version: manifest.version ?? '0.0.0',
    description: manifest.description ?? '',
    bundled: false,
    dirName: manifest.id,
    permissions: manifest.permissions ?? [],
    enabled: false
  }
}

export function removePlugin(id: string): void {
  if (BUNDLED_PLUGINS.some((p) => p.id === id)) throw new Error('Bundled plugins cannot be removed')
  const dir = join(pluginsDir(), id)
  if (existsSync(dir)) rmSync(dir, { recursive: true })
  const s = getSettings()
  const enabled = { ...(s.plugins?.enabled ?? {}) }
  delete enabled[id]
  updateSettings({ plugins: { enabled } })
  getDb().prepare('DELETE FROM plugin_storage WHERE plugin_id = ?').run(id)
  bus.emit('plugins:changed')
}

/** Third-party plugin entry code, delivered to the renderer for sandboxed evaluation. */
export function readPluginCode(id: string): string {
  const dir = join(pluginsDir(), id)
  const manifestPath = join(dir, 'manifest.json')
  if (!existsSync(manifestPath)) throw new Error(`Plugin ${id} not installed`)
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as ThirdPartyManifest
  return readFileSync(join(dir, manifest.entry), 'utf8')
}

// ── Plugin key-value storage (generic persistence for third-party plugins) ──

export function pluginStorageGet(pluginId: string, key: string): string | null {
  const row = getDb()
    .prepare<[string, string], { value: string }>('SELECT value FROM plugin_storage WHERE plugin_id = ? AND key = ?')
    .get(pluginId, key)
  return row?.value ?? null
}

export function pluginStorageSet(pluginId: string, key: string, value: string): void {
  getDb()
    .prepare(
      `INSERT INTO plugin_storage (plugin_id, key, value) VALUES (?, ?, ?)
       ON CONFLICT(plugin_id, key) DO UPDATE SET value = excluded.value`
    )
    .run(pluginId, key, value)
}

export function pluginStorageKeys(pluginId: string): string[] {
  const rows = getDb()
    .prepare<[string], { key: string }>('SELECT key FROM plugin_storage WHERE plugin_id = ?')
    .all(pluginId)
  return rows.map((r) => r.key)
}

/** Save-text dialog for plugin exports. Returns the chosen path or null. */
export async function saveTextFile(defaultName: string, content: string): Promise<string | null> {
  const res = await dialog.showSaveDialog({ defaultPath: join(app.getPath('documents'), defaultName) })
  if (res.canceled || !res.filePath) return null
  writeFileSync(res.filePath, content, 'utf8')
  return res.filePath
}
