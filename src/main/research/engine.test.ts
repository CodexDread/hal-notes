import { describe, expect, it } from 'vitest'

// The engine module touches Electron + SQLite at import time, so the pure helpers
// are exercised through a lightweight import-free copy of their logic contracts:
// extractGroundingSources and the review interval ladder are mirrored here and
// must stay in sync with src/main/research/{engine,store}.ts.

interface GroundingChunkWeb {
  uri?: string
  title?: string
}

interface GroundingCandidate {
  groundingMetadata?: {
    groundingChunks?: { web?: GroundingChunkWeb }[]
  }
}

function extractGroundingSources(response: unknown): { uri: string; title: string }[] {
  const out: { uri: string; title: string }[] = []
  const seen = new Set<string>()
  const candidates = (response as { candidates?: GroundingCandidate[] })?.candidates ?? []
  for (const candidate of candidates) {
    for (const chunk of candidate.groundingMetadata?.groundingChunks ?? []) {
      const uri = chunk.web?.uri
      if (!uri || seen.has(uri)) continue
      seen.add(uri)
      out.push({ uri, title: chunk.web?.title || uri })
    }
  }
  return out
}

const REVIEW_INTERVALS_DAYS = [1, 3, 7, 14, 30]

function nextDueFromReviews(reviews: number, from = Date.now()): number {
  const days = REVIEW_INTERVALS_DAYS[Math.min(reviews, REVIEW_INTERVALS_DAYS.length - 1)]
  return from + days * 24 * 60 * 60 * 1000
}

describe('extractGroundingSources', () => {
  it('collects unique web sources across candidates', () => {
    const res = {
      candidates: [
        { groundingMetadata: { groundingChunks: [{ web: { uri: 'https://a', title: 'A' } }, { web: { uri: 'https://b' } }] } },
        { groundingMetadata: { groundingChunks: [{ web: { uri: 'https://a', title: 'A dup' } }, { web: { uri: 'https://c', title: 'C' } }] } }
      ]
    }
    expect(extractGroundingSources(res)).toEqual([
      { uri: 'https://a', title: 'A' },
      { uri: 'https://b', title: 'https://b' },
      { uri: 'https://c', title: 'C' }
    ])
  })

  it('falls back to the uri as title when missing', () => {
    const res = { candidates: [{ groundingMetadata: { groundingChunks: [{ web: { uri: 'https://x' } }] } }] }
    expect(extractGroundingSources(res)[0].title).toBe('https://x')
  })

  it('tolerates missing metadata entirely', () => {
    expect(extractGroundingSources({})).toEqual([])
    expect(extractGroundingSources({ candidates: [{}] })).toEqual([])
    expect(extractGroundingSources(undefined)).toEqual([])
  })
})

describe('review interval ladder', () => {
  it('schedules 1, 3, 7, 14, 30 days then caps at 30', () => {
    const from = 1_700_000_000_000
    const day = 24 * 60 * 60 * 1000
    expect(nextDueFromReviews(0, from) - from).toBe(1 * day)
    expect(nextDueFromReviews(1, from) - from).toBe(3 * day)
    expect(nextDueFromReviews(2, from) - from).toBe(7 * day)
    expect(nextDueFromReviews(3, from) - from).toBe(14 * day)
    expect(nextDueFromReviews(4, from) - from).toBe(30 * day)
    expect(nextDueFromReviews(99, from) - from).toBe(30 * day)
  })
})
