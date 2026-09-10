import { useDeferredValue, useMemo, type RefObject } from 'react'
import { renderMarkdown } from '@/lib/markdown'
import { hal } from '@/lib/ipc'
import { useUi } from '@/state/ui'
import { useVault } from '@/state/vault'

export function PreviewPane({ containerRef }: { containerRef: RefObject<HTMLDivElement | null> }) {
  const activeContent = useVault((s) => s.activeContent)
  const dark = useUi((s) => (s.settings?.theme ?? 'dark') === 'dark')
  const readingWidth = useUi((s) => s.settings?.readingWidth ?? 'full')
  const deferred = useDeferredValue(activeContent)
  const html = useMemo(() => renderMarkdown(deferred), [deferred])
  const widthClass = readingWidth === 'full' ? 'max-w-none' : readingWidth === 'wide' ? 'max-w-5xl' : 'max-w-[70ch]'

  return (
    <div ref={containerRef} className="h-full min-h-0 min-w-0 flex-1 overflow-y-auto">
      <div
        className={`preview prose prose-zinc mx-auto w-full ${widthClass} px-8 py-6 ${dark ? 'prose-invert' : ''}`}
        onClick={(e) => {
          const el = e.target as HTMLElement
          const file = el.closest('a.hal-file') as HTMLElement | null
          if (file) {
            e.preventDefault()
            void hal.attachmentOpenExternal(file.dataset.attachment ?? '')
            return
          }
          const wl = el.closest('a.wl') as HTMLElement | null
          if (wl) {
            e.preventDefault()
            void useVault.getState().openByName(wl.dataset.wikilinkTarget ?? '')
            return
          }
          const tag = el.closest('[data-tag]') as HTMLElement | null
          if (tag) useUi.getState().seedSearch(tag.dataset.tag ?? '')
        }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  )
}
