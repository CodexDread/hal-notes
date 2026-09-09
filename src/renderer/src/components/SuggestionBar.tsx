import { useUi } from '@/state/ui'
import { useVault } from '@/state/vault'

export function SuggestionBar() {
  const activeId = useVault((s) => s.activeId)
  const suggestion = useUi((s) => (activeId ? s.suggestions[activeId] : undefined))
  const dismissSuggestion = useUi((s) => s.dismissSuggestion)
  if (!activeId || !suggestion || suggestion.noteId !== activeId) return null

  const apply = (): void => {
    const vault = useVault.getState()
    let content = vault.activeContent
    for (const link of suggestion.links) {
      content = content.replace(link.text, `[[${link.target}|${link.text}]]`)
    }
    const newTags = suggestion.tags.filter((t) => !content.toLowerCase().includes(`#${t.toLowerCase()}`))
    if (newTags.length > 0) {
      content = `${content.trimEnd()}\n\n${newTags.map((t) => `#${t}`).join(' ')}`
    }
    if (content !== vault.activeContent) vault.setContent(content)
    if (suggestion.title) void vault.renameActive(suggestion.title)
    dismissSuggestion(activeId)
  }

  const dismiss = (): void => dismissSuggestion(activeId)

  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-zinc-800 bg-violet-500/5 px-4 py-1.5 text-xs">
      <span className="mr-1 text-violet-300">✦ HAL suggests:</span>
      {suggestion.title && (
        <span className="rounded-full bg-violet-400/15 px-2 py-0.5 text-violet-200" title="Rename note">
          ✎ {suggestion.title}
        </span>
      )}
      {suggestion.tags.map((t) => (
        <span key={t} className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-emerald-300">
          #{t}
        </span>
      ))}
      {suggestion.links.map((l, i) => (
        <span key={i} className="rounded-full bg-sky-400/15 px-2 py-0.5 text-sky-300">
          ↗ {l.target}
        </span>
      ))}
      <span className="flex-1" />
      <button className="rounded bg-violet-500/25 px-2 py-0.5 text-violet-200 hover:bg-violet-500/40" onClick={apply}>
        Apply all
      </button>
      <button className="rounded px-2 py-0.5 text-zinc-500 hover:bg-zinc-800" onClick={dismiss}>
        Dismiss
      </button>
    </div>
  )
}
