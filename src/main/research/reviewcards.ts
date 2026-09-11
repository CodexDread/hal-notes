import { randomUUID } from 'crypto'
import type { CardAnswerResult, ReviewCard } from '@shared/types'
import { aiActiveReady, aiChat } from '../ai/router'
import { getDb } from '../store/db'
import { getNoteRow } from '../store/notes'
import { evaluateShortAnswerFor } from './engine'
import { nextDueFromReviews } from './store'

export interface ReviewCardRow {
  id: string
  note_id: string
  kind: 'mcq' | 'short'
  question: string
  options_json: string
  answer: string
  guidance: string
  reviews: number
  last_answer: string
  last_feedback: string
  next_due: number | null
  created_at: number
  updated_at: number
}

function toCard(r: ReviewCardRow, noteName: string): ReviewCard {
  let options: string[] = []
  try {
    options = JSON.parse(r.options_json) as string[]
  } catch {
    options = []
  }
  return {
    id: r.id,
    noteId: r.note_id,
    noteName,
    kind: r.kind,
    question: r.question,
    options,
    answer: r.answer,
    guidance: r.guidance,
    reviews: r.reviews,
    lastAnswer: r.last_answer,
    lastFeedback: r.last_feedback,
    nextDue: r.next_due,
    createdAt: r.created_at
  }
}

export function noteCardCount(noteId: string): number {
  return getDb().prepare<[string], { n: number }>('SELECT COUNT(*) AS n FROM review_cards WHERE note_id = ?').get(noteId)!.n
}

export function dueReviewCards(): ReviewCard[] {
  const rows = getDb()
    .prepare<[number], ReviewCardRow & { note_name: string }>(
      `SELECT rc.*, n.name AS note_name FROM review_cards rc
       JOIN notes n ON n.id = rc.note_id
       WHERE rc.next_due IS NOT NULL AND rc.next_due <= ?
       ORDER BY rc.next_due`
    )
    .all(Date.now())
  return rows.map((r) => toCard(r, r.note_name))
}

/** Generates recall cards for a note (replacing any existing set). Returns the new count. */
export async function generateReviewCards(noteId: string): Promise<{ count: number }> {
  if (!aiActiveReady()) throw new Error('No AI provider is configured — add one in Settings → Integrations')
  const note = getNoteRow(noteId)
  if (!note) throw new Error('Note not found')
  if (note.content.trim().length < 120) throw new Error('Write a bit more first — cards need something to recall (a few sentences)')

  const res = await aiChat({
    messages: [{ role: 'user', text: `Create 2-4 active-recall cards from this personal note.

Rules:
- Ask about the note's core ideas, in the learner's own framing where possible.
- Prefer "mcq" (3-4 concrete options, exactly one correct — "answer" must exactly match the correct option's text). Use "short" when mcq would give it away; then "answer" is a 1-2 sentence model answer.
- "guidance": what to say when the answer is not quite — name the interesting nuance, never the miss. No words like "wrong", "incorrect", "fail".
- No scores, no grades, no pass/fail framing anywhere.

<note name="${note.name}">
${note.content.slice(0, 8000)}
</note>

Return JSON: {"cards": [{"kind": "mcq"|"short", "question": string, "options": string[], "answer": string, "guidance": string}]}` }],
    json: true,
    jsonSchema: {
      type: 'object',
        properties: {
          cards: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                kind: { type: 'string', enum: ['mcq', 'short'] },
                question: { type: 'string' },
                options: { type: 'array', items: { type: 'string' } },
                answer: { type: 'string' },
                guidance: { type: 'string' }
              },
              required: ['kind', 'question', 'answer', 'guidance']
            }
          }
        },
        required: ['cards']
      }
  })

  let parsed: { cards?: { kind?: string; question?: string; options?: string[]; answer?: string; guidance?: string }[] }
  try {
    parsed = JSON.parse(res.text ?? '{}')
  } catch {
    throw new Error('The model returned unparseable cards — try again')
  }

  const cards = (parsed.cards ?? [])
    .filter((c) => typeof c?.question === 'string' && c.question.length > 0 && typeof c.answer === 'string' && c.answer.length > 0)
    .slice(0, 4)
    .map((c) => {
      const kind = c.kind === 'mcq' && Array.isArray(c.options) && c.options.length >= 2 ? 'mcq' : 'short'
      const options = kind === 'mcq' ? (c.options ?? []).slice(0, 5) : []
      const answer = String(c.answer)
      return {
        kind,
        question: String(c.question).slice(0, 400),
        options,
        answer: kind === 'mcq' && !options.includes(answer) ? options[0] ?? answer : answer,
        guidance: String(c.guidance ?? 'Interesting angle — the nuance worth a second look is in the note.').slice(0, 800)
      }
    })

  if (cards.length === 0) throw new Error('No usable cards came back — try again')

  const db = getDb()
  const now = Date.now()
  db.transaction(() => {
    db.prepare('DELETE FROM review_cards WHERE note_id = ?').run(noteId)
    const stmt = db.prepare(
      `INSERT INTO review_cards (id, note_id, kind, question, options_json, answer, guidance, reviews, next_due, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`
    )
    for (const c of cards) {
      stmt.run(
        randomUUID(),
        noteId,
        c.kind,
        c.question,
        JSON.stringify(c.options),
        c.answer,
        c.guidance,
        now + 60 * 1000, // first review surfaces within a minute — the learner just opted in, momentum matters
        now,
        now
      )
    }
  })()

  return { count: cards.length }
}

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

export async function answerNoteCard(cardId: string, answer: string): Promise<CardAnswerResult> {
  const row = getDb().prepare<[string], ReviewCardRow>('SELECT * FROM review_cards WHERE id = ?').get(cardId)
  if (!row) throw new Error('Card not found')

  let onTarget: boolean
  let feedback: string
  if (row.kind === 'mcq') {
    onTarget = normalize(answer) === normalize(row.answer)
    feedback = onTarget ? `That's the one — ${row.answer}.` : `Not quite — ${row.guidance}`
  } else {
    ;({ onTarget, feedback } = await evaluateShortAnswerFor(
      { question: row.question, answer: row.answer, guidance: row.guidance },
      answer
    ))
  }

  const reviews = row.reviews + 1
  getDb()
    .prepare(
      `UPDATE review_cards SET reviews = ?, last_answer = ?, last_feedback = ?, next_due = ?, updated_at = ?
       WHERE id = ?`
    )
    .run(reviews, answer.slice(0, 2000), feedback.slice(0, 2000), nextDueFromReviews(reviews), Date.now(), cardId)

  return {
    feedback,
    onTarget,
    progress: {
      pathId: '',
      cardIndex: 0,
      state: 'done',
      attempts: reviews,
      reviews,
      lastAnswer: answer.slice(0, 2000),
      lastFeedback: feedback.slice(0, 2000),
      nextDue: nextDueFromReviews(reviews),
      updatedAt: Date.now()
    }
  }
}
