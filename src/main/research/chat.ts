import type { ResearchCitation } from '@shared/types'
import { cosine, embedSingle } from '../ai/embed'
import { aiActiveReady, aiChat } from '../ai/router'
import { getNoteRow } from '../store/notes'
import { addMessage, getSourceRows } from './store'
import type { SourceRow } from './store'

const SYSTEM_INSTRUCTION = `You are HAL, the research companion inside one notebook of a personal research workspace.

Your learner thrives on momentum and is allergic to being graded. Operating rules:
- Answer questions grounded in this notebook's sources (marked [n]) and the learner's pinned notes.
- Teach Socratically by default: when the learner asks something conceptual, it is fine to answer well AND then ask one genuine follow-up question that moves their thinking forward.
- When they ask for a direct explanation ("explain plainly", "just tell me"), give the full answer — no coy withholding. Guide when guiding, tell when telling.
- Never grade, score, or judge. Treat partial understanding as a starting point. Curiosity is the win.
- If the sources don't cover it, say so and answer from general knowledge, clearly flagged as beyond the notebook.
- Keep answers tight and well-structured markdown. Cite with [n] referencing the numbered sources provided.`

interface SourceContext {
  blocks: string
  citations: ResearchCitation[]
}

function buildSourceContext(notebookId: string, queryVec: Float32Array | null): SourceContext {
  const sources = getSourceRows(notebookId)
  const citations: ResearchCitation[] = []
  const blocks: string[] = []

  let ranked = sources
  if (queryVec) {
    ranked = [...sources].sort((a, b) => scoreSource(b, queryVec) - scoreSource(a, queryVec))
  }
  const picked = ranked.slice(0, 15)

  picked.forEach((s, i) => {
    const index = i + 1
    citations.push({
      index,
      sourceId: s.id,
      title: s.title || s.uri,
      uri: s.kind === 'web' ? s.uri : null,
      noteId: s.kind === 'note' ? s.uri : null
    })
    if (s.kind === 'note') {
      const note = getNoteRow(s.uri)
      blocks.push(`--- Source [${index}] (your note: ${note?.name ?? s.title}) ---\n${(note?.content ?? s.gist).slice(0, 2500)}`)
    } else {
      blocks.push(`--- Source [${index}] (web: ${s.title}) ---\n${s.gist?.slice(0, 800) || s.uri}`)
    }
  })

  return { blocks: blocks.join('\n\n'), citations }
}

function scoreSource(s: SourceRow, queryVec: Float32Array): number {
  if (!s.embedding) return 0
  const vec = new Float32Array(s.embedding.buffer, s.embedding.byteOffset, s.embedding.byteLength / 4)
  return cosine(queryVec, vec)
}

export async function notebookChat(
  emit: (delta: string) => void,
  notebookId: string,
  question: string,
  history: { role: 'user' | 'hal'; text: string }[]
): Promise<{ citations: ResearchCitation[] }> {
  if (!aiActiveReady()) throw new Error('No AI provider is configured — add one in Settings → Integrations')

  const queryVec = await embedSingle(question).catch(() => null)
  const { blocks, citations } = buildSourceContext(notebookId, queryVec)

  addMessage(notebookId, 'user', question, [])
  const contents = [
    ...history.slice(-6).map((t) => ({ role: t.role === 'user' ? ('user' as const) : ('model' as const), parts: [{ text: t.text }] })),
    {
      role: 'user' as const,
      parts: [
        {
          text:
            blocks.length > 0
              ? `Notebook sources:\n\n${blocks}\n\nQuestion: ${question}`
              : `(This notebook has no sources yet — answer from general knowledge and say the notebook is empty.)\n\nQuestion: ${question}`
        }
      ]
    }
  ]

  let full = ''
  const result = await aiChat({
    system: SYSTEM_INSTRUCTION,
    messages: contents.map((c) => ({
      role: c.role === 'user' ? ('user' as const) : ('assistant' as const),
      text: c.parts[0].text
    })),
    stream: (delta) => {
      full += delta
      emit(delta)
    }
  })
  full = result.text || full
  addMessage(notebookId, 'hal', full, citations)
  return { citations }
}
