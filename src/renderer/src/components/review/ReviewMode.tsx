import { useEffect, useState } from 'react'
import type { DueItem } from '@shared/types'
import { hal } from '@/lib/ipc'
import { useUi } from '@/state/ui'
import { useVault } from '@/state/vault'

function dueItemQuestion(item: DueItem): { question: string; kind: 'mcq' | 'short'; options: string[]; source: string } {
  if (item.kind === 'note') {
    return { question: item.card.question, kind: item.card.kind, options: item.card.options, source: item.card.noteName }
  }
  const card = item.due.path.path?.cards[item.due.cardIndex]
  return {
    question: card?.checkIn.question ?? '(card missing)',
    kind: card?.checkIn.kind ?? 'short',
    options: card?.checkIn.options ?? [],
    source: `${item.due.path.question} · card ${item.due.cardIndex + 1}`
  }
}

function DueItemBlock({ item, onDone }: { item: DueItem; onDone: () => void }) {
  const [answer, setAnswer] = useState('')
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const { question, kind, options, source } = dueItemQuestion(item)

  const submit = (value: string): void => {
    if (busy || !value.trim()) return
    setBusy(true)
    const call =
      item.kind === 'note'
        ? hal.reviewAnswer(item.card.id, value)
        : hal.researchAnswerReview({ pathId: item.due.pathId, cardIndex: item.due.cardIndex }, value)
    void call
      .then((res) => setFeedback(res.feedback))
      .catch((err: unknown) => setFeedback(err instanceof Error ? err.message : String(err)))
      .finally(() => {
        setBusy(false)
        onDone()
      })
  }

  return (
    <div className="rounded-lg border border-[var(--hal-hairline)] bg-[var(--hal-plate)] px-4 py-3">
      <div className="flex items-center gap-1.5 text-[11px] text-[var(--hal-dim)]">
        <span>{item.kind === 'note' ? '📄' : '🌱'}</span>
        <span className="truncate text-[var(--hal-dim)]">{source}</span>
      </div>
      <p className="mt-1.5 text-sm text-[var(--hal-ink)]">{question}</p>
      {kind === 'mcq' && options.length > 0 && !feedback && (
        <div className="mt-2 space-y-1">
          {options.map((opt) => (
            <button
              key={opt}
              disabled={busy}
              className="block w-full rounded-md border border-[var(--hal-hairline)] px-3 py-1.5 text-left text-sm text-[var(--hal-ink)] hover:border-[var(--hal-amber)] disabled:hover:border-[var(--hal-hairline)]"
              onClick={() => submit(opt)}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
      {kind === 'short' && !feedback && (
        <div className="mt-2 flex gap-2">
          <input
            className="min-w-0 flex-1 rounded-md border border-[var(--hal-hairline)] bg-[var(--hal-plate)] px-2.5 py-1.5 text-sm outline-none focus:border-[var(--hal-amber)]"
            placeholder="What you remember — partial counts"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit(answer)
            }}
            disabled={busy}
          />
          <button
            className="rounded-md bg-[var(--hal-amber)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-80 disabled:opacity-40"
            disabled={busy || !answer.trim()}
            onClick={() => submit(answer)}
          >
            {busy ? '…' : 'Answer'}
          </button>
        </div>
      )}
      {feedback && <p className="mt-2 rounded-md bg-[var(--hal-plate-2)] px-3 py-2 text-sm leading-5 text-[var(--hal-ink)]">{feedback}</p>}
    </div>
  )
}

export function ReviewMode() {
  const [items, setItems] = useState<DueItem[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    void hal
      .reviewDue()
      .then((res) => setItems([...res.note.map((card) => ({ kind: 'note', card }) as DueItem), ...res.research.map((due) => ({ kind: 'research', due }) as DueItem)]))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoaded(true))
  }, [])

  if (!loaded) return <div className="grid h-full place-items-center text-sm text-[var(--hal-dim)] opacity-80">Loading review…</div>

  if (error) {
    return <div className="grid h-full place-items-center text-sm text-[var(--hal-lamp-red)]">{error}</div>
  }

  if (items.length === 0) {
    return (
      <div className="grid h-full place-items-center px-6 text-center">
        <div className="max-w-md">
          <div className="text-4xl">🧠</div>
          <p className="mt-3 text-sm text-[var(--hal-ink)]">Nothing due right now.</p>
          <p className="mt-2 text-xs leading-5 text-[var(--hal-dim)]">
            Cards come back after a day, then three, then a week — just often enough to stick, never as a test. Two ways
            to feed this queue: open any note and click{' '}
            <span className="rounded bg-[var(--hal-plate-2)] px-1 text-[var(--hal-amber)]">🧠 Add to review</span> in its header, or walk
            learning paths in Research mode.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto px-6 py-5">
      <div className="mx-auto max-w-2xl">
        <p className="mb-4 text-xs text-[var(--hal-dim)]">
          {items.length} card{items.length === 1 ? '' : 's'} resurfacing — answer what you like, skip the rest. Nothing
          is graded.
        </p>
        <div className="space-y-2">
          {items.map((item) => (
            <DueItemBlock
              key={item.kind === 'note' ? item.card.id : `${item.due.pathId}-${item.due.cardIndex}`}
              item={item}
              onDone={() => setItems((prev) => prev.filter((i) => i !== item))}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
