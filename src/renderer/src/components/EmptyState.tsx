import { useUi } from '@/state/ui'
import { useVault } from '@/state/vault'

export function EmptyState() {
  const createNote = useVault((s) => s.createNote)
  const openSettings = useUi((s) => s.openSettings)
  const driveConnected = useVault((s) => s.snapshot.driveConnected)
  const geminiKeySet = useUi((s) => s.settings?.geminiKeySet ?? false)

  return (
    <div className="flex h-full items-center justify-center">
      <div className="max-w-md text-center">
        <div className="mb-4 text-6xl text-[var(--hal-amber)]">◉</div>
        <h1 className="text-2xl font-semibold text-[var(--hal-ivory)]">HAL Notes</h1>
        <p className="mt-2 text-sm text-[var(--hal-dim)]">
          A markdown vault that syncs with your Google Drive and thinks with Gemini.
        </p>
        <div className="mt-8 flex flex-col items-center gap-2">
          <button
            className="w-64 rounded-lg bg-[var(--hal-amber)] px-4 py-2 text-sm font-medium text-white hover:opacity-80"
            onClick={() => void createNote(null)}
          >
            Create your first note
          </button>
          <button
            className={`w-64 rounded-lg px-4 py-2 text-sm ${
              driveConnected
                ? 'border border-[var(--hal-lamp-green)] text-[var(--hal-lamp-green)]'
                : 'border border-[var(--hal-hairline)] text-[var(--hal-ink)] hover:bg-[var(--hal-plate-2)]'
            }`}
            onClick={openSettings}
          >
            {driveConnected ? '✓ Google Drive connected' : 'Connect Google Drive'}
          </button>
          <button
            className={`w-64 rounded-lg px-4 py-2 text-sm ${
              geminiKeySet
                ? 'border border-[var(--hal-lamp-green)] text-[var(--hal-lamp-green)]'
                : 'border border-[var(--hal-hairline)] text-[var(--hal-ink)] hover:bg-[var(--hal-plate-2)]'
            }`}
            onClick={openSettings}
          >
            {geminiKeySet ? '✓ Gemini connected' : 'Connect Gemini'}
          </button>
        </div>
        <p className="mt-8 text-[11px] leading-5 text-[var(--hal-dim)] opacity-80">
          Link notes with <span className="text-[var(--hal-amber)]">[[double brackets]]</span>, tag them with{' '}
          <span className="text-[var(--hal-lamp-green)]">#tags</span>, then ask HAL anything in the panel on the right.
        </p>
      </div>
    </div>
  )
}
