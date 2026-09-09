import { getSettings } from '../store/settings'
import { retrieveContext } from './embed'
import { getClient } from './gemini'

export interface ChatTurn {
  role: 'user' | 'hal'
  text: string
}

export interface HalAnswer {
  answerId: string
  citations: { index: number; id: string; name: string; path: string }[]
}

const SYSTEM_INSTRUCTION = `You are HAL, the note-taking assistant inside the HAL Notes app.
Answer the user's question using the provided notes whenever they are relevant.
Cite notes inline using bracketed numbers like [1] or [2][5] referring to the numbered notes provided.
If the notes do not contain the answer, say so plainly — you may still answer from general knowledge, but make clear it did not come from the vault.
Keep answers concise and well-structured in markdown.`

export async function askHal(
  question: string,
  history: ChatTurn[],
  onDelta: (text: string) => void
): Promise<HalAnswer> {
  const ai = getClient()
  const settings = getSettings()
  const model = settings.chatModel || 'gemini-flash-latest'
  const context = await retrieveContext(question, 8)

  const contextBlock =
    context.length === 0
      ? '(No notes in the vault are relevant to this question.)'
      : context
          .map((n, i) => `--- Note [${i + 1}]: ${n.name} (${n.path}) ---\n${n.content}`)
          .join('\n\n')

  const contents: { role: 'user' | 'model'; parts: { text: string }[] }[] = []
  for (const turn of history.slice(-6)) {
    contents.push({ role: turn.role === 'user' ? 'user' : 'model', parts: [{ text: turn.text }] })
  }
  contents.push({
    role: 'user',
    parts: [{ text: `${contextBlock}\n\nQuestion: ${question}` }]
  })

  const stream = await ai.models.generateContentStream({
    model,
    contents,
    config: { systemInstruction: SYSTEM_INSTRUCTION }
  })

  let full = ''
  for await (const chunk of stream) {
    const text = chunk.text ?? ''
    if (text) {
      full += text
      onDelta(text)
    }
  }

  const answerId = `hal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  return {
    answerId,
    citations: context.map((n, i) => ({ index: i + 1, id: n.id, name: n.name, path: n.path }))
  }
}
