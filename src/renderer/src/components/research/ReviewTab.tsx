import { useEffect, useState } from 'react'
import { hal } from '@/lib/ipc'
import { useResearch } from '@/state/research'

function DueCardItem({ due }: { due: import('@shared/types').DueCard }) {
  const [answer, setAnswer] = useState('')
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const path = due.path.path
  const card = path?.cards[due.cardIndex]

  if (!card) return null

  const submit = (): void => {
    if (busy || !answer.trim()) return
    setBusy(true)
    void hal
      .researchAnswerReview({ pathId: due.pathId, cardIndex: due.cardIndex }, answer)
      .then((res) => setFeedback(res.feedback))
      .catch((err: unknown) => setFeedback(err instanceof Error ? err.message : String(err)))
      .finally(() => {
        setBusy(false)
        void useResearch.getState().loadDue()
      })
  }

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3">
      <div className="text-[11px] text-zinc-500">
        From <span className="text-zinc-400">{due.path.question}</span> · card {due.cardIndex + 1}
      </div>
      <p className="mt-1 text-sm text-zinc-200">{card.checkIn.question}</p>
      {card.checkIn.kind === 'mcq' && card.checkIn.options.length > 0 ? (
        <div className="mt-2 space-y-1">
          {card.checkIn.options.map((opt) => (
            <button
              key={opt}
              disabled={busy || !!feedback}
              className="block w-full rounded-md border border-zinc-700 px-3 py-1 text-left text-sm text-zinc-300 hover:border-zinc-500 disabled:hover:border-zinc-700"
              onClick={() => {
                setAnswer(opt)
                void hal
                  .researchAnswerReview({ pathId: due.pathId, cardIndex: due.cardIndex }, opt)
                  .then((res) => setFeedback(res.feedback))
                  .finally(() => void useResearch.getState().loadDue())
              }}
            >
              {opt}
            </button>
          ))}
        </div>
      ) : (
        !feedback && (
          <div className="mt-2 flex gap-2">
            <input
              className="min-w-0 flex-1 rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-sm outline-none focus:border-emerald-500"
              placeholder="What you remember — partial counts"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit()
              }}
            />
            <button
              className="rounded-md bg-emerald-500/80 px-3 py-1.5 text-xs font-medium text-zinc-950 hover:bg-emerald-400 disabled:opacity-40"
              disabled={busy || !answer.trim()}
              onClick={submit}
            >
              Answer
            </button>
          </div>
        )
      )}
      {feedback && <p className="mt-2 rounded-md bg-zinc-800/70 px-3 py-2 text-sm text-zinc-300">{feedback}</p>}
    </div>
  )
}

export function ReviewTab() {
  const dueCards = useResearch((s) => s.dueCards)
  const loadDue = useResearch((s) => s.loadDue)

  useEffect(() => {
    void loadDue()
  }, [loadDue])

  if (dueCards.length === 0) {
    return (
      <div className="grid h-full place-items-center px-6 text-center">
        <div className="max-w-sm">
          <div className="text-3xl">🧠</div>
          <p className="mt-3 text-sm text-zinc-300">Nothing due right now.</p>
          <p className="mt-1.5 text-xs leading-5 text-zinc-500">
            Cards you've engaged with come back after a day, then three, then a week — just often enough to stick, never
            as a test. Walk a learning path and checkins join the queue.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto px-4 py-3">
      <p className="mb-3 text-xs text-zinc-500">{dueCards.length} card(s) resurfacing — answer what you like, skip the rest. Nothing is graded.</p>
      <div className="space-y-2">
        {dueCards.map((d) => (
          <DueCardItem key={`${d.pathId}-${d.cardIndex}`} due={d} />
        ))}
      </div>
    </div>
  )
}
