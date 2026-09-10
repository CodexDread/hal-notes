import { useVault } from '@/state/vault'
import { useUi } from '@/state/ui'
import { hal } from '@/lib/ipc'

function SyncPill() {
  const status = useUi((s) => s.syncStatus)
  const driveConnected = useVault((s) => s.snapshot.driveConnected)
  const openSettings = useUi((s) => s.openSettings)

  if (!driveConnected || !status || status.state === 'unlinked') {
    return (
      <button
        className="flex items-center gap-1.5 rounded-md bg-zinc-800/80 px-2.5 py-1 text-xs text-zinc-400 hover:bg-zinc-700"
        onClick={openSettings}
      >
        <span className="h-2 w-2 rounded-full bg-zinc-600" />
        Drive not connected
      </button>
    )
  }

  const dot =
    status.state === 'idle'
      ? 'bg-emerald-400'
      : status.state === 'syncing'
        ? 'bg-amber-400 animate-pulse'
        : status.state === 'conflict'
          ? 'bg-orange-400'
          : status.state === 'offline'
            ? 'bg-zinc-500'
            : 'bg-red-400'
  const label =
    status.state === 'idle'
      ? 'Synced'
      : status.state === 'syncing'
        ? 'Syncing…'
        : status.state === 'conflict'
          ? 'Conflict'
          : status.state === 'offline'
            ? 'Offline'
            : 'Error'
  const title = status.message || label

  return (
    <button
      title={title}
      className="flex items-center gap-1.5 rounded-md bg-zinc-800/80 px-2.5 py-1 text-xs text-zinc-400 hover:bg-zinc-700"
      onClick={() => void hal.driveSyncNow()}
    >
      <span className={`h-2 w-2 rounded-full ${dot}`} />
      {label}
      {status.pending > 0 && <span className="text-zinc-500">({status.pending})</span>}
    </button>
  )
}

const VIEW_BUTTONS = [
  { mode: 'edit', label: 'Edit' },
  { mode: 'split', label: 'Split' },
  { mode: 'preview', label: 'Preview' }
] as const

export function TopBar() {
  const active = useVault((s) => s.snapshot.notes.find((n) => n.id === s.activeId))
  const mode = useUi((s) => s.mode)
  const setMode = useUi((s) => s.setMode)
  const sidebarOpen = useUi((s) => s.sidebarOpen)
  const rightOpen = useUi((s) => s.rightOpen)
  const viewMode = useUi((s) => s.viewMode)
  const graphOpen = useUi((s) => s.graphOpen)
  const toggleGraph = useUi((s) => s.toggleGraph)
  const debugConsole = useUi((s) => s.settings?.debugConsole ?? false)
  const consoleOpen = useUi((s) => s.consoleOpen)
  const toggleSidebar = useUi((s) => s.toggleSidebar)
  const toggleRight = useUi((s) => s.toggleRight)
  const setViewMode = useUi((s) => s.setViewMode)
  const openSettings = useUi((s) => s.openSettings)

  return (
    <header className="flex h-11 shrink-0 items-center gap-3 border-b border-zinc-800 bg-zinc-900/60 px-3">
      <button
        title="Toggle sidebar (Ctrl+B)"
        className={`rounded-md p-1.5 hover:bg-zinc-800 ${sidebarOpen && mode === 'notes' ? 'text-violet-300' : 'text-zinc-500'}`}
        onClick={toggleSidebar}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M2 3h12v10H2V3zm2 1.5v7h2v-7H4z" />
        </svg>
      </button>

      <div className="flex items-center gap-2 select-none">
        <span className="text-violet-400 text-lg leading-none">◉</span>
        <span className="font-semibold tracking-wide text-zinc-100">HAL Notes</span>
      </div>

      <div className="flex overflow-hidden rounded-md border border-zinc-700 text-xs">
        <button
          className={`px-2.5 py-1 ${mode === 'notes' ? 'bg-violet-500/20 text-violet-300' : 'text-zinc-400 hover:bg-zinc-800'}`}
          onClick={() => setMode('notes')}
        >
          Notes
        </button>
        <button
          className={`px-2.5 py-1 ${mode === 'research' ? 'bg-violet-500/20 text-violet-300' : 'text-zinc-400 hover:bg-zinc-800'}`}
          onClick={() => setMode('research')}
        >
          🔬 Research
        </button>
        <button
          className={`px-2.5 py-1 ${mode === 'review' ? 'bg-violet-500/20 text-violet-300' : 'text-zinc-400 hover:bg-zinc-800'}`}
          onClick={() => setMode('review')}
        >
          🧠 Review
        </button>
      </div>

      {mode === 'notes' && (
        <>
          <div className="mx-1 h-4 w-px bg-zinc-800" />
          <div className="min-w-0 flex-1 truncate text-sm text-zinc-500">{active ? active.path : 'No note open'}</div>
        </>
      )}
      {mode === 'research' && <div className="min-w-0 flex-1" />}

      <SyncPill />

      {debugConsole && (
        <button
          title="Debug console"
          className={`rounded-md p-1.5 hover:bg-zinc-800 ${consoleOpen ? 'text-amber-300' : 'text-zinc-500'}`}
          onClick={() => useUi.setState({ consoleOpen: !consoleOpen })}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M1.5 3h13v8h-13V3zm1.8 1.6v4.8h9.4V4.6H3.3zM5 12h6v1.5H5V12z" />
            <path d="M4.2 7.2 5.5 5.9l.9.9-.8.8.8.8-.7.7-1.5-1.5v-.4zM11 6.8l-.9.9.8.8-.8.8.7.7 1.5-1.5v-.4L11 6.8z" fill="#0f1116" />
          </svg>
        </button>
      )}

      {mode === 'notes' && (
        <>
          <div className="flex overflow-hidden rounded-md border border-zinc-700 text-xs">
            {VIEW_BUTTONS.map((v) => (
              <button
                key={v.mode}
                className={`px-2.5 py-1 ${viewMode === v.mode ? 'bg-violet-500/20 text-violet-300' : 'text-zinc-400 hover:bg-zinc-800'}`}
                onClick={() => setViewMode(v.mode)}
              >
                {v.label}
              </button>
            ))}
          </div>

          <button
            title="Graph view — pan, zoom, drag; click a note to open it"
            className={`rounded-md p-1.5 hover:bg-zinc-800 ${graphOpen ? 'text-violet-300' : 'text-zinc-500'}`}
            onClick={toggleGraph}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <circle cx="3" cy="4" r="2" />
              <circle cx="13" cy="6" r="2" />
              <circle cx="8" cy="13" r="2" />
              <path d="M4.8 4.9 11 5.8M4.4 5.7 6.9 11.6M12 7.9 9.6 11.5" stroke="currentColor" strokeWidth="1.2" fill="none" />
            </svg>
          </button>

          <button
            title="HAL chat (Ctrl+J)"
            className={`rounded-md p-1.5 hover:bg-zinc-800 ${rightOpen ? 'text-violet-300' : 'text-zinc-500'}`}
            onClick={toggleRight}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 1.5A5.5 5.5 0 0 1 13.5 7c0 1.6-.7 3-1.8 4v2.5l-2.1-1a6 6 0 0 1-1.6.2A5.5 5.5 0 0 1 2.5 7 5.5 5.5 0 0 1 8 1.5z" />
            </svg>
          </button>
        </>
      )}

      <button
        title="Settings (Ctrl+,)"
        className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
        onClick={openSettings}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M9.4 1l.3 1.8c.4.1.8.3 1.2.6l1.7-.8 1.4 2.4-1.4 1.2a5 5 0 0 1 0 1.4l1.4 1.2-1.4 2.4-1.7-.8c-.4.3-.8.5-1.2.6L9.4 15H6.6l-.3-1.8c-.4-.1-.8-.3-1.2-.6l-1.7.8-1.4-2.4 1.4-1.2a5 5 0 0 1 0-1.4L2 7.2 3.4 4.8l1.7.8c.4-.3.8-.5 1.2-.6L6.6 3h2.8zM8 6a2 2 0 1 0 0 4 2 2 0 0 0 0-4z" />
        </svg>
      </button>
    </header>
  )
}
