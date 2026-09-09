import { useMemo, useState } from 'react'
import type { FolderMeta, NoteMeta } from '@shared/types'
import { hal } from '@/lib/ipc'
import { useVault } from '@/state/vault'

interface FolderNode {
  folder: FolderMeta
  children: FolderNode[]
  notes: NoteMeta[]
}

function buildTree(folders: FolderMeta[], notes: NoteMeta[]): { roots: FolderNode[]; rootNotes: NoteMeta[] } {
  const byId = new Map<string, FolderNode>()
  for (const f of folders) byId.set(f.id, { folder: f, children: [], notes: [] })
  const roots: FolderNode[] = []
  for (const f of folders) {
    const node = byId.get(f.id)!
    const parent = f.parentId ? byId.get(f.parentId) : undefined
    if (parent) parent.children.push(node)
    else roots.push(node)
  }
  let rootNotes: NoteMeta[] = []
  for (const n of notes) {
    if (n.parentId && byId.has(n.parentId)) byId.get(n.parentId)!.notes.push(n)
    else rootNotes.push(n)
  }
  rootNotes = rootNotes.sort((a, b) => a.name.localeCompare(b.name))
  const sortTree = (nodes: FolderNode[]): void => {
    nodes.sort((a, b) => a.folder.name.localeCompare(b.folder.name))
    for (const n of nodes) {
      n.notes.sort((a, b) => a.name.localeCompare(b.name))
      sortTree(n.children)
    }
  }
  sortTree(roots)
  return { roots, rootNotes }
}

function NoteRow({ note, depth }: { note: NoteMeta; depth: number }) {
  const activeId = useVault((s) => s.activeId)
  const open = useVault((s) => s.open)
  const trashNote = useVault((s) => s.trashNote)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(note.name)

  const startRename = (): void => {
    setDraft(note.name)
    setEditing(true)
  }
  const commitRename = (): void => {
    setEditing(false)
    if (draft.trim() && draft.trim() !== note.name) {
      void useVault
        .getState()
        .flushSave()
        .then(() => hal.noteRename(note.id, draft.trim()))
        .then(() => useVault.getState().refresh())
    }
  }

  return (
    <div
      className={`group flex cursor-pointer items-center gap-1.5 rounded-md py-[3px] pr-1 text-sm hover:bg-zinc-800/70 ${
        activeId === note.id ? 'bg-violet-500/15 text-violet-200' : 'text-zinc-300'
      }`}
      style={{ paddingLeft: depth * 14 + 22 }}
      onClick={() => void open(note.id)}
      onDoubleClick={(e) => {
        e.stopPropagation()
        startRename()
      }}
    >
      <span className="text-[10px] text-zinc-500">📄</span>
      {editing ? (
        <input
          autoFocus
          className="min-w-0 flex-1 rounded bg-zinc-900 px-1 text-sm outline outline-violet-500"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitRename()
            if (e.key === 'Escape') setEditing(false)
          }}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span className="min-w-0 flex-1 truncate">{note.name}</span>
      )}
      {note.pendingSync && !editing && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400/80" title="Pending sync" />}
      {!editing && (
        <button
          title="Delete note"
          className="hidden shrink-0 rounded px-1 text-xs text-zinc-500 hover:text-red-400 group-hover:block"
          onClick={(e) => {
            e.stopPropagation()
            if (window.confirm(`Delete "${note.name}"?`)) void trashNote(note.id)
          }}
        >
          ✕
        </button>
      )}
    </div>
  )
}

function FolderBranch({ node, depth }: { node: FolderNode; depth: number }) {
  const [open_, setOpen] = useState(true)
  const createNote = useVault((s) => s.createNote)
  const createFolder = useVault((s) => s.createFolder)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(node.folder.name)

  const commit = (): void => {
    setEditing(false)
    if (draft.trim() && draft.trim() !== node.folder.name) {
      void hal.folderRename(node.folder.id, draft.trim()).then(() => useVault.getState().refresh())
    }
  }

  return (
    <div>
      <div
        className="group flex cursor-pointer items-center gap-1 rounded-md py-[3px] pr-1 text-sm text-zinc-200 hover:bg-zinc-800/70"
        style={{ paddingLeft: depth * 14 + 6 }}
        onClick={() => setOpen(!open_)}
        onDoubleClick={(e) => {
          e.stopPropagation()
          setDraft(node.folder.name)
          setEditing(true)
        }}
      >
        <span className={`text-[10px] text-zinc-500 transition-transform ${open_ ? 'rotate-90' : ''}`}>▶</span>
        <span className="text-[11px]">{open_ ? '📂' : '📁'}</span>
        {editing ? (
          <input
            autoFocus
            className="min-w-0 flex-1 rounded bg-zinc-900 px-1 text-sm outline outline-violet-500"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit()
              if (e.key === 'Escape') setEditing(false)
            }}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="min-w-0 flex-1 truncate font-medium">{node.folder.name}</span>
        )}
        {!editing && (
          <span className="hidden items-center gap-0.5 group-hover:flex">
            <button
              title="New note in folder"
              className="rounded px-1 text-xs text-zinc-500 hover:text-violet-300"
              onClick={(e) => {
                e.stopPropagation()
                void createNote(node.folder.id)
              }}
            >
              ＋
            </button>
            <button
              title="New subfolder"
              className="rounded px-1 text-[10px] text-zinc-500 hover:text-violet-300"
              onClick={(e) => {
                e.stopPropagation()
                void createFolder(node.folder.id)
              }}
            >
              ▤
            </button>
          </span>
        )}
      </div>
      {open_ && (
        <div>
          {node.children.map((c) => (
            <FolderBranch key={c.folder.id} node={c} depth={depth + 1} />
          ))}
          {node.notes.map((n) => (
            <NoteRow key={n.id} note={n} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  )
}

export function FileTree() {
  const snapshot = useVault((s) => s.snapshot)
  const createNote = useVault((s) => s.createNote)
  const createFolder = useVault((s) => s.createFolder)
  const { roots, rootNotes } = useMemo(() => buildTree(snapshot.folders, snapshot.notes), [snapshot])

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Files</span>
        <span className="flex gap-1">
          <button
            title="New note (Ctrl+N)"
            className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-violet-300"
            onClick={() => void createNote(null)}
          >
            ＋
          </button>
          <button
            title="New folder"
            className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-violet-300"
            onClick={() => void createFolder(null)}
          >
            ▤
          </button>
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {snapshot.notes.length === 0 && snapshot.folders.length === 0 ? (
          <p className="px-2 py-4 text-xs text-zinc-600">No notes yet. Create your first note with ＋.</p>
        ) : (
          <>
            {roots.map((r) => (
              <FolderBranch key={r.folder.id} node={r} depth={0} />
            ))}
            {rootNotes.map((n) => (
              <NoteRow key={n.id} note={n} depth={0} />
            ))}
          </>
        )}
      </div>
    </div>
  )
}
