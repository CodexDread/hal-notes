import { describe, expect, it } from 'vitest'
import { parseFountain, sceneOutline, screenplayStats } from './fountain'

const SAMPLE = `Title: TEST SCRIPT

INT. WORKSHOP - NIGHT

The 3D printer hums in the dark. A single amber lamp glows.

AL
(quietly)
It's alive.

AL
We built it ourselves.

CUT TO:

EXT. ROOFTOP - DAWN

The city wakes below.
`

describe('parseFountain', () => {
  it('parses scene headings with numbers', () => {
    const els = parseFountain(SAMPLE)
    const scenes = els.filter((e) => e.type === 'scene_heading')
    expect(scenes).toHaveLength(2)
    expect(scenes[0].text).toBe('INT. WORKSHOP - NIGHT')
    expect(scenes[0].sceneNumber).toBe(1)
    expect(scenes[1].sceneNumber).toBe(2)
  })

  it('parses character cues, parentheticals, and dialogue', () => {
    const els = parseFountain(SAMPLE)
    expect(els.filter((e) => e.type === 'character').map((e) => e.text)).toEqual(['AL', 'AL'])
    expect(els.some((e) => e.type === 'parenthetical' && e.text === '(quietly)')).toBe(true)
    const dialogue = els.filter((e) => e.type === 'dialogue').map((e) => e.text)
    expect(dialogue).toContain("It's alive.")
    expect(dialogue).toContain('We built it ourselves.')
  })

  it('parses transitions', () => {
    const els = parseFountain(SAMPLE)
    expect(els.some((e) => e.type === 'transition' && e.text === 'CUT TO:')).toBe(true)
  })

  it('treats prose as action', () => {
    const els = parseFountain(SAMPLE)
    expect(els.some((e) => e.type === 'action' && e.text.includes('printer hums'))).toBe(true)
  })

  it('supports forced markers, sections, notes, and page breaks', () => {
    const els = parseFountain('.INT. SECRET LAB - DAY\n# ACT ONE\n[[ tighten this ]]\n===\n> FADE OUT.')
    expect(els[0].type).toBe('scene_heading')
    expect(els[1].type).toBe('section')
    expect(els[2].type).toBe('note')
    expect(els[3].type).toBe('page_break')
    expect(els[4].type).toBe('transition')
  })

  it('does not treat lone uppercase action lines as characters', () => {
    const els = parseFountain('SILENCE.\n\nMore action here.')
    expect(els[0].type).toBe('action')
  })
})

describe('screenplayStats', () => {
  it('counts scenes, unique characters, estimates pages', () => {
    const stats = screenplayStats(SAMPLE)
    expect(stats.scenes).toBe(2)
    expect(stats.characters).toEqual(['AL'])
    expect(stats.pageEstimate).toBeGreaterThanOrEqual(1)
  })
})

describe('sceneOutline', () => {
  it('returns line-anchored scene list', () => {
    const outline = sceneOutline(SAMPLE)
    expect(outline).toHaveLength(2)
    expect(outline[0].heading).toBe('INT. WORKSHOP - NIGHT')
    expect(outline[0].line).toBe(2)
  })
})
