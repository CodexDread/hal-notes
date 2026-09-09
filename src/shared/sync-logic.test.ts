import { describe, expect, it } from 'vitest'
import { computeSyncAction, conflictCopyName, ftsQuery, isLocalId } from './sync-logic'

const A = 'aaa'
const B = 'bbb'
const C = 'ccc'

describe('computeSyncAction', () => {
  it('clean when both sides match the ancestor', () => {
    expect(computeSyncAction(A, A, A)).toBe('clean')
  })

  it('push when only local changed', () => {
    expect(computeSyncAction(B, A, A)).toBe('push')
  })

  it('pull when only remote changed', () => {
    expect(computeSyncAction(A, A, B)).toBe('pull')
  })

  it('conflict when both changed differently', () => {
    expect(computeSyncAction(B, A, C)).toBe('conflict')
  })

  it('treats missing remote hash as unchanged', () => {
    expect(computeSyncAction(B, A, null)).toBe('push')
    expect(computeSyncAction(A, A, null)).toBe('clean')
  })

  it('clean when both changed to the same content', () => {
    expect(computeSyncAction(B, A, B)).toBe('clean')
  })
})

describe('conflictCopyName', () => {
  it('appends a stamp', () => {
    const name = conflictCopyName('Ideas', new Date(2026, 8, 9, 14, 5))
    expect(name).toBe('Ideas (conflict 2026-09-09 14-05)')
  })

  it('does not stack stamps on an existing conflict copy', () => {
    const once = conflictCopyName('Ideas', new Date(2026, 8, 9, 14, 5))
    const twice = conflictCopyName(once, new Date(2026, 8, 9, 15, 0))
    expect(twice).toBe('Ideas (conflict 2026-09-09 15-00)')
  })
})

describe('isLocalId', () => {
  it('recognizes local- prefixed ids', () => {
    expect(isLocalId('local-abc')).toBe(true)
    expect(isLocalId('1a2b3c4d5e')).toBe(false)
  })
})

describe('ftsQuery', () => {
  it('wraps tokens as prefix-quoted terms joined by AND', () => {
    expect(ftsQuery('garden project')).toBe('"garden"* AND "project"*')
  })

  it('escapes embedded quotes', () => {
    expect(ftsQuery('a"b')).toBe('"a""b"*')
  })

  it('caps the number of tokens', () => {
    const parts = ftsQuery('one two three four five six seven eight nine ten').split(' AND ')
    expect(parts.length).toBe(8)
  })

  it('returns a harmless match-all-ish term for empty input', () => {
    expect(ftsQuery('   ')).toBe('""')
  })
})
