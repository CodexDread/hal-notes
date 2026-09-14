import { randomUUID } from 'crypto'
import type { Citation } from '@shared/types'
import { getDb } from '../store/db'

// askHal returns its own citation shape; map to the wire Citation type.
type RawCitation = { index: number; id: string; name: string; path: string }

const mapCitations = (cs: unknown): Citation[] =>
  (Array.isArray(cs) ? cs : []).map((c) => {
    const r = c as RawCitation
    return { index: r.index, noteId: r.id, name: r.name, path: r.path }
  })

export interface HalChatHistoryMessage {
  id: string
  role: 'user' | 'hal'
  text: string
  citations: Citation[]
  createdAt: number
}

interface HistoryRow {
  id: string
  role: string
  text: string
  citations_json: string
  created_at: number
}

function toMessage(r: HistoryRow): HalChatHistoryMessage {
  let citations: Citation[] = []
  try {
    citations = mapCitations(JSON.parse(r.citations_json))
  } catch {
    citations = []
  }
  return { id: r.id, role: r.role === 'user' ? 'user' : 'hal', text: r.text, citations, createdAt: r.created_at }
}

export function appendChatHistory(role: 'user' | 'hal', text: string, rawCitations: unknown = []): HalChatHistoryMessage {
  const citations = mapCitations(rawCitations)
  const id = randomUUID()
  const now = Date.now()
  getDb()
    .prepare('INSERT INTO hal_chat_history (id, role, text, citations_json, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(id, role, text, JSON.stringify(citations), now)
  return { id, role, text, citations, createdAt: now }
}

export function loadChatHistory(limit = 200): HalChatHistoryMessage[] {
  return getDb()
    .prepare<[number], HistoryRow>('SELECT * FROM hal_chat_history ORDER BY created_at DESC LIMIT ?')
    .all(limit)
    .reverse()
    .map(toMessage)
}

export function clearChatHistory(): void {
  getDb().exec('DELETE FROM hal_chat_history')
}
