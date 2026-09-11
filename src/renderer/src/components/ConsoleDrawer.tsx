import { useEffect, useRef, useState } from 'react'
import type { ConsoleLine } from '@shared/types'
import { hal } from '@/lib/ipc'
import { useUi } from '@/state/ui'

const LEVEL_STYLE: Record<ConsoleLine['level'], string> = {
  log: 'text-[var(--hal-dim)]',
  warn: 'text-[var(--hal-amber)]',
  error: 'text-[var(--hal-lamp-red)]'
}

function formatTime(t: number): string {
  const d = new Date(t)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export function ConsoleDrawer() {
  const open = useUi((s) => s.consoleOpen)
  const close = () => useUi.setState({ consoleOpen: false })
  const [lines, setLines] = useState<ConsoleLine[]>([])
  const [autoscroll, setAutoscroll] = useState(true)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    void hal.consoleFetch().then(setLines)
    const off = hal.on('console:line', (line) => {
      setLines((prev) => {
        const next = [...prev, line]
        return next.length > 500 ? next.slice(next.length - 500) : next
      })
    })
    return off
  }, [open])

  useEffect(() => {
    if (open && autoscroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [lines, open, autoscroll])

  if (!open) return null

  return (
    <div className="flex h-64 shrink-0 flex-col border-t border-[var(--hal-hairline)] bg-[var(--hal-ground)]">
      <div className="flex shrink-0 items-center gap-2 border-b border-[var(--hal-hairline)] px-3 py-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--hal-dim)]">Main-process console</span>
        <label className="ml-auto flex cursor-pointer items-center gap-1 text-[11px] text-[var(--hal-dim)]">
          <input type="checkbox" checked={autoscroll} onChange={(e) => setAutoscroll(e.target.checked)} />
          follow
        </label>
        <button
          className="rounded px-2 py-0.5 text-[11px] text-[var(--hal-dim)] hover:bg-[var(--hal-plate-2)]"
          onClick={() => {
            void hal.consoleClear().then(() => setLines([]))
          }}
        >
          Clear
        </button>
        <button className="rounded px-2 py-0.5 text-[11px] text-[var(--hal-dim)] hover:bg-[var(--hal-plate-2)]" onClick={close}>
          ✕
        </button>
      </div>
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-1.5 font-mono text-[11px] leading-5">
        {lines.length === 0 && <p className="text-[var(--hal-dim)] opacity-80">No output yet — sync events, capture decisions, and errors land here as they happen.</p>}
        {lines.map((l) => (
          <div key={l.seq} className="flex gap-2">
            <span className="shrink-0 text-[var(--hal-dim)] opacity-80">{formatTime(l.t)}</span>
            <span className={`whitespace-pre-wrap break-all ${LEVEL_STYLE[l.level]}`}>{l.text}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
