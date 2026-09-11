import { useVault } from '@/state/vault'
import { useUi } from '@/state/ui'
import { hal } from '@/lib/ipc'

function SyncAnnunciator() {
  const status = useUi((s) => s.syncStatus)
  const driveConnected = useVault((s) => s.snapshot.driveConnected)
  const openSettings = useUi((s) => s.openSettings)

  if (!driveConnected || !status || status.state === 'unlinked') {
    return (
      <button className="annun" onClick={openSettings} title="Connect Google Drive in Settings">
        <span className="lamp" />
        SYNC
      </button>
    )
  }

  const lampClass =
    status.state === 'idle'
      ? 'lamp lamp-green'
      : status.state === 'syncing'
        ? 'lamp lamp-amber lamp-blink'
        : status.state === 'conflict'
          ? 'lamp lamp-amber'
          : status.state === 'offline'
            ? 'lamp'
            : 'lamp lamp-red'
  const label = status.state === 'idle' ? 'SYNC' : status.state === 'syncing' ? 'XMIT' : status.state === 'conflict' ? 'CFCT' : status.state === 'offline' ? 'OFFL' : 'FAIL'
  const title =
    status.message ||
    (status.state === 'idle' ? 'Synchronized' : status.state === 'syncing' ? 'Transmitting' : status.state)

  return (
    <button className="annun" title={title} onClick={() => void hal.driveSyncNow()}>
      <span className={lampClass} />
      {label}
      {status.pending > 0 && <span className="mono text-[9px] opacity-70">{status.pending}</span>}
    </button>
  )
}

const VIEW_KEYS = [
  { mode: 'edit', label: 'EDIT' },
  { mode: 'split', label: 'SPLIT' },
  { mode: 'preview', label: 'VIEW' }
] as const

export function TopBar() {
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
    <header className="flex h-11 shrink-0 items-center gap-1 border-b px-3" style={{ background: 'var(--hal-plate)', borderColor: 'var(--hal-hairline)' }}>
      <button
        title="File rail (Ctrl+B)"
        className={`annun ${sidebarOpen && mode === 'notes' ? 'annun-active' : ''}`}
        onClick={toggleSidebar}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
          <rect x="1" y="2" width="10" height="1.4" />
          <rect x="1" y="5.3" width="10" height="1.4" />
          <rect x="1" y="8.6" width="10" height="1.4" />
        </svg>
      </button>

      <div className="flex select-none items-center gap-2 pl-1 pr-2">
        <span className="relative inline-grid place-items-center" title="HAL — observer ready">
          <span className="absolute h-5 w-5 rounded-full border" style={{ borderColor: 'var(--hal-amber)', opacity: 0.85 }} />
          <span className="eye-instrument absolute h-5 w-5 rounded-full" style={{ boxShadow: '0 0 10px 1px var(--hal-amber-dim)' }} />
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--hal-amber)' }} />
        </span>
        <span className="legend" style={{ color: 'var(--hal-ivory)' }}>
          HAL NOTES
        </span>
      </div>

      <div className="mx-1 h-4 w-px" style={{ background: 'var(--hal-hairline)' }} />

      <button className={`annun ${mode === 'notes' ? 'annun-active' : ''}`} onClick={() => setMode('notes')}>
        <span className={`lamp ${mode === 'notes' ? 'lamp-amber' : ''}`} />
        NOTES
      </button>
      <button className={`annun ${mode === 'research' ? 'annun-active' : ''}`} onClick={() => setMode('research')}>
        <span className={`lamp ${mode === 'research' ? 'lamp-amber' : ''}`} />
        RESEARCH
      </button>
      <button className={`annun ${mode === 'review' ? 'annun-active' : ''}`} onClick={() => setMode('review')}>
        <span className={`lamp ${mode === 'review' ? 'lamp-amber' : ''}`} />
        REVIEW
      </button>

      <span className="flex-1" />

      <SyncAnnunciator />

      {mode === 'notes' && (
        <span className="mx-1 flex overflow-hidden border" style={{ borderColor: 'var(--hal-hairline)' }}>
          {VIEW_KEYS.map((v) => (
            <button
              key={v.mode}
              className={`key border-0 ${viewMode === v.mode ? 'key-keyed' : ''}`}
              onClick={() => setViewMode(v.mode)}
            >
              {v.label}
            </button>
          ))}
          <button className={`key border-0 ${graphOpen ? 'key-keyed' : ''}`} onClick={toggleGraph} title="Star chart">
            GRAPH
          </button>
        </span>
      )}

      {mode === 'notes' && (
        <button className={`annun ${rightOpen ? 'annun-active' : ''}`} onClick={toggleRight} title="HAL bay (Ctrl+J)">
          <span className={`lamp ${rightOpen ? 'lamp-amber' : ''}`} />
          HAL
        </button>
      )}

      {debugConsole && (
        <button
          className={`key ${consoleOpen ? 'key-keyed' : ''}`}
          onClick={() => useUi.setState({ consoleOpen: !consoleOpen })}
          title="Console"
        >
          LOG
        </button>
      )}

      <button className="key" onClick={openSettings} title="Settings (Ctrl+,)">
        CONFIG
      </button>
    </header>
  )
}
