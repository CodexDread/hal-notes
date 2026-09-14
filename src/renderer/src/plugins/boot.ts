import type { PluginDescriptor } from '@shared/types'
import { hal } from '@/lib/ipc'
import { mountBundled, mountThirdParty, unmountPlugin } from './host'
import { registerResearchPlugin } from './bundled/research'
import { registerReviewPlugin } from './bundled/review'
import { registerScreenplayPlugin } from './bundled/screenplay'

const BUNDLED_REGISTRARS: Record<string, (sdk: import('./host').HalPluginSdk) => void> = {
  'hal.research': registerResearchPlugin,
  'hal.review': registerReviewPlugin,
  'hal.screenplay': registerScreenplayPlugin
}

let booted = false

/** Called once after settings load: mounts enabled bundled plugins and loads enabled third-party ones. */
export async function initPluginSystem(): Promise<void> {
  if (booted) return
  booted = true

  const list = await hal.pluginsList().catch(() => [] as PluginDescriptor[])
  for (const p of list) {
    if (!p.enabled) continue
    if (p.bundled) {
      mountBundled(p, (sdk) => BUNDLED_REGISTRARS[p.id]?.(sdk))
    } else {
      await mountThirdParty(p)
    }
  }

  hal.on('plugins:changed', () => void syncPlugins())
}

/** Reconciles mounted plugins against the registry after any enable/disable/install/remove. */
async function syncPlugins(): Promise<void> {
  const list = await hal.pluginsList().catch(() => [] as PluginDescriptor[])
  for (const p of list) {
    if (p.enabled && !isMounted(p.id)) {
      if (p.bundled) mountBundled(p, (sdk) => BUNDLED_REGISTRARS[p.id]?.(sdk))
      else await mountThirdParty(p)
    }
    if (!p.enabled && isMounted(p.id)) {
      unmountPlugin(p.id)
    }
  }
  for (const id of getMountedIds()) {
    if (!list.some((p) => p.id === id && p.enabled)) unmountPlugin(id)
  }
}

function isMounted(id: string): boolean {
  return getMountedIds().includes(id)
}

function getMountedIds(): string[] {
  // host exports this; re-imported here to avoid a cycle in the sync path
  return mountedIds()
}

import { getMountedPluginIds as mountedIds } from './host'
