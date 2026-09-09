/** Tiny HSL helpers to derive a UI accent ramp from a single user-chosen color. */

export function hexToHsl(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return [258, 0.83, 0.63] // Tailwind violet-500
  const n = parseInt(m[1], 16)
  const r = ((n >> 16) & 255) / 255
  const g = ((n >> 8) & 255) / 255
  const b = (n & 255) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  let h = 0
  let s = 0
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
    else if (max === g) h = ((b - r) / d + 2) / 6
    else h = ((r - g) / d + 4) / 6
  }
  return [h * 360, s, l]
}

function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const hp = h / 60
  const x = c * (1 - Math.abs((hp % 2) - 1))
  let [r, g, b] = [0, 0, 0]
  if (hp < 1) [r, g, b] = [c, x, 0]
  else if (hp < 2) [r, g, b] = [x, c, 0]
  else if (hp < 3) [r, g, b] = [0, c, x]
  else if (hp < 4) [r, g, b] = [0, x, c]
  else if (hp < 5) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  const m = l - c / 2
  const to255 = (v: number): number => Math.round((v + m) * 255)
  return `#${((1 << 24) | (to255(r) << 16) | (to255(g) << 8) | to255(b)).toString(16).slice(1)}`
}

export type AccentRamp = Record<'100' | '200' | '300' | '400' | '500', string>

/**
 * Lightness targets per shade, tuned for contrast against each base theme.
 * Hue and saturation carry over from the picked color.
 */
function targets(theme: 'dark' | 'light'): Record<keyof AccentRamp, number> {
  return theme === 'dark'
    ? { '100': 0.9, '200': 0.82, '300': 0.74, '400': 0.66, '500': 0.58 }
    : { '100': 0.22, '200': 0.3, '300': 0.38, '400': 0.44, '500': 0.5 }
}

export function accentRamp(hex: string, theme: 'dark' | 'light'): AccentRamp {
  const [h, s] = hexToHsl(hex)
  // Nudge very washed-out picks toward a usable saturation, but let grays stay gray.
  const sat = s < 0.12 ? s : Math.min(1, Math.max(0.35, s))
  const t = targets(theme)
  const out = {} as AccentRamp
  for (const shade of Object.keys(t) as (keyof AccentRamp)[]) {
    out[shade] = hslToHex(h, sat, t[shade])
  }
  return out
}
