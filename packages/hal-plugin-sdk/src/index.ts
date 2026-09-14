/**
 * @hal-notes/plugin-sdk — Public types and utilities for HAL Notes plugin developers.
 *
 * A plugin is a folder containing:
 *   manifest.json  { id, name, version, entry, permissions }
 *   <entry>.js     export default function(halPlugin) { ... } (or a plain script)
 *
 * The entry is evaluated with a single argument: the `HalPluginSdk` object.
 * Permission-gated facets are `undefined` unless the manifest declares them.
 */

// ── Manifest ─────────────────────────────────────────────────────────────────

export type PluginPermission = 'ui' | 'notes' | 'storage' | 'ai' | 'files'

export interface HalPluginManifest {
  /** Reverse-DNS style unique id, e.g. "com.yourname.wordcount" */
  id: string
  /** Human-readable name shown in Settings → Plugins */
  name: string
  /** Semver string */
  version: string
  /** Minimum HAL Notes version this plugin supports (semver) */
  halVersion?: string
  /** One-line description */
  description?: string
  /** Entry script filename relative to the plugin folder */
  entry: string
  /** Permission grants; without a permission the facet is undefined at runtime */
  permissions?: PluginPermission[]
}

// ── UI facet ────────────────────────────────────────────────────────────────

export interface ModeDefinition {
  /** Unique mode id; becomes plugin:<id> in the mode rail */
  id: string
  /** Label shown in the mode annunciator */
  label: string
  /** Sort order (lower = earlier); bundled plugins use 10/20/30 */
  order?: number
  /**
   * Mount your UI into the container. Return a cleanup function to tear down
   * (remove listeners, destroy editors). Called when the user switches modes.
   */
  mount(container: HTMLElement): (() => void) | void
}

export interface UiFacet {
  /** Register a top-level mode (tab). The container is yours to fill — plain DOM. */
  registerMode(def: ModeDefinition): void
  /** Inject a <style> element scoped to your plugin (removed on unload). */
  addStyle(css: string): void
  /** Log to the debug console with your plugin id prefix. */
  status(message: string): void
}

// ── Storage facet (permission: "storage") ───────────────────────────────────

export interface StorageFacet {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<void>
  keys(): Promise<string[]>
}

// ── Notes facet (permission: "notes") ───────────────────────────────────────

export interface VaultNoteMeta {
  id: string
  name: string
  path: string
  pendingSync: boolean
  updatedAt: number
}

export interface OpenNote {
  meta: VaultNoteMeta
  content: string
}

export interface NotesFacet {
  list(): Promise<{ notes: VaultNoteMeta[] }>
  open(id: string): Promise<OpenNote | null>
  create(name: string, content: string): Promise<VaultNoteMeta>
  save(id: string, content: string): Promise<VaultNoteMeta | null>
  search(query: string): Promise<{ noteId: string; name: string; snippet: string }[]>
}

// ── AI facet (permission: "ai") ─────────────────────────────────────────────

export interface ChatMessage {
  role: 'user' | 'assistant'
  text: string
}

export interface ChatRequest {
  system?: string
  messages: ChatMessage[]
  json?: boolean
}

export interface AiFacet {
  /** True when a provider key is registered AND the AI master toggle is on. */
  available(): boolean
  /** One-shot completion through the user's configured provider. */
  chat(req: ChatRequest): Promise<string>
  /** Streaming completion; onDelta receives text chunks. */
  chatStream(req: ChatRequest, onDelta: (delta: string) => void): Promise<string>
}

// ── Files facet (permission: "files") ───────────────────────────────────────

export interface FilesFacet {
  /** Native save dialog; returns the chosen path or null if cancelled. */
  saveText(defaultName: string, content: string): Promise<string | null>
}

// ── The SDK object ──────────────────────────────────────────────────────────

export interface HalPluginSdk {
  ui: UiFacet
  storage: StorageFacet | undefined
  notes: NotesFacet | undefined
  ai: AiFacet | undefined
  files: FilesFacet | undefined
}

// ── Version compatibility ───────────────────────────────────────────────────

/**
 * Checks a plugin's halVersion against the running app version.
 * Returns null if compatible, or a human-readable incompatibility reason.
 * Uses simple semver comparison (major.minor.patch); pre-release tags ignored.
 */
export function checkVersion(pluginHalVersion: string, appVersion: string): string | null {
  const parse = (v: string): [number, number, number] => {
    const parts = v.replace(/-.*$/, '').split('.').map(Number)
    return [parts[0] || 0, parts[1] || 0, parts[2] || 0]
  }
  const [pmaj, pmin, ppat] = parse(pluginHalVersion)
  const [amaj, amin, apat] = parse(appVersion)
  if (pmaj > amaj) return `Plugin requires HAL Notes ${pluginHalVersion}+ (app is ${appVersion})`
  if (pmaj === amaj && pmin > amin) return `Plugin requires HAL Notes ${pluginHalVersion}+ (app is ${appVersion})`
  if (pmaj === amaj && pmin === amin && ppat > apat) {
    return `Plugin requires HAL Notes ${pluginHalVersion}+ (app is ${appVersion})`
  }
  return null
}

// ── Manifest validation ─────────────────────────────────────────────────────

export interface ManifestValidationError {
  field: string
  message: string
}

export function validateManifest(m: unknown): ManifestValidationError[] {
  const errors: ManifestValidationError[] = []
  const man = m as Partial<HalPluginManifest>
  if (!man.id || !/^[a-z0-9][a-z0-9.-]*$/i.test(man.id)) {
    errors.push({ field: 'id', message: 'Required; alphanumeric with dots/dashes (e.g. com.you.myplugin)' })
  }
  if (!man.name) errors.push({ field: 'name', message: 'Required' })
  if (!man.version || !/^\d+\.\d+\.\d+/.test(man.version)) {
    errors.push({ field: 'version', message: 'Required; semver (e.g. 1.0.0)' })
  }
  if (!man.entry) errors.push({ field: 'entry', message: 'Required; entry script filename (e.g. index.js)' })
  if (man.permissions) {
    const valid: PluginPermission[] = ['ui', 'notes', 'storage', 'ai', 'files']
    for (const p of man.permissions) {
      if (!valid.includes(p)) {
        errors.push({ field: 'permissions', message: `Unknown permission "${p}"; valid: ${valid.join(', ')}` })
      }
    }
  }
  return errors
}
