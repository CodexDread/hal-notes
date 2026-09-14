import { describe, expect, it } from 'vitest'
import { mergePluginConfig, pluginConfigNumber, type PluginConfigField } from './plugins-config'

const SCHEMA: PluginConfigField[] = [
  { key: 'cards', label: 'Cards', type: 'select', options: [{ value: 2, label: '2' }, { value: 4, label: '4' }], defaultValue: 4 },
  { key: 'autoSync', label: 'Auto sync', type: 'toggle', defaultValue: true },
  { key: 'mode', label: 'Mode', type: 'select', options: [{ value: 'fast', label: 'Fast' }], defaultValue: 'fast' }
]

describe('mergePluginConfig', () => {
  it('applies defaults when no values are stored', () => {
    expect(mergePluginConfig(SCHEMA, undefined)).toEqual({ cards: 4, autoSync: true, mode: 'fast' })
  })

  it('keeps stored values over defaults', () => {
    expect(mergePluginConfig(SCHEMA, { cards: 2, autoSync: false })).toEqual({ cards: 2, autoSync: false, mode: 'fast' })
  })

  it('passes through unknown stored keys untouched', () => {
    expect(mergePluginConfig(SCHEMA, { legacy: 'x' })).toMatchObject({ legacy: 'x' })
  })

  it('fills defaults for partially stored keys', () => {
    expect(mergePluginConfig(SCHEMA, { cards: 2 })).toEqual({ cards: 2, autoSync: true, mode: 'fast' })
  })
})

describe('pluginConfigNumber', () => {
  it('reads numbers', () => {
    expect(pluginConfigNumber(SCHEMA, { cards: 2 }, 'cards')).toBe(2)
  })

  it('coerces numeric strings and falls back to 0 on garbage', () => {
    expect(pluginConfigNumber(SCHEMA, { cards: '9' }, 'cards')).toBe(9)
    expect(pluginConfigNumber(SCHEMA, { cards: 'nope' }, 'cards')).toBe(0)
  })

  it('uses the default when absent', () => {
    expect(pluginConfigNumber(SCHEMA, undefined, 'cards')).toBe(4)
  })
})
