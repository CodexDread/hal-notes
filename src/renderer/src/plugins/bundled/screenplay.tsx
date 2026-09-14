import { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { EditorState, RangeSetBuilder } from '@codemirror/state'
import { Decoration, EditorView, ViewPlugin, keymap, type DecorationSet, type ViewUpdate } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { autocompletion, type CompletionContext } from '@codemirror/autocomplete'
import { sceneOutline, screenplayStats } from '@shared/fountain'
import type { HalPluginSdk } from '../host'

const FOUNTAIN_STORAGE_KEY = 'screenplay-docs' // JSON: { noteId: string; title: string }[]

interface ScreenplayDoc {
  noteId: string
  title: string
}

const NEW_DOC = `INT. SOMEWHERE - DAY

Something happens here.

CHARACTER
This is where dialogue goes.
`

/** Fountain syntax highlighting — a light StreamLanguage-style decorator pass. */
const fountainHighlights = EditorView.theme(
  {
    '.cm-fountain-scene': { color: 'var(--hal-amber)', fontWeight: '600', textTransform: 'uppercase' },
    '.cm-fountain-character': { color: 'var(--hal-lamp-green)', fontWeight: '600', marginLeft: '22%' },
    '.cm-fountain-dialogue': { marginLeft: '16%', marginRight: '16%' },
    '.cm-fountain-paren': { color: 'var(--hal-dim)', marginLeft: '20%' },
    '.cm-fountain-transition': { color: 'var(--hal-dim)', textAlign: 'right', fontWeight: '600' }
  },
  { dark: true }
)

function classifyLine(line: string): string | null {
  const t = line.trim()
  if (/^(INT\.?|EXT\.?|EST\.?|INT\.?\/EXT\.?|I\/E\.?)[\s\.]/i.test(t)) return 'cm-fountain-scene'
  if (/^[A-Z0-9 '.-]+$/.test(t) && t.length > 1 && !t.endsWith(':')) return 'cm-fountain-character'
  if (t.startsWith('(') && t.endsWith(')')) return 'cm-fountain-paren'
  if (/(TO:|FADE (IN|OUT)|FADE TO BLACK)/i.test(t) && t === t.toUpperCase()) return 'cm-fountain-transition'
  return null
}

const fountainPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = buildLineDeco(view)
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) this.decorations = buildLineDeco(update.view)
    }
  },
  { decorations: (v) => v.decorations }
)

function buildLineDeco(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  for (const { from, to } of view.visibleRanges) {
    for (let pos = from; pos <= to; ) {
      const line = view.state.doc.lineAt(pos)
      const cls = classifyLine(line.text)
      if (cls && line.text.trim() !== '') builder.add(line.from, line.from, Decoration.line({ class: cls }))
      pos = line.to + 1
    }
  }
  return builder.finish()
}

function fountainEditor(opts: {
  onDocChange(text: string): void
  getCharacters(): string[]
}): any[] {
  const sceneSource = (ctx: CompletionContext): any => {
    const line = ctx.state.doc.lineAt(ctx.pos)
    const before = line.text.slice(0, ctx.pos - line.from)
    if (/^(I|IN|E|EX|ES|S)[A-Z/.]*$/i.test(before.trim())) {
      return {
        from: line.from,
        options: ['INT. ', 'EXT. ', 'INT./EXT. ', 'EST. '].map((label) => ({ label, type: 'text' }))
      }
    }
    return null
  }

  const charSource = (ctx: CompletionContext): any => {
    const line = ctx.state.doc.lineAt(ctx.pos)
    const before = line.text.slice(0, ctx.pos - line.from)
    if (/^[A-Z][A-Z '.-]*$/.test(before) && before.length > 0) {
      const prevBlank = line.number > 1 && ctx.state.doc.line(line.number - 1).text.trim() === ''
      if (prevBlank) {
        return {
          from: line.from,
          options: opts.getCharacters().map((c) => ({ label: c, type: 'text' }))
        }
      }
    }
    return null
  }

  return [
    fountainHighlights,
    fountainPlugin,
    autocompletion({ override: [sceneSource, charSource] }),
    EditorView.updateListener.of((u) => {
      if (u.docChanged) opts.onDocChange(u.state.doc.toString())
    })
  ]
}

function ScreenplayMode({ sdk }: { sdk: HalPluginSdk }) {
  const [docs, setDocs] = useState<ScreenplayDoc[]>([])
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null)
  const [content, setContent] = useState('')
  const contentRef = useRef('')
  const [titleDraft, setTitleDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

    const [linesPerPage, setLinesPerPage] = useState(55)
  useEffect(() => {
    const fetchCfg = (): void => {
      void (window as unknown as { hal: import('@shared/api').HalApi }).hal
        .settingsGet()
        .then((s) => {
          const v = s.plugins?.config?.['hal.screenplay']?.linesPerPage
          setLinesPerPage(typeof v === 'number' ? v : 55)
        })
        .catch(() => undefined)
    }
    fetchCfg()
    const off = (window as unknown as { hal: import('@shared/api').HalApi }).hal.on('settings:changed', fetchCfg)
    return off
  }, [])
  const stats = useMemo(() => screenplayStats(content, linesPerPage), [content, linesPerPage])
  const outline = useMemo(() => sceneOutline(content), [content])

  useEffect(() => {
    void sdk.storage.get(FOUNTAIN_STORAGE_KEY).then(async (raw) => {
      if (!raw) return
      try {
        const list = JSON.parse(raw) as ScreenplayDoc[]
        setDocs(list)
        // Stale ids (Drive swap) get healed before first selection
        const vault = await sdk.notes.list()
        let changed = false
        const healed = list.map((d) => {
          if (vault.notes.some((n) => n.id === d.noteId)) return d
          const byTitle = vault.notes.find((n) => n.name === d.title)
          if (byTitle) {
            changed = true
            return { ...d, noteId: byTitle.id }
          }
          return d
        })
        if (changed) {
          setDocs(healed)
          await sdk.storage.set(FOUNTAIN_STORAGE_KEY, JSON.stringify(healed))
        }
        if (healed[0]) void openDoc(healed[0].noteId)
      } catch {
        // corrupt registry — start empty
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const persistDocs = async (list: ScreenplayDoc[]): Promise<void> => {
    setDocs(list)
    await sdk.storage.set(FOUNTAIN_STORAGE_KEY, JSON.stringify(list))
  }

  /** Note ids swap (local-… → Drive id) after sync; re-resolve dead ids by title. */
  const reconcileDocs = async (): Promise<ScreenplayDoc[]> => {
    const vault = await sdk.notes.list()
    let changed = false
    const reconciled = docs.map((d) => {
      const stillThere = vault.notes.some((n) => n.id === d.noteId)
      if (stillThere) return d
      const byTitle = vault.notes.find((n) => n.name === d.title)
      if (byTitle) {
        changed = true
        return { ...d, noteId: byTitle.id }
      }
      return d
    })
    if (changed) await persistDocs(reconciled)
    return reconciled
  }

  const openDoc = async (noteId: string): Promise<void> => {
    let note = await sdk.notes.open(noteId)
    if (!note) {
      // id went stale (Drive upload swapped it) — reconcile by title and retry
      const reconciled = await reconcileDocs()
      const byOld = reconciled.find((d) => d.noteId === noteId)
      const byCurrentTitle = reconciled.find((d) => d.title === docs.find((x) => x.noteId === noteId)?.title)
      const retryId = byOld?.noteId ?? byCurrentTitle?.noteId ?? noteId
      note = await sdk.notes.open(retryId)
      if (!note) return
      noteId = retryId
    }
    contentRef.current = note.content
    setContent(note.content)
    setActiveNoteId(noteId)
    setTitleDraft(note.meta.name)
  }

  useEffect(() => {
    if (!hostRef.current) return
    const view = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({
        doc: contentRef.current,
        extensions: [
          EditorView.lineWrapping,
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
          fountainEditor({
            onDocChange: (text) => {
              contentRef.current = text
              setContent(text)
              if (saveTimer.current) clearTimeout(saveTimer.current)
              saveTimer.current = setTimeout(() => void flushRef.current(), 900)
            },
            getCharacters: () => statsRef.current
          })
        ]
      })
    })
    viewRef.current = view
    return () => {
      view.destroy()
      viewRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Swap documents imperatively on doc change — never as a reaction to typing.
  useEffect(() => {
    const view = viewRef.current
    if (!view || !activeNoteId) return
    const current = view.state.doc.toString()
    if (current !== contentRef.current) {
      view.dispatch({ changes: { from: 0, to: current.length, insert: contentRef.current } })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeNoteId])

  const statsRef = useRef<string[]>([])
  statsRef.current = stats.characters
  const flushRef = useRef<() => void>(() => undefined)

  const flush = async (): Promise<void> => {
    if (!activeNoteId) return
    setSaving(true)
    await sdk.notes.save(activeNoteId, contentRef.current)
    setSaving(false)
  }
  flushRef.current = () => void flush()

  const newDoc = async (): Promise<void> => {
    const meta = await sdk.notes.create('Untitled screenplay', NEW_DOC)
    await persistDocs([{ noteId: meta.id, title: meta.name }, ...docs])
    await openDoc(meta.id)
  }

  const rename = async (name: string): Promise<void> => {
    if (!activeNoteId || !name.trim()) return
    await (window as unknown as { hal: import('@shared/api').HalApi }).hal.noteRename(activeNoteId, name.trim())
    await persistDocs(docs.map((d) => (d.noteId === activeNoteId ? { ...d, title: name.trim() } : d)))
    setTitleDraft(name.trim())
  }

  const exportFountain = async (): Promise<void> => {
    if (!titleDraft) return
    const path = await sdk.files.saveText(`${titleDraft.replace(/[\\/:*?"<>|]/g, '-')}.fountain`, content)
    if (path) console.log(`[screenplay] exported to ${path}`)
  }

  return (
    <div className="flex h-full min-h-0 flex-1">
      {/* Doc rail */}
      <aside
        className="flex h-full w-56 shrink-0 flex-col border-r"
        style={{ background: 'var(--hal-plate)', borderColor: 'var(--hal-hairline)' }}
      >
        <div className="flex items-center justify-between border-b px-3 py-2" style={{ borderColor: 'var(--hal-hairline)' }}>
          <span className="legend">Screenplays</span>
          <button className="key" onClick={() => void newDoc()}>
            NEW
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-1">
          {docs.length === 0 && <p className="px-2 py-3 text-xs" style={{ color: 'var(--hal-dim)' }}>No screenplays yet.</p>}
          {docs.map((d) => (
            <button
              key={d.noteId}
              className={`mono block w-full truncate px-2 py-1 text-left text-[11px] ${
                activeNoteId === d.noteId ? 'text-[var(--hal-ivory)]' : 'text-[var(--hal-dim)]'
              }`}
              onClick={() => void openDoc(d.noteId)}
            >
              {d.title}
            </button>
          ))}
        </div>
        <div className="border-t px-3 py-2 legend" style={{ borderColor: 'var(--hal-hairline)' }}>
          {stats.scenes} SCN · ~{stats.pageEstimate} PG<br />
          {stats.characters.length} CHR
        </div>
      </aside>

      {/* Editor plate */}
      <section className="relative flex h-full min-w-0 flex-1 flex-col">
        <div
          className="flex h-11 shrink-0 items-center gap-3 border-b px-6"
          style={{ background: 'var(--hal-plate)', borderColor: 'var(--hal-hairline)' }}
        >
          <span className="lamp" style={{ background: saving ? 'var(--hal-amber)' : 'var(--hal-lamp-green)' }} />
          <input
            className="mono min-w-0 flex-1 truncate border-0 bg-transparent p-0 text-sm uppercase tracking-[0.1em] outline-none"
            style={{ color: 'var(--hal-ivory)' }}
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={() => void rename(titleDraft)}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />
          <button className="key" onClick={() => void exportFountain()}>
            EXPORT .FOUNTAIN
          </button>
        </div>
        <div className="flex min-h-0 flex-1">
          <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden">
            <div ref={hostRef} className="mx-auto h-full w-full max-w-[860px]" />
          </div>
          <aside
            className="hidden w-48 shrink-0 overflow-y-auto border-l px-2 py-2 xl:block"
            style={{ borderColor: 'var(--hal-hairline)', background: 'var(--hal-plate)' }}
          >
            <div className="legend mb-1 px-1">Scenes</div>
            {outline.map((s) => (
              <div key={s.sceneNumber} className="mono truncate px-1 py-0.5 text-[10px]" style={{ color: 'var(--hal-dim)' }}>
                {String(s.sceneNumber).padStart(2, '0')} {s.heading}
              </div>
            ))}
          </aside>
        </div>
      </section>
    </div>
  )
}

/** Screenplay as a bundled plugin: Fountain editor with autocomplete, stats, export. */
export function registerScreenplayPlugin(sdk: HalPluginSdk): void {
  sdk.ui.registerMode({
    id: 'screenplay',
    label: 'Screenplay',
    order: 30,
    mount: (container) => {
      const root = createRoot(container)
      root.render(<ScreenplayMode sdk={sdk} />)
      return () => root.unmount()
    }
  })
}
