import type { SearchHit } from '@shared/types'
import { bus } from '../events'
import { getDb, getMeta, setMeta } from '../store/db'
import { getNoteRow, searchText } from '../store/notes'
import { aiEmbed, embeddingReady, embeddingSignature } from './router'

const BATCH = 16
const EMBED_DEBOUNCE_MS = 15_000

async function embedTexts(texts: string[], taskType: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY'): Promise<Float32Array[]> {
  return aiEmbed(texts, { taskType })
}

/** Embeds a single text for features outside the vault index (e.g. research sources). Returns null on failure. */
export async function embedSingle(text: string): Promise<Float32Array | null> {
  try {
    return (await aiEmbed([text], { taskType: 'RETRIEVAL_QUERY' }))[0] ?? null
  } catch (err) {
    console.error('[embed] single embedding failed:', err)
    return null
  }
}

function noteEmbeddingText(name: string, content: string): string {
  const body = content.length > 8_000 ? `${content.slice(0, 8_000)}…` : content
  return `${name}\n\n${body}`
}

/** Embeddings from different providers/models have different geometry — a change wipes the index. */
function ensureSignature(): void {
  const sig = embeddingSignature()
  const previous = getMeta('embedding_sig')
  if (previous === sig) return
  if (previous === null) {
    // First run after the router landed: the existing index was built by the
    // pre-router Google defaults, so stamp it rather than destroying it.
    setMeta('embedding_sig', sig)
    return
  }
  getDb().exec('DELETE FROM embeddings')
  setMeta('embedding_sig', sig)
  setMeta('embeddings_ready', '')
  console.log(`[embed] provider/model changed (${previous} → ${sig}) — semantic index cleared, rebuild needed`)
  bus.emit('embed:progress', { done: 0, total: 0 })
}

interface BacklogRow {
  id: string
  name: string
  content: string
}

function backlog(): BacklogRow[] {
  return getDb()
    .prepare(
      `SELECT n.id, n.name, n.content FROM notes n
       LEFT JOIN embeddings e ON e.note_id = n.id
       WHERE n.trashed = 0 AND (e.note_id IS NULL OR e.updated_at < n.updated_at)
       ORDER BY n.updated_at DESC`
    )
    .all() as BacklogRow[]
}

function setEmbedding(id: string, vec: Float32Array): void {
  getDb()
    .prepare(
      `INSERT INTO embeddings (note_id, vec, dim, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(note_id) DO UPDATE SET vec = excluded.vec, dim = excluded.dim, updated_at = excluded.updated_at`
    )
    .run(id, Buffer.from(vec.buffer, vec.byteOffset, vec.byteLength), vec.length, Date.now())
}

export function embeddingsReady(): boolean {
  return getMeta('embeddings_ready') === '1'
}

export async function backfillEmbeddings(): Promise<void> {
  ensureSignature()
  if (!embeddingReady()) throw new Error('The embedding provider has no API key set')
  const rows = backlog()
  bus.emit('embed:progress', { done: 0, total: rows.length })
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH)
    const vectors = await embedTexts(slice.map((r) => noteEmbeddingText(r.name, r.content)), 'RETRIEVAL_DOCUMENT')
    slice.forEach((r, j) => {
      if (vectors[j]) setEmbedding(r.id, vectors[j])
    })
    bus.emit('embed:progress', { done: Math.min(i + BATCH, rows.length), total: rows.length })
  }
  setMeta('embeddings_ready', '1')
  bus.emit('embed:progress', { done: rows.length, total: rows.length })
}

export function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0
  let na = 0
  let nb = 0
  const len = Math.min(a.length, b.length)
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  if (na === 0 || nb === 0) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

/** Hybrid retrieval: cosine similarity fused with FTS-5 keyword ranks via reciprocal-rank fusion. */
export async function semanticSearch(query: string, limit = 20): Promise<SearchHit[]> {
  ensureSignature()
  const qVec = (await embedTexts([query], 'RETRIEVAL_QUERY'))[0]

  const embedRows = getDb()
    .prepare('SELECT note_id, vec FROM embeddings')
    .all() as { note_id: string; vec: Buffer }[]
  const scored = embedRows
    .map((r) => ({
      id: r.note_id,
      score: cosine(qVec, new Float32Array(r.vec.buffer, r.vec.byteOffset, r.vec.byteLength / 4))
    }))
    .filter((r) => r.score > 0.05)
    .sort((a, b) => b.score - a.score)
    .slice(0, 50)

  const fts = searchText(query, 50)

  const fused = new Map<string, number>()
  scored.forEach((r, rank) => {
    fused.set(r.id, (fused.get(r.id) ?? 0) + 1 / (60 + rank))
  })
  fts.forEach((h, rank) => {
    fused.set(h.noteId, (fused.get(h.noteId) ?? 0) + 1 / (60 + rank))
  })

  const ranked = [...fused.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit)
  const hits: SearchHit[] = []
  for (const [id] of ranked) {
    const row = getNoteRow(id)
    if (!row || row.trashed === 1) continue
    const ftsHit = fts.find((h) => h.noteId === id)
    const snippet =
      ftsHit?.snippet ??
      row.content
        .replace(/[#*`>\[\]]/g, '')
        .slice(0, 200)
        .trim() + '…'
    hits.push({ noteId: id, name: row.name, path: row.path, snippet, score: fused.get(id) ?? 0 })
  }
  return hits
}

/** Top notes relevant to a query — shared by Ask HAL chat for grounding. */
export async function retrieveContext(
  query: string,
  k = 8
): Promise<{ id: string; name: string; path: string; content: string }[]> {
  const hits = await semanticSearch(query, Math.max(k * 2, 20))
  const out: { id: string; name: string; path: string; content: string }[] = []
  for (const hit of hits.slice(0, k)) {
    const row = getNoteRow(hit.noteId)
    if (!row) continue
    out.push({
      id: row.id,
      name: row.name,
      path: row.path,
      content: row.content.length > 6_000 ? `${row.content.slice(0, 6_000)}…` : row.content
    })
  }
  return out
}

// Incremental embedding of saved notes, debounced.
const pendingTimers = new Map<string, NodeJS.Timeout>()

export function initEmbeddingWatcher(): void {
  bus.on('note:saved', (id: string) => {
    if (!embeddingReady()) return
    const existing = pendingTimers.get(id)
    if (existing) clearTimeout(existing)
    const timer = setTimeout(() => {
      pendingTimers.delete(id)
      const rows = backlog().filter((r) => r.id === id)
      if (rows.length === 0) return
      void embedTexts(rows.map((r) => noteEmbeddingText(r.name, r.content)), 'RETRIEVAL_DOCUMENT')
        .then((vecs) => {
          setEmbedding(id, vecs[0])
          setMeta('embeddings_ready', '1')
        })
        .catch((err) => console.error('Embedding failed:', err))
    }, EMBED_DEBOUNCE_MS)
    pendingTimers.set(id, timer)
  })
}
