import { useEffect } from 'react'
import { hal } from '@/lib/ipc'
import { useResearch } from '@/state/research'
import { NotebookList } from './NotebookList'
import { NotebookView } from './NotebookView'

export function ResearchMode() {
  const loaded = useResearch((s) => s.loaded)
  const load = useResearch((s) => s.load)

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const offs = [
      hal.on('research:path-updated', ({ notebookId }) => {
        const s = useResearch.getState()
        if (s.activeId === notebookId) void s.refreshActive()
        void s.refreshPath()
      }),
      hal.on('research:path-error', ({ notebookId, error }) => {
        const s = useResearch.getState()
        if (s.activeId === notebookId) void s.refreshActive()
        void s.refreshPath()
        console.error('[research] path failed:', error)
      }),
      hal.on('research-chat:delta', ({ id, delta }) => useResearch.getState().onChatDelta(id, delta)),
      hal.on('research-chat:done', ({ id }) => useResearch.getState().onChatDone(id)),
      hal.on('research-chat:error', ({ id, error }) => useResearch.getState().onChatError(id, error))
    ]
    return () => offs.forEach((off) => off())
  }, [])

  if (!loaded) {
    return <div className="grid h-full place-items-center text-sm text-[var(--hal-dim)] opacity-80">Loading research…</div>
  }

  return (
    <div className="flex h-full min-h-0 flex-1">
      <NotebookList />
      <NotebookView />
    </div>
  )
}
