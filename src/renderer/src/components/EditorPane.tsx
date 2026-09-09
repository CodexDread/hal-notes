import { useEffect, useRef, type RefObject } from 'react'
import { EditorView } from '@codemirror/view'
import { createEditorState, replaceDoc } from '@/lib/cm'
import type { CmOptions } from '@/lib/cm'
import { useVault } from '@/state/vault'

export function EditorPane({ previewRef }: { previewRef: RefObject<HTMLDivElement | null> }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const activeId = useVault((s) => s.activeId)
  const activeContent = useVault((s) => s.activeContent)

  useEffect(() => {
    const opts: CmOptions = {
      onOpenNote: (target) => void useVault.getState().openByName(target),
      getNoteNames: () => useVault.getState().snapshot.notes.map((n) => n.name),
      getTags: () => useVault.getState().tagCounts.map((t) => t.tag),
      onChange: (doc) => useVault.getState().setContent(doc)
    }
    const view = new EditorView({
      parent: hostRef.current!,
      state: createEditorState(useVault.getState().activeContent, opts)
    })
    viewRef.current = view

    let raf = 0
    const syncScroll = (): void => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const target = previewRef.current
        if (!target) return
        const scroller = view.scrollDOM
        const denom = scroller.scrollHeight - scroller.clientHeight
        const ratio = denom > 0 ? scroller.scrollTop / denom : 0
        target.scrollTop = ratio * (target.scrollHeight - target.clientHeight)
      })
    }
    view.scrollDOM.addEventListener('scroll', syncScroll)

    return () => {
      view.scrollDOM.removeEventListener('scroll', syncScroll)
      cancelAnimationFrame(raf)
      view.destroy()
      viewRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    replaceDoc(view, activeContent)
  }, [activeId, activeContent])

  return <div ref={hostRef} className="h-full min-h-0 flex-1 overflow-hidden" />
}
