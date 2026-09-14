import { createRoot, type Root } from 'react-dom/client'
import { hal } from '@/lib/ipc'
import { useUi } from '@/state/ui'
import type { PluginDescriptor } from '@shared/types'

/** Developer SDK surface handed to every plugin (bundled get extra privileged facets). */
export interface HalPluginSdk {
  ui: {
    registerMode(def: {
      id: string
      label: string
      order?: number
      /** Mounts into the host container; may return a cleanup fn run on unmount. */
      mount(container: HTMLElement): (() => void) | void
    }): void
    addStyle(css: string): void
    status(message: string): void
  }
  storage: {
    get(key: string): Promise<string | null>
    set(key: string, value: string): Promise<void>
    keys(): Promise<string[]>
  }
  notes: {
    list(): Promise<import('@shared/types').VaultSnapshot>
    open(id: string): Promise<import('@shared/types').OpenNote | null>
    create(name: string, content: string): Promise<import('@shared/types').NoteMeta>
    save(id: string, content: string): Promise<import('@shared/types').NoteMeta | null>
    search(q: string): Promise<import('@shared/types').SearchHit[]>
  }
  ai: {
    available(): boolean
    chat(req: { system?: string; messages: { role: 'user' | 'assistant'; text: string }[]; json?: boolean }): Promise<string>
    chatStream(
      req: { system?: string; messages: { role: 'user' | 'assistant'; text: string }[] },
      onDelta: (d: string) => void
    ): Promise<string>
  }
  files: {
    saveText(defaultName: string, content: string): Promise<string | null>
  }
}

interface ModeDef {
  label: string
  order: number
  mount(container: HTMLElement): (() => void) | void
}

interface MountedPlugin {
  descriptor: PluginDescriptor
  modes: Map<string, ModeDef>
  styleEl?: HTMLStyleElement
}

const mounted = new Map<string, MountedPlugin>()

function makeSdk(plugin: PluginDescriptor): HalPluginSdk {
  const perms = new Set(plugin.permissions ?? ['ui'])
  const has = (p: string): boolean => plugin.bundled || perms.has(p)

  return {
    ui: {
      registerMode: (def) => {
        const m = mounted.get(plugin.id)
        if (!m) return
        m.modes.set(def.id, { mount: def.mount, label: def.label, order: def.order ?? 100 })
        syncModes()
      },
      addStyle: (css) => {
        if (!has('ui')) return
        const m = mounted.get(plugin.id)
        if (!m || m.styleEl) return
        const el = document.createElement('style')
        el.dataset.plugin = plugin.id
        el.textContent = css
        document.head.appendChild(el)
        m.styleEl = el
      },
      status: (message) => console.log(`[${plugin.id}] ${message}`)
    },
    storage: has('storage')
      ? {
          get: (key) => hal.pluginStorageGet(plugin.id, key),
          set: (key, value) => hal.pluginStorageSet(plugin.id, key, value),
          keys: () => hal.pluginStorageKeys(plugin.id)
        }
      : (undefined as never),
    notes: has('notes')
      ? {
          list: () => hal.vaultList(),
          open: (id) => hal.noteOpen(id),
          create: (name, content) => hal.noteCreate(null, name).then(async (meta) => {
            if (content) await hal.noteSave(meta.id, content)
            return { ...meta, ...(content ? await hal.noteOpen(meta.id).then((o) => ({ content: o?.content ?? '' })) : {}) }
          }),
          save: (id, content) => hal.noteSave(id, content),
          search: (q) => hal.searchText(q)
        }
      : (undefined as never),
    ai: has('ai')
      ? {
          available: () => {
            const s = useUi.getState().settings
            return !!s?.geminiKeySet && (s?.aiEnabled ?? true)
          },
          chat: (req) =>
            new Promise((resolve, reject) => {
              const reqId = `${plugin.id}-${Date.now()}`
              const offDone = hal.on('ai:chat-done', (p) => {
                if (p.reqId !== reqId) return
                offDone(); offErr()
                resolve(p.text)
              })
              const offErr = hal.on('ai:chat-error', (p) => {
                if (p.reqId !== reqId) return
                offDone(); offErr()
                reject(new Error(p.error))
              })
              void hal.aiChat(reqId, { ...req, stream: false })
            }),
          chatStream: (req, onDelta) =>
            new Promise((resolve, reject) => {
              const reqId = `${plugin.id}-${Date.now()}`
              let full = ''
              const offDelta = hal.on('ai:chat-delta', (p) => {
                if (p.reqId !== reqId) return
                full += p.delta
                onDelta(p.delta)
              })
              const offDone = hal.on('ai:chat-done', (p) => {
                if (p.reqId !== reqId) return
                offDelta(); offDone(); offErr()
                resolve(p.text || full)
              })
              const offErr = hal.on('ai:chat-error', (p) => {
                if (p.reqId !== reqId) return
                offDelta(); offDone(); offErr()
                reject(new Error(p.error))
              })
              void hal.aiChat(reqId, { ...req, stream: true })
            })
        }
      : (undefined as never),
    files: has('files')
      ? { saveText: (defaultName, content) => hal.filesSaveText(defaultName, content) }
      : (undefined as never)
  }
}

function syncModes(): void {
  const modes: { id: string; label: string; order: number }[] = []
  for (const m of mounted.values()) {
    for (const [modeId, def] of m.modes) {
      modes.push({ id: modeId, label: def.label, order: def.order })
    }
  }
  modes.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
  // If the active plugin mode's plugin went away, fall back to Notes.
  const active = useUi.getState().mode
  if (active.startsWith('plugin:')) {
    const activeId = active.slice('plugin:'.length)
    if (!modes.some((m) => m.id === activeId)) {
      useUi.setState({ mode: 'notes', pluginModes: modes })
      return
    }
  }
  useUi.setState({ pluginModes: modes })
}

/** Bundled plugins register through the same surface, with direct module access. */
export function mountBundled(
  descriptor: PluginDescriptor,
  register: (sdk: HalPluginSdk) => void
): void {
  if (mounted.has(descriptor.id)) return
  const record: MountedPlugin = { descriptor, modes: new Map() }
  mounted.set(descriptor.id, record)
  try {
    register(makeSdk(descriptor))
  } catch (err) {
    console.error(`[plugins] bundled ${descriptor.id} failed to register:`, err)
    mounted.delete(descriptor.id)
  }
  syncModes()
}

/** Third-party: evaluate the plugin entry in a restricted scope with only the SDK passed in. */
export async function mountThirdParty(descriptor: PluginDescriptor): Promise<void> {
  if (mounted.has(descriptor.id)) return
  const record: MountedPlugin = { descriptor, modes: new Map() }
  mounted.set(descriptor.id, record)
  try {
    const code = await hal.pluginReadCode(descriptor.id)
    // eslint-disable-next-line no-new-func
    const factory = new Function('halPlugin', `"use strict";\n${code}`) as (sdk: HalPluginSdk) => void
    factory(makeSdk(descriptor))
  } catch (err) {
    console.error(`[plugins] ${descriptor.id} failed to load:`, err)
    unmountPlugin(descriptor.id)
    return
  }
  syncModes()
}

export function unmountPlugin(id: string): void {
  const m = mounted.get(id)
  if (!m) return
  m.styleEl?.remove()
  mounted.delete(id)
  syncModes()
}

export function getMountedPluginIds(): string[] {
  return [...mounted.keys()]
}

/** Mounts a plugin mode's UI into the container the host renders for it; returns the mode's cleanup. */
export function mountModeInto(modeId: string, container: HTMLElement): (() => void) | void {
  for (const m of mounted.values()) {
    const def = m.modes.get(modeId)
    if (def) return def.mount(container)
  }
}

/** React root helper for bundled plugins that mount React trees. */
export function reactMount(container: HTMLElement, render: () => import('react').ReactNode): { root: Root } {
  const root = createRoot(container)
  root.render(render())
  return { root }
}
