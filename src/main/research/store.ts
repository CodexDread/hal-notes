import { randomUUID } from 'crypto'
import type {
  CardProgress,
  LearningPath,
  PathStatus,
  ResearchChatMessage,
  ResearchCitation,
  ResearchNotebook,
  ResearchNotebookDetail,
  ResearchPath,
  ResearchSource
} from '@shared/types'
import { getDb } from '../store/db'

export interface NotebookRow {
  id: string
  name: string
  description: string
  created_at: number
  updated_at: number
}

export interface SourceRow {
  id: string
  notebook_id: string
  kind: 'web' | 'note'
  uri: string
  title: string
  gist: string
  added_by: 'you' | 'hal'
  embedding: Buffer | null
  added_at: number
}

export interface MessageRow {
  id: string
  notebook_id: string
  role: 'user' | 'hal'
  text: string
  citations_json: string
  created_at: number
}

export interface PathRow {
  id: string
  notebook_id: string
  question: string
  status: PathStatus
  path_json: string | null
  note_id: string | null
  error: string
  created_at: number
  updated_at: number
}

function toNotebook(r: NotebookRow): ResearchNotebook {
  return { id: r.id, name: r.name, description: r.description, createdAt: r.created_at, updatedAt: r.updated_at }
}

function toSource(r: SourceRow): ResearchSource {
  return {
    id: r.id,
    notebookId: r.notebook_id,
    kind: r.kind,
    uri: r.uri,
    title: r.title,
    gist: r.gist,
    addedBy: r.added_by,
    addedAt: r.added_at
  }
}

function toMessage(r: MessageRow): ResearchChatMessage {
  let citations: ResearchCitation[] = []
  try {
    citations = JSON.parse(r.citations_json) as ResearchCitation[]
  } catch {
    citations = []
  }
  return { id: r.id, role: r.role, text: r.text, citations, createdAt: r.created_at }
}

export function toPath(r: PathRow): ResearchPath {
  let path: LearningPath | null = null
  if (r.path_json) {
    try {
      path = JSON.parse(r.path_json) as LearningPath
    } catch {
      path = null
    }
  }
  return {
    id: r.id,
    notebookId: r.notebook_id,
    question: r.question,
    status: r.status,
    path,
    noteId: r.note_id,
    error: r.error,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  }
}

export function listNotebooks(): ResearchNotebook[] {
  return getDb()
    .prepare<[], NotebookRow>('SELECT * FROM research_notebooks ORDER BY updated_at DESC')
    .all()
    .map(toNotebook)
}

export function createNotebook(name: string): ResearchNotebook {
  const id = randomUUID()
  const now = Date.now()
  getDb()
    .prepare('INSERT INTO research_notebooks (id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
    .run(id, name.trim() || 'New notebook', '', now, now)
  return toNotebook(getDb().prepare<[string], NotebookRow>('SELECT * FROM research_notebooks WHERE id = ?').get(id)!)
}

export function renameNotebook(id: string, name: string): void {
  getDb().prepare('UPDATE research_notebooks SET name = ?, updated_at = ? WHERE id = ?').run(name.trim(), Date.now(), id)
}

export function deleteNotebook(id: string): void {
  getDb().prepare('DELETE FROM research_notebooks WHERE id = ?').run(id)
}

export function getNotebookDetail(id: string): ResearchNotebookDetail | null {
  const row = getDb().prepare<[string], NotebookRow>('SELECT * FROM research_notebooks WHERE id = ?').get(id)
  if (!row) return null
  return {
    notebook: toNotebook(row),
    sources: getDb()
      .prepare<[string], SourceRow>('SELECT * FROM research_sources WHERE notebook_id = ? ORDER BY added_at DESC')
      .all(id)
      .map(toSource),
    messages: getDb()
      .prepare<[string], MessageRow>('SELECT * FROM research_messages WHERE notebook_id = ? ORDER BY created_at')
      .all(id)
      .map(toMessage),
    paths: getDb()
      .prepare<[string], PathRow>('SELECT * FROM research_paths WHERE notebook_id = ? ORDER BY created_at DESC')
      .all(id)
      .map(toPath)
  }
}

export function getNotebookName(id: string): string {
  const row = getDb().prepare<[string], NotebookRow>('SELECT * FROM research_notebooks WHERE id = ?').get(id)
  return row?.name ?? 'Research'
}

export function addSource(opts: {
  notebookId: string
  kind: 'web' | 'note'
  uri: string
  title: string
  gist?: string
  addedBy?: 'you' | 'hal'
  embedding?: Float32Array | null
}): ResearchSource {
  const id = randomUUID()
  getDb()
    .prepare(
      `INSERT INTO research_sources (id, notebook_id, kind, uri, title, gist, added_by, embedding, added_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(notebook_id, kind, uri) DO UPDATE SET title = excluded.title, gist = excluded.gist`
    )
    .run(
      id,
      opts.notebookId,
      opts.kind,
      opts.uri,
      opts.title,
      opts.gist ?? '',
      opts.addedBy ?? 'you',
      opts.embedding ? Buffer.from(opts.embedding.buffer, opts.embedding.byteOffset, opts.embedding.byteLength) : null,
      Date.now()
    )
  const row = getDb()
    .prepare<[string, string, string], SourceRow>(
      'SELECT * FROM research_sources WHERE notebook_id = ? AND kind = ? AND uri = ?'
    )
    .get(opts.notebookId, opts.kind, opts.uri)!
  return toSource(row)
}

export function removeSource(sourceId: string): void {
  getDb().prepare('DELETE FROM research_sources WHERE id = ?').run(sourceId)
}

export function setSourceEmbedding(sourceId: string, vec: Float32Array): void {
  getDb()
    .prepare('UPDATE research_sources SET embedding = ? WHERE id = ?')
    .run(Buffer.from(vec.buffer, vec.byteOffset, vec.byteLength), sourceId)
}

export function getSourceRows(notebookId: string): SourceRow[] {
  return getDb().prepare<[string], SourceRow>('SELECT * FROM research_sources WHERE notebook_id = ?').all(notebookId)
}

export function addMessage(notebookId: string, role: 'user' | 'hal', text: string, citations: ResearchCitation[]): ResearchChatMessage {
  const id = randomUUID()
  const now = Date.now()
  getDb()
    .prepare('INSERT INTO research_messages (id, notebook_id, role, text, citations_json, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, notebookId, role, text, JSON.stringify(citations), now)
  return { id, role, text, citations, createdAt: now }
}

export function createPath(notebookId: string, question: string): ResearchPath {
  const id = randomUUID()
  const now = Date.now()
  getDb()
    .prepare(
      'INSERT INTO research_paths (id, notebook_id, question, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
    )
    .run(id, notebookId, question, 'assessing', now, now)
  return toPath(getDb().prepare<[string], PathRow>('SELECT * FROM research_paths WHERE id = ?').get(id)!)
}

export function updatePath(id: string, patch: { status?: PathStatus; path?: LearningPath | null; noteId?: string | null; error?: string }): void {
  const db = getDb()
  const sets: string[] = ['updated_at = ?']
  const vals: unknown[] = [Date.now()]
  if (patch.status !== undefined) {
    sets.push('status = ?')
    vals.push(patch.status)
  }
  if (patch.path !== undefined) {
    sets.push('path_json = ?')
    vals.push(patch.path ? JSON.stringify(patch.path) : null)
  }
  if (patch.noteId !== undefined) {
    sets.push('note_id = ?')
    vals.push(patch.noteId)
  }
  if (patch.error !== undefined) {
    sets.push('error = ?')
    vals.push(patch.error)
  }
  vals.push(id)
  db.prepare(`UPDATE research_paths SET ${sets.join(', ')} WHERE id = ?`).run(...vals)
}

export function getPathRow(pathId: string): PathRow | undefined {
  return getDb().prepare<[string], PathRow>('SELECT * FROM research_paths WHERE id = ?').get(pathId)
}

interface ProgressRow {
  path_id: string
  card_index: number
  state: CardProgress['state']
  attempts: number
  reviews: number
  last_answer: string
  last_feedback: string
  next_due: number | null
  updated_at: number
}

function toProgress(r: ProgressRow): CardProgress {
  return {
    pathId: r.path_id,
    cardIndex: r.card_index,
    state: r.state,
    attempts: r.attempts,
    reviews: r.reviews,
    lastAnswer: r.last_answer,
    lastFeedback: r.last_feedback,
    nextDue: r.next_due,
    updatedAt: r.updated_at
  }
}

export function initCardProgress(pathId: string, cardCount: number): void {
  const db = getDb()
  db.transaction(() => {
    const stmt = db.prepare(
      'INSERT OR IGNORE INTO research_card_progress (path_id, card_index, state, updated_at) VALUES (?, ?, ?, ?)'
    )
    for (let i = 0; i < cardCount; i++) {
      stmt.run(pathId, i, i === 0 ? 'active' : 'locked', Date.now())
    }
  })()
}

export function getProgress(pathId: string): CardProgress[] {
  return getDb()
    .prepare<[string], ProgressRow>('SELECT * FROM research_card_progress WHERE path_id = ? ORDER BY card_index')
    .all(pathId)
    .map(toProgress)
}

export function updateCardProgress(
  pathId: string,
  cardIndex: number,
  patch: { state?: CardProgress['state']; attempts?: number; reviews?: number; lastAnswer?: string; lastFeedback?: string; nextDue?: number | null }
): CardProgress {
  const db = getDb()
  const current = db
    .prepare<[string, number], ProgressRow>('SELECT * FROM research_card_progress WHERE path_id = ? AND card_index = ?')
    .get(pathId, cardIndex)
  if (!current) throw new Error(`No card progress for ${pathId}#${cardIndex}`)
  const next = {
    state: patch.state ?? current.state,
    attempts: patch.attempts ?? current.attempts,
    reviews: patch.reviews ?? current.reviews,
    lastAnswer: patch.lastAnswer ?? current.last_answer,
    lastFeedback: patch.lastFeedback ?? current.last_feedback,
    nextDue: patch.nextDue !== undefined ? patch.nextDue : current.next_due
  }
  db.prepare(
    `UPDATE research_card_progress SET state = ?, attempts = ?, reviews = ?, last_answer = ?, last_feedback = ?, next_due = ?, updated_at = ?
     WHERE path_id = ? AND card_index = ?`
  ).run(next.state, next.attempts, next.reviews, next.lastAnswer, next.lastFeedback, next.nextDue, Date.now(), pathId, cardIndex)
  return toProgress({ ...current, ...next, updated_at: Date.now() })
}

/** Days-until-review intervals after each successful engagement. */
export const REVIEW_INTERVALS_DAYS = [1, 3, 7, 14, 30]

export function nextDueFromReviews(reviews: number, from = Date.now()): number {
  const days = REVIEW_INTERVALS_DAYS[Math.min(reviews, REVIEW_INTERVALS_DAYS.length - 1)]
  return from + days * 24 * 60 * 60 * 1000
}

export function dueCards(notebookId: string): { progress: CardProgress; path: ResearchPath }[] {
  const progressRows = getDb()
    .prepare<[string, number], ProgressRow>(
      `SELECT p.* FROM research_card_progress p
       JOIN research_paths r ON r.id = p.path_id
       WHERE r.notebook_id = ? AND p.next_due IS NOT NULL AND p.next_due <= ?`
    )
    .all(notebookId, Date.now())
  const pathStmt = getDb().prepare<[string], PathRow>('SELECT * FROM research_paths WHERE id = ?')
  const out: { progress: CardProgress; path: ResearchPath }[] = []
  for (const pr of progressRows) {
    const row = pathStmt.get(pr.path_id)
    if (row) out.push({ progress: toProgress(pr), path: toPath(row) })
  }
  return out.sort((a, b) => (a.progress.nextDue ?? 0) - (b.progress.nextDue ?? 0))
}

/** Due research check-ins across every notebook, for the vault-wide review mode. */
export function dueCardsAll(): { progress: CardProgress; path: ResearchPath }[] {
  const progressRows = getDb()
    .prepare<[number], ProgressRow>(
      `SELECT p.* FROM research_card_progress p
       WHERE p.next_due IS NOT NULL AND p.next_due <= ?`
    )
    .all(Date.now())
  const pathStmt = getDb().prepare<[string], PathRow>('SELECT * FROM research_paths WHERE id = ?')
  const out: { progress: CardProgress; path: ResearchPath }[] = []
  for (const pr of progressRows) {
    const row = pathStmt.get(pr.path_id)
    if (row) out.push({ progress: toProgress(pr), path: toPath(row) })
  }
  return out.sort((a, b) => (a.progress.nextDue ?? 0) - (b.progress.nextDue ?? 0))
}
