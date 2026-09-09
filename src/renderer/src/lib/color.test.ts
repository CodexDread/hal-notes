import { describe, expect, it } from 'vitest'
import { accentRamp, hexToHsl } from './color'

const HEX_RE = /^#[0-9a-f]{6}$/i

describe('hexToHsl', () => {
  it('parses violet-500', () => {
    const [h, s, l] = hexToHsl('#8b5cf6')
    expect(Math.round(h)).toBe(258)
    expect(s).toBeGreaterThan(0.7)
    expect(l).toBeGreaterThan(0.55)
    expect(l).toBeLessThan(0.7)
  })

  it('parses black and white', () => {
    expect(hexToHsl('#000000')[2]).toBe(0)
    expect(hexToHsl('#ffffff')[2]).toBe(1)
  })

  it('falls back to violet on garbage input', () => {
    const [h, s] = hexToHsl('not-a-color')
    expect(Math.round(h)).toBe(258)
    expect(s).toBeGreaterThan(0.7)
  })

  it('accepts with or without # prefix', () => {
    expect(hexToHsl('8b5cf6')).toEqual(hexToHsl('#8b5cf6'))
  })
})

describe('accentRamp', () => {
  it('produces five valid hex shades', () => {
    const ramp = accentRamp('#3b82f6', 'dark')
    for (const shade of ['100', '200', '300', '400', '500'] as const) {
      expect(ramp[shade]).toMatch(HEX_RE)
    }
  })

  it('dark theme ramps go lighter as the shade number drops', () => {
    const ramp = accentRamp('#14b8a6', 'dark')
    const L = (hex: string): number => hexToHsl(hex)[2]
    expect(L(ramp['100'])).toBeGreaterThan(L(ramp['300']))
    expect(L(ramp['300'])).toBeGreaterThan(L(ramp['500']))
  })

  it('light theme ramps go darker as the shade number drops', () => {
    const ramp = accentRamp('#14b8a6', 'light')
    const L = (hex: string): number => hexToHsl(hex)[2]
    expect(L(ramp['100'])).toBeLessThan(L(ramp['300']))
    expect(L(ramp['300'])).toBeLessThan(L(ramp['500']))
  })

  it('keeps the hue of the picked color', () => {
    const [hue] = hexToHsl('#f43f5e')
    for (const shade of ['100', '300', '500'] as const) {
      const [h] = hexToHsl(accentRamp('#f43f5e', 'dark')[shade])
      // Wrap-around-safe hue distance
      const d = Math.min(Math.abs(h - hue), 360 - Math.abs(h - hue))
      expect(d).toBeLessThan(2)
    }
  })
})
