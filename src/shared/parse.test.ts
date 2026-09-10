import { describe, expect, it } from 'vitest'
import { buildPath, isDescendantPath, normalizeName, parseTags, parseWikiLinks, sanitizeFileName, stripMdExtension } from './parse'

describe('parseWikiLinks', () => {
  it('parses simple links', () => {
    expect(parseWikiLinks('see [[My Note]] please')).toEqual([
      { target: 'My Note', display: 'My Note', hasHeading: false }
    ])
  })

  it('parses aliased links', () => {
    expect(parseWikiLinks('[[Target|shown text]]')).toEqual([
      { target: 'Target', display: 'shown text', hasHeading: false }
    ])
  })

  it('parses heading links and keeps the raw target as display', () => {
    expect(parseWikiLinks('[[Note#Section]]')).toEqual([
      { target: 'Note', display: 'Note#Section', hasHeading: true }
    ])
  })

  it('keeps explicit display over heading', () => {
    expect(parseWikiLinks('[[Note#Section|alias]]')).toEqual([
      { target: 'Note', display: 'alias', hasHeading: true }
    ])
  })

  it('ignores single brackets and empty links', () => {
    expect(parseWikiLinks('[not a link] [[]] [[ ]]')).toEqual([])
  })

  it('finds multiple links', () => {
    const links = parseWikiLinks('[[A]] mid [[B|b]] end')
    expect(links.map((l) => l.target)).toEqual(['A', 'B'])
  })
})

describe('parseTags', () => {
  it('collects unique tags', () => {
    expect(parseTags('#one text #two and #one')).toEqual(['one', 'two'])
  })

  it('requires tag start after whitespace or start of text', () => {
    expect(parseTags('mid#word')).toEqual([])
  })

  it('supports hierarchical tags', () => {
    expect(parseTags('#project/hal-notes')).toEqual(['project/hal-notes'])
  })

  it('ignores markdown headings', () => {
    expect(parseTags('# Heading\n#real')).toEqual(['real'])
  })
})

describe('path helpers', () => {
  it('buildPath joins with slash', () => {
    expect(buildPath('Journal/2026', 'my-note')).toBe('Journal/2026/my-note')
    expect(buildPath(null, 'root')).toBe('root')
  })

  it('isDescendantPath guards cycles by path prefix', () => {
    expect(isDescendantPath('A/B/C', 'A')).toBe(true)
    expect(isDescendantPath('A', 'A')).toBe(true)
    expect(isDescendantPath('A/B', 'A/B')).toBe(true)
    expect(isDescendantPath('About', 'Ab')).toBe(false)
    expect(isDescendantPath('Journal/2026', 'Research')).toBe(false)
    expect(isDescendantPath('Research/plans', 'Research/plans2')).toBe(false)
  })

  it('sanitizeFileName strips filesystem-hostile characters', () => {
    expect(sanitizeFileName('a/b:c*d?"<>|')).toBe('a-b-c-d-----')
    expect(sanitizeFileName('  spaced   name ')).toBe('spaced name')
  })

  it('stripMdExtension removes only trailing .md', () => {
    expect(stripMdExtension('Note.md')).toBe('Note')
    expect(stripMdExtension('Note.MD')).toBe('Note')
    expect(stripMdExtension('readme.md.txt')).toBe('readme.md.txt')
  })

  it('normalizeName lowercases and trims', () => {
    expect(normalizeName('  My Note ')).toBe('my note')
  })
})
