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
    <div className="flex flex-wrap items-center gap-1.5 border-b border-[var(--hal-hairline)] bg-[var(--hal-amber)]/5 px-4 py-1.5 text-xs">
      <span className="mr-1 text-[var(--hal-amber)]">✦ HAL suggests:</span>
      {suggestion.title && (
        <span className="rounded-full bg-[var(--hal-amber-dim)] px-2 py-0.5 text-[var(--hal-amber)]" title="Rename note">
          ✎ {suggestion.title}
        </span>
      )}
      {suggestion.tags.map((t) => (
        <span key={t} className="rounded-full bg-[color-mix(in_srgb,var(--hal-lamp-green)_12%,transparent)] px-2 py-0.5 text-[var(--hal-lamp-green)]">
          #{t}
        </span>
      ))}
      {suggestion.links.map((l, i) => (
        <span key={i} className="rounded-full bg-sky-400/15 px-2 py-0.5 text-[var(--hal-amber)]">
          ↗ {l.target}
        </span>
      ))}
      <span className="flex-1" />
      <button className="rounded bg-[var(--hal-amber-dim)] px-2 py-0.5 text-[var(--hal-amber)] hover:bg-[var(--hal-amber)]/40" onClick={apply}>
        Apply all
      </button>
      <button className="rounded px-2 py-0.5 text-[var(--hal-dim)] hover:bg-[var(--hal-plate-2)]" onClick={dismiss}>
        Dismiss
      </button>
    </div>
  )
}
