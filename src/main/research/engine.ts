import type {
  CardAnswerResult,
  CardProgress,
  CheckIn,
  LearningPath,
  LessonCard,
  PathDetail
} from '@shared/types'
import { retrieveContext } from '../ai/embed'
import { getClient, hasKey } from '../ai/gemini'
import { bus } from '../events'
import { createNoteWithContent, ensureFolderUnder, getNoteRow, noteNameList } from '../store/notes'
import { getSettings } from '../store/settings'
import {
  addSource,
  getPathRow,
  getProgress,
  getNotebookName,
  initCardProgress,
  nextDueFromReviews,
  toPath,
  updateCardProgress,
  updatePath
} from './store'

const FLASH = 'gemini-flash-latest'

const TONE_RULES = `Tone rules (non-negotiable — this learner thrives on momentum, not grades):
- Warm, direct, zero condescension. Never "simply", "obviously", "easy", "just".
- No scores, grades, percentages, or pass/fail framing anywhere.
- Every step must feel finishable. Small beats thorough.`

// ── Grounding extraction (pure, unit-tested) ─────────────────────────────────

interface GroundingChunkWeb {
  uri?: string
  title?: string
}

interface GroundingCandidate {
  groundingMetadata?: {
    groundingChunks?: { web?: GroundingChunkWeb }[]
  }
}

export function extractGroundingSources(response: unknown): { uri: string; title: string }[] {
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

// ── Learning path generation ──────────────────────────────────────────────────

function pathLengthCards(): number {
  const n = getSettings().pathLengthCards
  return n === 5 || n === 9 ? n : 7
}

const PATH_SCHEMA = {
  type: 'object',
  properties: {
    knownAnchors: { type: 'array', items: { type: 'string' } },
    cards: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          body: { type: 'string' },
          checkIn: {
            type: 'object',
            properties: {
              kind: { type: 'string', enum: ['mcq', 'short'] },
              question: { type: 'string' },
              options: { type: 'array', items: { type: 'string' } },
              answer: { type: 'string' },
              guidance: { type: 'string' }
            },
            required: ['kind', 'question', 'answer', 'guidance']
          },
          exercise: { type: 'string' },
          links: { type: 'array', items: { type: 'string' } }
        },
        required: ['title', 'body', 'checkIn', 'exercise', 'links']
      }
    },
    tinyProject: {
      type: 'object',
      properties: { title: { type: 'string' }, body: { type: 'string' } },
      required: ['title', 'body']
    }
  },
  required: ['cards', 'tinyProject']
} as const

interface VaultGround {
  anchors: string[]
  context: string
  noteNames: string[]
}

async function groundInVault(topic: string): Promise<VaultGround> {
  const notes = await retrieveContext(topic, 5)
  const anchors = notes.map((n) => `${n.name} (${n.path})`)
  const context = notes
    .map((n) => `--- Note: ${n.name} ---\n${n.content.slice(0, 1200)}`)
    .join('\n\n')
    .slice(0, 8000)
  const names = new Set(noteNameList(200))
  for (const n of notes) names.add(n.name)
  return { anchors, context, noteNames: [...names] }
}

/** Kicks off the assess → research → write pipeline. Fire-and-forget; progress lands via events. */
export function startLearningPath(notebookId: string, topic: string, pathId: string): void {
  void runLearningPath(notebookId, topic.trim(), pathId).catch((err) => {
    updatePath(pathId, { status: 'error', error: err instanceof Error ? err.message : String(err) })
    bus.emit('research:path-error', pathId, notebookId, err instanceof Error ? err.message : String(err))
  })
}

async function runLearningPath(notebookId: string, topic: string, pathId: string): Promise<void> {
  if (!hasKey()) throw new Error('Gemini API key is not set — add it in Settings')
  const ai = getClient()

  // 1. Assess: what does the learner already bring?
  const vault = await groundInVault(topic)
  updatePath(pathId, { status: 'researching' })
  bus.emit('research:path-updated', pathId, notebookId)

  // 2. Plan sub-questions, then run grounded search rounds.
  const planRes = await ai.models.generateContent({
    model: FLASH,
    contents: `A learner wants to learn: "${topic}".
They already have some familiarity (their existing notes touch): ${vault.anchors.join('; ') || 'nothing yet — brand new topic'}.
Decompose this into 4-6 sub-questions that together cover what's genuinely worth understanding, ordered from foundations to interesting edges. Avoid trivia.
Return JSON: {"subQuestions": string[]}`,
    config: { responseMimeType: 'application/json' }
  })
  let subQuestions: string[] = []
  try {
    subQuestions = (JSON.parse(planRes.text ?? '{}') as { subQuestions?: string[] }).subQuestions ?? []
  } catch {
    subQuestions = []
  }
  if (subQuestions.length === 0) subQuestions = [topic]

  const findings: { q: string; text: string }[] = []
  const webSources = new Map<string, string>()
  for (const q of subQuestions.slice(0, 6)) {
    const res = await ai.models.generateContent({
      model: FLASH,
      contents: `Research question: ${q}\nLearner's topic: ${topic}. Write 3-6 dense paragraphs of accurate, current findings with the specifics that matter (numbers, names, mechanisms). No fluff.`,
      config: { tools: [{ googleSearch: {} }] }
    })
    findings.push({ q, text: (res.text ?? '').slice(0, 2500) })
    for (const src of extractGroundingSources(res)) {
      webSources.set(src.uri, src.title)
      void addSource({ notebookId, kind: 'web', uri: src.uri, title: src.title, gist: '', addedBy: 'hal' })
    }
    updatePath(pathId, {})
    bus.emit('research:path-updated', pathId, notebookId)
  }

  // 3. Write the path.
  updatePath(pathId, { status: 'writing' })
  bus.emit('research:path-updated', pathId, notebookId)

  const cardCount = pathLengthCards()
  const writeRes = await ai.models.generateContent({
    model: getSettings().chatModel || FLASH,
    contents: `Build a ${cardCount}-card personal learning path on "${topic}" for one specific learner.

${TONE_RULES}

What the learner already brings (open from strength — reference this material in early cards where natural):
${vault.anchors.length > 0 ? vault.anchors.map((a) => `- ${a}`).join('\n') : '- Nothing yet on this topic; assume curious adult, no prior exposure.'}

Research findings to teach from (verify claims against these; cite nothing inline — a Sources section is added separately):
${findings.map((f) => `## ${f.q}\n${f.text}`).join('\n\n').slice(0, 24000)}

The learner's existing note names (the "links" field of each card must use EXACT names from this list, only when genuinely related; otherwise empty array):
${vault.noteNames.join('\n') || '(no other notes)'}

Card construction:
- body: 120-250 words, second person, one concrete idea per card, escalating gently. Connect to their existing notes by name where honest.
- checkIn: one recall question about THIS card. Prefer kind "mcq" with 3-4 concrete options (options includes the correct one; "answer" must exactly match the correct option's text). Use kind "short" only when mcq would give it away; then "answer" is a 1-2 sentence model answer. "guidance": what to say when the learner's answer is not quite — name the interesting nuance, never the miss.
- exercise: a 2-5 minute hands-on micro-exercise that produces something tiny and real. Nearly impossible to fail.
- The LAST card's exercise may stretch to 5 minutes and set up the tiny project.
- tinyProject: a 15-30 minute project that consolidates the whole path, explicitly completable in one sitting.
- knownAnchors: 2-5 short bullets affirming related knowledge or honest curiosity the learner already has (from their notes list or the topic phrasing). Phrase as strengths/standing starts, never as gaps.`,
    config: { responseMimeType: 'application/json', responseSchema: PATH_SCHEMA as never }
  })

  let parsed: { knownAnchors?: string[]; cards?: unknown[]; tinyProject?: { title?: string; body?: string } }
  try {
    parsed = JSON.parse(writeRes.text ?? '{}')
  } catch {
    throw new Error('The model returned an unparseable learning path — try again')
  }

  const cards: LessonCard[] = (parsed.cards ?? [])
    .filter((c): c is Partial<LessonCard> => !!c && typeof c === 'object')
    .map((c, i) => ({
      index: i,
      title: String(c.title ?? `Step ${i + 1}`).slice(0, 120),
      body: String(c.body ?? '').slice(0, 2500),
      checkIn: sanitizeCheckIn(c.checkIn),
      exercise: String(c.exercise ?? '').slice(0, 1200),
      links: Array.isArray(c.links) ? c.links.filter((l) => typeof l === 'string').slice(0, 4) : []
    }))
    .filter((c) => c.body.length > 0)

  if (cards.length < 3) throw new Error('The generated path came back too thin — try rephrasing the topic')

  const path: LearningPath = {
    topic,
    knownAnchors: (parsed.knownAnchors ?? []).filter((a) => typeof a === 'string').slice(0, 5),
    cards,
    tinyProject: {
      title: String(parsed.tinyProject?.title ?? `Try it: ${topic}`).slice(0, 140),
      body: String(parsed.tinyProject?.body ?? '').slice(0, 2000)
    },
    sources: [...webSources].slice(0, 30).map(([uri, title]) => ({ uri, title }))
  }

  updatePath(pathId, { status: 'ready', path })
  initCardProgress(pathId, cards.length)
  bus.emit('research:path-updated', pathId, notebookId)
}

function sanitizeCheckIn(raw: unknown): CheckIn {
  const c = (raw ?? {}) as Partial<CheckIn>
  const kind = c.kind === 'short' ? 'short' : 'mcq'
  const options = Array.isArray(c.options) ? c.options.filter((o) => typeof o === 'string').slice(0, 5) : []
  const answer = String(c.answer ?? '')
  const valid = kind === 'mcq' ? options.length >= 2 && options.includes(answer) : answer.length > 0
  return {
    kind: valid ? kind : 'short',
    question: String(c.question ?? 'Say back what this card taught you, in your own words.').slice(0, 400),
    options: valid ? options : [],
    answer: valid ? answer : answer || 'Anything honest — this one is about articulating, not being right.',
    guidance: String(c.guidance ?? 'Interesting angle — the nuance worth a second look is in the card body above.').slice(0, 800)
  }
}

// ── Answering, completion, review ────────────────────────────────────────────

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

async function evaluateShortAnswer(checkIn: CheckIn, answer: string): Promise<{ onTarget: boolean; feedback: string }> {
  const ai = getClient()
  const res = await ai.models.generateContent({
    model: FLASH,
    contents: `A learner answered a recall question. Evaluate gently.

Question: ${checkIn.question}
Expected gist: ${checkIn.answer}
Learner's answer: ${answer}

${TONE_RULES}
"onTarget": did the answer engage the core idea (generous standard — partial understanding counts)?
"feedback": 2-3 sentences. If on target: affirm something specific they said, add one layer. If not: begin "Not quite —" then share the interesting nuance (use this extra context if helpful: ${checkIn.guidance}). Never use "wrong", "incorrect", "fail".`,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'object',
        properties: { onTarget: { type: 'boolean' }, feedback: { type: 'string' } },
        required: ['onTarget', 'feedback']
      } as never
    }
  })
  try {
    const parsed = JSON.parse(res.text ?? '{}') as { onTarget?: boolean; feedback?: string }
    return {
      onTarget: parsed.onTarget === true,
      feedback: String(parsed.feedback ?? 'Interesting — take another look at the card above and see what shifts.')
    }
  } catch {
    return { onTarget: true, feedback: 'Noted — that answer counts. Moving on.' }
  }
}

export async function answerCard(pathId: string, cardIndex: number, answer: string): Promise<CardAnswerResult> {
  const row = getPathRow(pathId)
  if (!row?.path_json) throw new Error('Path not ready')
  const path = JSON.parse(row.path_json) as LearningPath
  const card = path.cards[cardIndex]
  if (!card) throw new Error('No such card')

  let onTarget: boolean
  let feedback: string
  if (card.checkIn.kind === 'mcq' && card.checkIn.options.length > 0) {
    onTarget = normalize(answer) === normalize(card.checkIn.answer)
    feedback = onTarget
      ? `That's the one — ${card.checkIn.answer}.`
      : `Not quite — ${card.checkIn.guidance}`
  } else if (hasKey()) {
    ;({ onTarget, feedback } = await evaluateShortAnswer(card.checkIn, answer))
  } else {
    onTarget = true
    feedback = 'Noted — that answer counts.'
  }

  const existing = getProgress(pathId).find((p) => p.cardIndex === cardIndex)
  const progress = updateCardProgress(pathId, cardIndex, {
    attempts: (existing?.attempts ?? 0) + 1,
    lastAnswer: answer.slice(0, 2000),
    lastFeedback: feedback.slice(0, 2000)
  })
  return { feedback, onTarget, progress }
}

export function completeCard(pathId: string, cardIndex: number): PathDetail {
  updateCardProgress(pathId, cardIndex, {
    state: 'done',
    reviews: 0,
    nextDue: nextDueFromReviews(0)
  })
  const all = getProgress(pathId)
  const next = all.find((p) => p.cardIndex === cardIndex + 1)
  if (next && next.state === 'locked') {
    updateCardProgress(pathId, cardIndex + 1, { state: 'active' })
  }
  const refreshed = getProgress(pathId)
  if (refreshed.every((p) => p.state === 'done')) {
    void savePathNote(pathId).catch((err) => console.error('[research] auto-save failed:', err))
  }
  return getPathDetailOrThrow(pathId)
}

export async function answerReview(pathId: string, cardIndex: number, answer: string): Promise<CardAnswerResult> {
  const row = getPathRow(pathId)
  if (!row?.path_json) throw new Error('Path not ready')
  const path = JSON.parse(row.path_json) as LearningPath
  const card = path.cards[cardIndex]
  if (!card) throw new Error('No such card')

  let onTarget: boolean
  let feedback: string
  if (card.checkIn.kind === 'mcq' && card.checkIn.options.length > 0) {
    onTarget = normalize(answer) === normalize(card.checkIn.answer)
    feedback = onTarget ? `Still with you — ${card.checkIn.answer}.` : `Not quite — ${card.checkIn.guidance}`
  } else if (hasKey()) {
    ;({ onTarget, feedback } = await evaluateShortAnswer(card.checkIn, answer))
  } else {
    onTarget = true
    feedback = 'Noted.'
  }

  const existing = getProgress(pathId).find((p) => p.cardIndex === cardIndex)
  const reviews = (existing?.reviews ?? 0) + 1
  const progress = updateCardProgress(pathId, cardIndex, {
    reviews,
    lastAnswer: answer.slice(0, 2000),
    lastFeedback: feedback.slice(0, 2000),
    nextDue: nextDueFromReviews(reviews)
  })
  return { feedback, onTarget, progress }
}

// ── Persisting the artifact as a vault note ──────────────────────────────────

export function buildPathNoteMarkdown(notebookName: string, detail: PathDetail): string {
  const path = detail.path!
  const lines: string[] = []
  lines.push(`# ${path.topic}`)
  lines.push('')
  lines.push(`*A learning path from the “${notebookName}” research notebook — ${new Date().toLocaleDateString()}*`)
  lines.push('')
  if (path.knownAnchors.length > 0) {
    lines.push('## What you already brought')
    for (const a of path.knownAnchors) lines.push(`- ${a}`)
    lines.push('')
  }
  lines.push('## The path, as you walked it')
  for (const card of path.cards) {
    const p = detail.progress.find((x) => x.cardIndex === card.index)
    lines.push(`### ${card.index + 1}. ${card.title}`)
    lines.push('')
    lines.push(card.body)
    lines.push('')
    lines.push(`**Check-in:** ${card.checkIn.question}`)
    lines.push('')
    lines.push(`**You said:** ${p?.lastAnswer?.trim() || '—'}`)
    lines.push('')
    lines.push(`**HAL:** ${p?.lastFeedback?.trim() || '—'}`)
    lines.push('')
    lines.push(`**Exercise:** ${card.exercise}`)
    lines.push('')
    if (card.links.length > 0) lines.push(`*Connects to:* ${card.links.map((l) => `[[${l}]]`).join(', ')}`)
    lines.push('')
  }
  lines.push(`## Tiny project — ${path.tinyProject.title}`)
  lines.push('')
  lines.push(path.tinyProject.body)
  lines.push('')
  if (path.sources.length > 0) {
    lines.push('## Sources')
    for (const s of path.sources) lines.push(`- [${s.title}](${s.uri})`)
    lines.push('')
  }
  return lines.join('\n')
}

export async function savePathNote(pathId: string): Promise<{ noteId: string }> {
  const detail = getPathDetailOrThrow(pathId)
  if (!detail.path || detail.noteId) return { noteId: detail.noteId ?? '' }
  const notebookName = getNotebookName(detail.notebookId)
  const researchFolder = ensureFolderUnder(null, 'Research')
  const notebookFolder = ensureFolderUnder(researchFolder.id, notebookName)
  const meta = createNoteWithContent({
    name: detail.path.topic.slice(0, 80) || 'Learning path',
    parentId: notebookFolder.id,
    content: buildPathNoteMarkdown(notebookName, detail)
  })
  updatePath(pathId, { noteId: meta.id })
  return { noteId: meta.id }
}

export function getPathDetailOrThrow(pathId: string): PathDetail {
  const row = getPathRow(pathId)
  if (!row) throw new Error('Path not found')
  return { ...toPath(row), progress: getProgress(pathId) }
}
