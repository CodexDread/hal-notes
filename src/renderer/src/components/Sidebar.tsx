import { FileTree } from './FileTree'
import { SearchPane } from './SearchPane'
import { TagsPane } from './TagsPane'
import { useUi, type SidebarTab } from '@/state/ui'

const TABS: { id: SidebarTab; label: string }[] = [
  { id: 'files', label: 'Files' },
  { id: 'search', label: 'Search' },
  { id: 'tags', label: 'Tags' }
]

export function Sidebar() {
  const tab = useUi((s) => s.sidebarTab)
  const setTab = useUi((s) => s.setSidebarTab)

  return (
    <aside
      className="flex h-full w-60 min-w-52 shrink-0 flex-col border-r"
      style={{ background: 'var(--hal-plate)', borderColor: 'var(--hal-hairline)' }}
    >
      <div className="flex shrink-0 border-b" style={{ borderColor: 'var(--hal-hairline)' }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`annun flex-1 justify-center border-0 ${tab === t.id ? 'annun-active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1">
        {tab === 'files' && <FileTree />}
        {tab === 'search' && <SearchPane />}
        {tab === 'tags' && <TagsPane />}
      </div>
    </aside>
  )
}
