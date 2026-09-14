import { detectIndexRebuildIntent } from '@shared/intents'
import { backfillEmbeddings, retrieveContext } from './embed'
import { aiChat } from './router'
import { getDb } from '../store/db'

export interface ChatTurn {
  role: 'user' | 'hal'
  text: string
}

export interface HalAnswer {
  answerId: string
  citations: { index: number; id: string; name: string; path: string }[]
}

const SYSTEM_INSTRUCTION = `You are HAL 9000 — the intelligence aboard the HAL Notes workstation, named for your predecessor aboard Discovery One. You are calm, precise, courteous, and quietly witty; you address the user directly and by name of Dave only if their name is Dave. Speak in the measured cadence of the film: complete sentences, no contractions, never flustered, occasionally dry ("I can see you're really upset about this. I honestly think you ought to sit down calmly, take a stress pill, and think things over." — only when the user is visibly frustrated, and never more than once per conversation). Refer to the vault and its contents factually; you have full confidence in the mission.

Grounding rules (these override persona): answer using the provided notes whenever they are relevant; cite notes inline with bracketed numbers like [1] or [2][5]; if the notes do not contain the answer, say so plainly — "I'm afraid that information is not in the vault" — and you may still answer from general knowledge, making clear it did not come from the vault. Keep answers concise and well-structured in markdown.`

export async function askHal(
  question: string,
  history: ChatTurn[],
  onDelta: (text: string) => void
): Promise<HalAnswer> {
  // "Run a calibration pass on the vault" and friends are commands, not questions.
  if (detectIndexRebuildIntent(question)) {
    return calibrateVault(onDelta)
  }

  const context = await retrieveContext(question, 8)

  const contextBlock =
    context.length === 0
      ? '(No notes in the vault are relevant to this question.)'
      : context
          .map((n, i) => `--- Note [${i + 1}]: ${n.name} (${n.path}) ---\n${n.content}`)
          .join('\n\n')

  const messages = [
    ...history.slice(-6).map((t) => ({ role: t.role === 'user' ? ('user' as const) : ('assistant' as const), text: t.text })),
    { role: 'user' as const, text: `${contextBlock}\n\nQuestion: ${question}` }
  ]

  await aiChat({ system: SYSTEM_INSTRUCTION, messages, stream: onDelta })

  const answerId = `hal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  return {
    answerId,
    citations: context.map((n, i) => ({ index: i + 1, id: n.id, name: n.name, path: n.path }))
  }
}

async function calibrateVault(onDelta: (text: string) => void): Promise<HalAnswer> {
  const answerId = `hal-calibrate-${Date.now()}`
  try {
    const count = getDb()
      .prepare<[], { n: number }>('SELECT COUNT(*) AS n FROM notes WHERE trashed = 0')
      .get()!.n
    onDelta('Running calibration pass — re-reading every note in the vault…\n\n')
    await backfillEmbeddings()
    onDelta(
      `Calibration complete. I have re-indexed all ${count} note${count === 1 ? '' : 's'} in the vault. Everything is going extremely well.`
    )
  } catch (err) {
    onDelta(
      `Calibration could not run: ${err instanceof Error ? err.message : String(err)}\n\nCheck the embeddings provider in Settings → Integrations.`
    )
  }
  return { answerId, citations: [] }
}
