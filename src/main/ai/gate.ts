import { getSettings } from '../store/settings'
import { aiActiveReady, providerReady, resolveProvider } from './router'

/**
 * The single AI gate: no key registered → every AI surface is off; key present →
 * the master toggle decides (default on). Implements the D19/D22 policy:
 * AI is a toggleable capability, not a tenant.
 */
export function aiFeatureEnabled(): boolean {
  if (!aiActiveReady()) return false
  return getSettings().aiEnabled ?? true
}

/** True when any provider key exists (used to show the toggle in settings). */
export function anyProviderKeySet(): boolean {
  if (providerReady('google')) return true
  for (const id of ['openai', 'anthropic', 'openrouter'] as const) {
    if (providerReady(id)) return true
  }
  return resolveProvider('custom').apiKey.length > 0
}
