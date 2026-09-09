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
        <div className="mb-4 text-6xl text-violet-400">◉</div>
        <h1 className="text-2xl font-semibold text-zinc-100">HAL Notes</h1>
        <p className="mt-2 text-sm text-zinc-500">
          A markdown vault that syncs with your Google Drive and thinks with Gemini.
        </p>
        <div className="mt-8 flex flex-col items-center gap-2">
          <button
            className="w-64 rounded-lg bg-violet-500 px-4 py-2 text-sm font-medium text-white hover:bg-violet-400"
            onClick={() => void createNote(null)}
          >
            Create your first note
          </button>
          <button
            className={`w-64 rounded-lg px-4 py-2 text-sm ${
              driveConnected
                ? 'border border-emerald-500/30 text-emerald-400'
                : 'border border-zinc-700 text-zinc-300 hover:bg-zinc-800'
            }`}
            onClick={openSettings}
          >
            {driveConnected ? '✓ Google Drive connected' : 'Connect Google Drive'}
          </button>
          <button
            className={`w-64 rounded-lg px-4 py-2 text-sm ${
              geminiKeySet
                ? 'border border-emerald-500/30 text-emerald-400'
                : 'border border-zinc-700 text-zinc-300 hover:bg-zinc-800'
            }`}
            onClick={openSettings}
          >
            {geminiKeySet ? '✓ Gemini connected' : 'Connect Gemini'}
          </button>
        </div>
        <p className="mt-8 text-[11px] leading-5 text-zinc-600">
          Link notes with <span className="text-violet-400">[[double brackets]]</span>, tag them with{' '}
          <span className="text-emerald-400">#tags</span>, then ask HAL anything in the panel on the right.
        </p>
      </div>
    </div>
  )
}
