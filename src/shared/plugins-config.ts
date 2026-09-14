/** Plugin configuration schema + merge (pure — unit-tested). */

export interface PluginConfigField {
  key: string
  label: string
  type: 'select' | 'toggle'
  options?: { value: string | number; label: string }[]
  defaultValue: string | number | boolean
  hint?: string
}

export type PluginConfigValues = Record<string, string | number | boolean>

/** Applies schema defaults to stored values; unknown stored keys pass through untouched. */
export function mergePluginConfig(schema: PluginConfigField[], values: PluginConfigValues | undefined): PluginConfigValues {
  const out: PluginConfigValues = { ...(values ?? {}) }
  for (const field of schema) {
    if (out[field.key] === undefined) out[field.key] = field.defaultValue
  }
  return out
}

export function pluginConfigNumber(fields: PluginConfigField[], values: PluginConfigValues | undefined, key: string): number {
  const merged = mergePluginConfig(fields, values)
  const v = merged[key]
  return typeof v === 'number' ? v : Number(v) || 0
}
