import { useState } from 'react'
import { renderMarkdown } from '@/lib/markdown'
import { hal } from '@/lib/ipc'
import { useResearch } from '@/state/research'
import { useUi } from '@/state/ui'
import { useVault } from '@/state/vault'

function CheckInBlock({
  cardIndex,
  question,
  kind,
  options,
  onAnswered
}: {
  cardIndex: number
  question: string
  kind: 'mcq' | 'short'
  options: string[]
  onAnswered: (result: { feedback: string; onTarget: boolean }) => void
}) {
  const [choice, setChoice] = useState<string | null>(null)
  const [shortAnswer, setShortAnswer] = useState('')
  const [feedback, setFeedback] = useState<{ text: string; onTarget: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  const pathId = useResearch((s) => s.activePathId)

  const submit = (answer: string): void => {
    if (!pathId || busy || !answer.trim()) return
    setBusy(true)
    void hal
      .researchAnswerCard(pathId, cardIndex, answer)
      .then((res) => {
        setFeedback({ text: res.feedback, onTarget: res.onTarget })
        onAnswered({ feedback: res.feedback, onTarget: res.onTarget })
      })
      .catch((err: unknown) => setFeedback({ text: err instanceof Error ? err.message : String(err), onTarget: true }))
      .finally(() => setBusy(false))
  }

  return (
    <div className="mt-4 rounded-lg border border-violet-500/20 bg-violet-400/[0.04] p-3">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-violet-400/80">Check in</div>
      <p className="mt-1 text-sm text-zinc-200">{question}</p>
      {kind === 'mcq' && options.length > 0 && !feedback && (
        <div className="mt-2 space-y-1.5">
          {options.map((opt) => (
            <button
              key={opt}
              disabled={busy}
              className={`block w-full rounded-md border px-3 py-1.5 text-left text-sm transition-colors ${
                choice === opt
                  ? 'border-violet-500 bg-violet-400/10 text-violet-100'
                  : 'border-zinc-700 text-zinc-300 hover:border-zinc-500'
              }`}
              onClick={() => {
                setChoice(opt)
                submit(opt)
              }}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
      {kind === 'short' && !feedback && (
        <div className="mt-2 flex gap-2">
          <input
            className="min-w-0 flex-1 rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-sm outline-none focus:border-violet-500"
            placeholder="Your thinking, in your own words — can't be wrong, only interesting"
            value={shortAnswer}
            onChange={(e) => setShortAnswer(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit(shortAnswer)
            }}
            disabled={busy}
          />
          <button
            className="rounded-md bg-violet-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-400 disabled:opacity-40"
            disabled={busy || !shortAnswer.trim()}
            onClick={() => submit(shortAnswer)}
          >
            {busy ? '…' : 'Answer'}
          </button>
        </div>
      )}
      {feedback && (
        <p className={`mt-2 rounded-md px-3 py-2 text-sm leading-5 ${feedback.onTarget ? 'bg-violet-400/10 text-violet-100' : 'bg-zinc-800/70 text-zinc-300'}`}>
          {feedback.text}
        </p>
      )}
    </div>
  )
}

function CardBlock({ card, state, isLast }: { card: import('@shared/types').LessonCard; state: string; isLast: boolean }) {
  const pathId = useResearch((s) => s.activePathId)
  const refreshPath = useResearch((s) => s.refreshPath)
  const [answered, setAnswered] = useState(false)
  const [completing, setCompleting] = useState(false)
  const active = state === 'active'

  const complete = (): void => {
    if (!pathId) return
    setCompleting(true)
    void hal
      .researchCompleteCard(pathId, card.index)
      .then(() => refreshPath())
      .finally(() => setCompleting(false))
  }

  if (state === 'locked') {
    return (
      <div className="rounded-lg border border-zinc-800/60 px-4 py-3 opacity-40">
        <div className="flex items-center gap-2 text-sm text-zinc-400">
          <span className="text-zinc-600">🔒</span> {card.index + 1}. {card.title}
        </div>
      </div>
    )
  }

  if (state === 'done' && !active) {
    return (
      <details className="rounded-lg border border-zinc-800/60 px-4 py-2.5">
        <summary className="cursor-pointer text-sm text-zinc-400">
          <span className="mr-1.5 text-violet-400">✓</span>
          {card.index + 1}. {card.title}
        </summary>
        <div
          className="preview prose prose-sm prose-zinc mt-2 max-w-none"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(card.body) }}
        />
      </details>
    )
  }

  return (
    <div className={`rounded-lg border px-4 py-4 ${active ? 'border-violet-500/40 bg-zinc-900/60' : 'border-violet-500/20'}`}>
      <div className="flex items-center gap-2">
        <span className={`grid h-6 w-6 place-items-center rounded-full text-xs ${active ? 'bg-violet-400/20 text-violet-300' : 'bg-zinc-800 text-zinc-500'}`}>
          {card.index + 1}
        </span>
        <h3 className="text-base font-semibold text-zinc-100">{card.title}</h3>
      </div>
      <div
        className="preview prose prose-sm prose-zinc mt-3 max-w-none"
        dangerouslySetInnerHTML={{ __html: renderMarkdown(card.body) }}
      />
      {card.links.length > 0 && (
        <p className="mt-2 text-xs text-zinc-500">
          Connects to{' '}
          {card.links.map((l) => (
            <button
              key={l}
              className="text-violet-300 hover:underline"
              onClick={() => void useVault.getState().openByName(l)}
            >
              [[{l}]]
            </button>
          ))}
        </p>
      )}
      {active && (
        <>
          <CheckInBlock
            cardIndex={card.index}
            question={card.checkIn.question}
            kind={card.checkIn.kind}
            options={card.checkIn.options}
            onAnswered={() => setAnswered(true)}
          />
          <div className="mt-3 rounded-md bg-zinc-800/40 p-3 text-sm text-zinc-300">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Try it (2–5 min)</span>
            <div
              className="preview prose prose-sm prose-zinc mt-1 max-w-none"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(card.exercise) }}
            />
          </div>
          <div className="mt-3 flex justify-end">
            <button
              className="rounded-md bg-violet-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-violet-400 disabled:opacity-40"
              disabled={!answered || completing}
              title={answered ? undefined : 'Answer the check-in first — any honest answer counts'}
              onClick={complete}
            >
              {completing ? '…' : isLast ? 'Finish path' : 'Continue'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

export function PathPlayer() {
  const pathDetail = useResearch((s) => s.pathDetail)
  const closePath = useResearch((s) => s.closePath)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')

  if (!pathDetail || !pathDetail.path) return null
  const { path, progress, noteId } = pathDetail
  const allDone = progress.length > 0 && progress.every((p) => p.state === 'done')

  const save = (): void => {
    setSaveState('saving')
    void hal
      .researchSavePathNote(pathDetail.id)
      .then(() => {
        setSaveState('saved')
        return useResearch.getState().refreshActive()
      })
      .catch(() => setSaveState('idle'))
  }

  return (
    <div className="absolute inset-0 z-40 flex flex-col bg-zinc-950/97">
      <div className="flex shrink-0 items-center gap-3 border-b border-zinc-800 px-4 py-2.5">
        <span className="text-violet-400">🌱</span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-zinc-100">{path.topic}</div>
          <div className="text-[11px] text-zinc-500">
            {progress.filter((p) => p.state === 'done').length}/{path.cards.length} cards · engagement is the metric, not correctness
          </div>
        </div>
        {noteId ? (
          <button
            className="rounded-md border border-violet-400/40 px-3 py-1.5 text-xs text-violet-300 hover:bg-violet-400/10"
            onClick={() => {
              useUi.getState().setMode('notes')
              void useVault.getState().open(noteId)
            }}
          >
            Open in vault ✓
          </button>
        ) : (
          <button
            className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-40"
            disabled={saveState === 'saving'}
            onClick={save}
          >
            {saveState === 'saved' ? 'Saved ✓' : saveState === 'saving' ? 'Saving…' : 'Save as note'}
          </button>
        )}
        <button className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300" onClick={closePath} title="Close">
          ✕
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        <div className="mx-auto max-w-2xl space-y-4">
          {path.knownAnchors.length > 0 && (
            <div className="rounded-lg border border-violet-500/25 bg-violet-400/[0.05] px-4 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-violet-400">What you already bring</div>
              <ul className="mt-1.5 space-y-1">
                {path.knownAnchors.map((a, i) => (
                  <li key={i} className="text-sm leading-5 text-violet-100/90">• {a}</li>
                ))}
              </ul>
            </div>
          )}

          {path.cards.map((card, i) => (
            <CardBlock key={card.index} card={card} state={progress.find((p) => p.cardIndex === card.index)?.state ?? 'locked'} isLast={i === path.cards.length - 1} />
          ))}

          <div className={`rounded-lg border px-4 py-4 ${allDone ? 'border-amber-400/40 bg-amber-400/[0.05]' : 'border-zinc-800'}`}>
            <div className="flex items-center gap-2">
              <span>🎯</span>
              <h3 className="text-base font-semibold text-zinc-100">{path.tinyProject.title}</h3>
            </div>
            <div
              className="preview prose prose-sm prose-zinc mt-2 max-w-none"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(path.tinyProject.body) }}
            />
            <p className="mt-2 text-xs text-zinc-500">
              {allDone
                ? 'The path is walked — this is the victory lap. One sitting, and it counts as a complete win.'
                : 'Where this path is heading. It will be waiting whenever the cards are done.'}
            </p>
          </div>

          {path.sources.length > 0 && (
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Sources HAL used</div>
              <ul className="mt-1.5 space-y-1">
                {path.sources.map((s, i) => (
                  <li key={i} className="truncate text-xs">
                    <a className="text-sky-300 hover:underline" href={s.uri} target="_blank" rel="noopener noreferrer">
                      {s.title}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
