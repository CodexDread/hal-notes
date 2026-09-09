import { useEffect } from 'react'
import { EditorArea } from './components/EditorArea'
import { RightPanel } from './components/RightPanel'
import { SettingsModal } from './components/SettingsModal'
import { Sidebar } from './components/Sidebar'
import { StatusBar } from './components/StatusBar'
import { TopBar } from './components/TopBar'
import { hal } from './lib/ipc'
import { useChat } from './state/chat'
import { loadSettings, useUi } from './state/ui'
import { useVault } from './state/vault'

export function App() {
  const initialized = useVault((s) => s.initialized)
  const sidebarOpen = useUi((s) => s.sidebarOpen)
  const rightOpen = useUi((s) => s.rightOpen)

  useEffect(() => {
    void useVault.getState().init()
    void loadSettings()
  }, [])

  useEffect(() => {
    const offs = [
      hal.on('vault:changed', () => void useVault.getState().refresh()),
      hal.on('note:updated', ({ id, content }) => useVault.getState().applyExternalUpdate(id, content)),
      hal.on('sync:status', (s) => useUi.getState().setSyncStatus(s)),
      hal.on('settings:changed', (s) => useUi.getState().applySettings(s)),
      hal.on('embed:progress', (p) => useUi.getState().setEmbedProgress(p)),
      hal.on('drive:status-changed', () => void useVault.getState().refresh()),
      hal.on('capture:suggestion', (sug) => {
        if (useVault.getState().activeId === sug.noteId) useUi.getState().setSuggestion(sug)
      }),
      hal.on('hal:delta', ({ id, delta }) => useChat.getState().onDelta(id, delta)),
      hal.on('hal:done', ({ id, citations }) => useChat.getState().onDone(id, citations)),
      hal.on('hal:error', ({ id, error }) => useChat.getState().onError(id, error))
    ]
    return () => offs.forEach((off) => off())
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return
      const key = e.key.toLowerCase()
      if (key === 'n') {
        e.preventDefault()
        void useVault.getState().createNote(null)
      } else if (key === 's') {
        e.preventDefault()
        void useVault.getState().flushSave()
      } else if (key === 'p' || key === 'k') {
        e.preventDefault()
        useUi.getState().seedSearch('')
      } else if (key === 'b') {
        e.preventDefault()
        useUi.getState().toggleSidebar()
      } else if (key === 'j') {
        e.preventDefault()
        useUi.getState().toggleRight()
      } else if (key === ',') {
        e.preventDefault()
        useUi.getState().openSettings()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!initialized) {
    return (
      <div className="grid h-full place-items-center bg-zinc-950">
        <div className="animate-pulse text-center">
          <div className="text-5xl text-violet-400">◉</div>
          <p className="mt-3 text-sm text-zinc-500">HAL Notes</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col bg-zinc-950 text-zinc-200">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        {sidebarOpen && <Sidebar />}
        <EditorArea />
        {rightOpen && <RightPanel />}
      </div>
      <StatusBar />
      <SettingsModal />
    </div>
  )
}
