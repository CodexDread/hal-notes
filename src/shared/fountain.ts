/** Fountain screenplay parsing — pure functions, unit-tested. */

export type FountainElementType =
  | 'scene_heading'
  | 'action'
  | 'character'
  | 'dialogue'
  | 'parenthetical'
  | 'transition'
  | 'centered'
  | 'section'
  | 'synopsis'
  | 'note'
  | 'page_break'

export interface FountainElement {
  type: FountainElementType
  text: string
  /** 1-based scene number for scene headings. */
  sceneNumber?: number
}

const TRANSITIONS = ['CUT TO:', 'DISSOLVE TO:', 'SMASH CUT TO:', 'FADE IN:', 'FADE OUT.', 'FADE TO BLACK.', 'MATCH CUT TO:', 'INTERCUT WITH:', 'BACK TO:', 'TIME CUT:']

const isUppercaseLine = (line: string): boolean => {
  const letters = line.replace(/[^A-Za-z]/g, '')
  return letters.length > 0 && letters === letters.toUpperCase()
}

/** Parses fountain text into typed elements. Handles the common subset: scene
 * headings (INT./EXT. or forced .), transitions (forced > or known list),
 * character cues (uppercase lines preceded by blank, followed by dialogue),
 * parentheticals, sections (#), synopses (=), notes ([[ ]]), page breaks (===). */
export function parseFountain(text: string): FountainElement[] {
  const out: FountainElement[] = []
  const lines = text.split(/\r?\n/)
  let sceneCount = 0
  let prevBlank = true
  let prevType: FountainElementType | null = null

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    const line = raw.trim()

    if (line === '') {
      prevBlank = true
      prevType = null
      continue
    }

    // Page break
    if (/^={3,}$/.test(line)) {
      out.push({ type: 'page_break', text: line })
      prevBlank = false
      prevType = 'page_break'
      continue
    }

    // Note
    const note = /^\[\[(.+)\]\]$/.exec(line)
    if (note) {
      out.push({ type: 'note', text: note[1] })
      prevBlank = false
      prevType = 'note'
      continue
    }

    // Section / synopsis
    if (line.startsWith('#')) {
      out.push({ type: 'section', text: line.replace(/^#+\s*/, '') })
      prevBlank = false
      prevType = 'section'
      continue
    }
    if (line.startsWith('=')) {
      out.push({ type: 'synopsis', text: line.replace(/^=\s*/, '') })
      prevBlank = false
      prevType = 'synopsis'
      continue
    }

    // Forced markers
    if (line.startsWith('.') && !line.startsWith('..')) {
      sceneCount++
      out.push({ type: 'scene_heading', text: line.slice(1).trim(), sceneNumber: sceneCount })
      prevBlank = false
      prevType = 'scene_heading'
      continue
    }
    if (line.startsWith('>')) {
      const t = line.replace(/^>\s*/, '').trim()
      out.push({ type: t.endsWith('<') ? 'centered' : 'transition', text: t.replace(/<$/, '').trim() })
      prevBlank = false
      prevType = 'transition'
      continue
    }

    // Scene heading by convention
    if (/^(INT\.?|EXT\.?|EST\.?|INT\.?\/EXT\.?|I\/E\.?)[\s\.]/i.test(line)) {
      sceneCount++
      out.push({ type: 'scene_heading', text: line.toUpperCase(), sceneNumber: sceneCount })
      prevBlank = false
      prevType = 'scene_heading'
      continue
    }

    // Transition by known list (uppercase line ending in TO:)
    if (TRANSITIONS.includes(line.toUpperCase()) || /^[A-Z ]+ TO:$/.test(line)) {
      out.push({ type: 'transition', text: line.toUpperCase() })
      prevBlank = false
      prevType = 'transition'
      continue
    }

    // Parenthetical
    if (line.startsWith('(') && line.endsWith(')')) {
      out.push({ type: 'parenthetical', text: line })
      prevBlank = false
      prevType = 'parenthetical'
      continue
    }

    // Character cue: uppercase line after blank, with a following non-blank line
    if (prevBlank && isUppercaseLine(line)) {
      const next = (lines[i + 1] ?? '').trim()
      const nextNext = (lines[i + 2] ?? '').trim()
      const followedByDialogue = next !== '' && (!next.startsWith('(') || nextNext !== '')
      if (followedByDialogue) {
        out.push({ type: 'character', text: line })
        prevBlank = false
        prevType = 'character'
        continue
      }
    }

    // Dialogue continues after character/parenthetical
    if (prevType === 'character' || prevType === 'parenthetical' || prevType === 'dialogue') {
      out.push({ type: 'dialogue', text: raw })
      prevBlank = false
      prevType = 'dialogue'
      continue
    }

    out.push({ type: 'action', text: raw })
    prevBlank = false
    prevType = 'action'
  }

  return out
}

export interface ScreenplayStats {
  scenes: number
  characters: string[]
  pageEstimate: number
  words: number
}

export function screenplayStats(text: string, linesPerPage = 55): ScreenplayStats {
  const elements = parseFountain(text)
  const scenes = elements.filter((e) => e.type === 'scene_heading').length
  const characters = [
    ...new Set(
      elements
        .filter((e) => e.type === 'character')
        .map((e) => e.text.replace(/\s*\(.*\)\s*$/, '').trim())
        .filter(Boolean)
    )
  ].sort()
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '').length
  const words = text.split(/\s+/).filter(Boolean).length
  return { scenes, characters, pageEstimate: Math.max(1, Math.round(lines / linesPerPage)), words }
}

export interface SceneOutlineItem {
  sceneNumber: number
  heading: string
  /** Character positions in the source text of the first line of the scene. */
  line: number
}

export function sceneOutline(text: string): SceneOutlineItem[] {
  const out: SceneOutlineItem[] = []
  const lines = text.split(/\r?\n/)
  let sceneCount = 0
  lines.forEach((line, i) => {
    const t = line.trim()
    if (/^(INT\.?|EXT\.?|EST\.?|INT\.?\/EXT\.?|I\/E\.?)[\s\.]/i.test(t) || (t.startsWith('.') && !t.startsWith('..'))) {
      sceneCount++
      out.push({ sceneNumber: sceneCount, heading: t.replace(/^\./, '').toUpperCase(), line: i })
    }
  })
  return out
}
