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
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-zinc-800 bg-zinc-900/40">
      <div className="flex shrink-0 border-b border-zinc-800">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`flex-1 px-2 py-2 text-xs font-medium ${
              tab === t.id ? 'border-b-2 border-violet-400 text-violet-300' : 'text-zinc-500 hover:text-zinc-300'
            }`}
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
