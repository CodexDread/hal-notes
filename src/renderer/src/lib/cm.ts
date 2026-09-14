import { autocompletion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { Compartment, EditorState, RangeSetBuilder, type Extension } from '@codemirror/state'
import {
  Decoration,
  EditorView,
  MatchDecorator,
  ViewPlugin,
  WidgetType,
  keymap,
  type DecorationSet,
  type ViewUpdate
} from '@codemirror/view'

export interface CmOptions {
  onOpenNote(target: string): void
  onFiles(files: File[]): void
  getNoteNames(): string[]
  getAttachmentNames(): string[]
  getTags(): string[]
  onChange(doc: string): void
}

const WIKI_RE = /\[\[([^\[\]]+?)\]\]/g
const TAG_RE = /(?:^|\s)(#[A-Za-z0-9][\w/-]*)/g

function matchPlugin(regexp: RegExp, className: string): Extension {
  const matcher = new MatchDecorator({ regexp, decoration: Decoration.mark({ class: className }) })
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet
      constructor(view: EditorView) {
        this.decorations = matcher.createDeco(view)
      }
      update(update: ViewUpdate) {
        this.decorations = matcher.updateDeco(update, this.decorations)
      }
    },
    { decorations: (v) => v.decorations }
  )
}

function clickHandler(opts: CmOptions): Extension {
  return EditorView.domEventHandlers({
    paste(event, view) {
      const files = Array.from(event.clipboardData?.files ?? [])
      if (files.length > 0) {
        event.preventDefault()
        opts.onFiles(files)
        return true
      }
      return false
    },
    drop(event) {
      const files = Array.from(event.dataTransfer?.files ?? [])
      if (files.length > 0) {
        event.preventDefault()
        opts.onFiles(files)
        return true
      }
      return false
    },
    mousedown(event, view) {
      if (event.button !== 0) return false
      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY })
      if (pos == null) return false
      const line = view.state.doc.lineAt(pos)
      const offsetInLine = pos - line.from
      for (const m of line.text.matchAll(WIKI_RE)) {
        const start = m.index ?? 0
        const end = start + m[0].length
        if (offsetInLine >= start && offsetInLine <= end) {
          const raw = m[1].trim()
          const bar = raw.indexOf('|')
          let target = bar >= 0 ? raw.slice(0, bar).trim() : raw
          const hash = target.indexOf('#')
          if (hash >= 0) target = target.slice(0, hash).trim()
          if (target) {
            event.preventDefault()
            opts.onOpenNote(target)
            return true
          }
        }
      }
      return false
    }
  })
}

function wikiCompletion(opts: CmOptions): (ctx: CompletionContext) => CompletionResult | null {
  return (ctx) => {
    const line = ctx.state.doc.lineAt(ctx.pos)
    const before = line.text.slice(0, ctx.pos - line.from)
    const m = /\[\[([^\[\]|#]*)$/.exec(before)
    if (!m) return null
    return {
      from: ctx.pos - m[1].length,
      options: [
        ...opts.getNoteNames().map((n) => ({ label: n, type: 'text' })),
        ...opts.getAttachmentNames().map((n) => ({ label: n, type: 'file' }))
      ],
      validFor: /^[^\[\]|#]*$/
    }
  }
}

function tagCompletion(opts: CmOptions): (ctx: CompletionContext) => CompletionResult | null {
  return (ctx) => {
    const line = ctx.state.doc.lineAt(ctx.pos)
    const before = line.text.slice(0, ctx.pos - line.from)
    const m = /#([\w/-]*)$/.exec(before)
    if (!m) return null
    return {
      from: ctx.pos - m[1].length,
      options: [...new Set(opts.getTags())].map((t) => ({ label: t, type: 'text' })),
      validFor: /^[\w/-]*$/
    }
  }
}

export const themeCompartment = new Compartment()

export function halEditorTheme(dark: boolean): Extension {
  return EditorView.theme(
    {
      '&': { height: '100%', backgroundColor: 'transparent', color: 'var(--hal-ink)' },
      '.cm-content': { caretColor: 'var(--color-violet-400)' }
    },
    { dark }
  )
}

export function createEditorState(doc: string, opts: CmOptions, dark = true): EditorState {
  return EditorState.create({
    doc,
    extensions: [
      EditorView.lineWrapping,
      history(),
      keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      autocompletion({ override: [wikiCompletion(opts), tagCompletion(opts)] }),
      livePreview(),
      matchPlugin(WIKI_RE, 'cm-wikilink'),
      matchPlugin(TAG_RE, 'cm-tag'),
      clickHandler(opts),
      themeCompartment.of(halEditorTheme(dark)),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) opts.onChange(update.state.doc.toString())
      })
    ]
  })
}

export function replaceDoc(view: EditorView, next: string): void {
  const current = view.state.doc.toString()
  if (current !== next) {
    view.dispatch({ changes: { from: 0, to: current.length, insert: next } })
  }
}

// ── Live preview: hide markdown syntax away from the cursor ─────────────────
// Line decoration + inline replace: on non-cursor lines, markdown syntax
// markers (heading #, bold **, italic *, strikethrough ~~, code ``) are hidden
// and the content is styled. The cursor's line shows raw source.

interface SyntaxRange {
  from: number
  to: number
  hideMark?: Decoration
  lineClass?: string
}

function buildSyntaxHiding(view: EditorView): DecorationSet {
  const ranges: { from: number; to: number; deco: Decoration }[] = []
  const doc = view.state.doc
  const cursorLine = doc.lineAt(view.state.selection.main.head).number

  for (const { from, to } of view.visibleRanges) {
    for (let pos = from; pos <= to; ) {
      const line = doc.lineAt(pos)
      const isCursor = line.number === cursorLine
      const text = line.text

      if (!isCursor && text.trim() !== '' && !text.trim().startsWith('```')) {
        const heading = /^(#{1,6})(\s+)/.exec(text)
        if (heading) {
          const level = Math.min(heading[1].length, 4)
          ranges.push({ from: line.from, to: line.from, deco: Decoration.line({ class: `cm-preview-h${level}` }) })
          ranges.push({ from: line.from, to: line.from + heading[0].length, deco: Decoration.replace({}) })
        } else {
          for (const m of text.matchAll(/\*\*(.+?)\*\*|__(.+?)__/g)) {
            const start = line.from + m.index
            const full = m[0]
            ranges.push({ from: start, to: start + 2, deco: Decoration.replace({}) })
            ranges.push({ from: start + 2, to: start + full.length - 2, deco: Decoration.mark({ class: 'cm-preview-strong' }) })
            ranges.push({ from: start + full.length - 2, to: start + full.length, deco: Decoration.replace({}) })
          }
          for (const m of text.matchAll(/`([^`]+)`/g)) {
            const start = line.from + m.index
            const full = m[0]
            ranges.push({ from: start, to: start + 1, deco: Decoration.replace({}) })
            ranges.push({ from: start + 1, to: start + full.length - 1, deco: Decoration.mark({ class: 'cm-preview-code' }) })
            ranges.push({ from: start + full.length - 1, to: start + full.length, deco: Decoration.replace({}) })
          }
          for (const m of text.matchAll(/(?<!\*)\*([^*]+?)\*(?!\*)|(?<!_)_([^_]+?)_(?!_)/g)) {
            const start = line.from + m.index
            const full = m[0]
            ranges.push({ from: start, to: start + 1, deco: Decoration.replace({}) })
            ranges.push({ from: start + 1, to: start + full.length - 1, deco: Decoration.mark({ class: 'cm-preview-em' }) })
            ranges.push({ from: start + full.length - 1, to: start + full.length, deco: Decoration.replace({}) })
          }
          for (const m of text.matchAll(/~~(.+?)~~/g)) {
            const start = line.from + m.index
            const full = m[0]
            ranges.push({ from: start, to: start + 2, deco: Decoration.replace({}) })
            ranges.push({ from: start + 2, to: start + full.length - 2, deco: Decoration.mark({ class: 'cm-preview-strike' }) })
            ranges.push({ from: start + full.length - 2, to: start + full.length, deco: Decoration.replace({}) })
          }
          if (/^\s*[-*+]\s/.test(text)) {
            ranges.push({ from: line.from, to: line.from, deco: Decoration.line({ class: 'cm-preview-list' }) })
          }
        }
      }

      pos = line.to + 1
    }
  }

  ranges.sort((a, b) => a.from - b.from || a.to - b.to)

  const builder = new RangeSetBuilder<Decoration>()
  let lastTo = -1
  for (const r of ranges) {
    if (r.from < lastTo) continue
    try {
      builder.add(r.from, r.to, r.deco)
      lastTo = r.to
    } catch {
      // overlap from nesting — skip
    }
  }
  return builder.finish()
}

export function livePreview(): Extension {
  return [
    ViewPlugin.fromClass(
      class {
        decorations: DecorationSet
        constructor(view: EditorView) {
          this.decorations = buildSyntaxHiding(view)
        }
        update(update: ViewUpdate) {
          if (update.docChanged || update.selectionSet || update.viewportChanged) {
            this.decorations = buildSyntaxHiding(update.view)
          }
        }
      },
      { decorations: (v) => v.decorations }
    ),
    EditorView.theme({
      '.cm-preview-h1': { fontSize: '1.6em', fontWeight: '700', color: 'var(--hal-amber)', lineHeight: '2.0', letterSpacing: '-0.01em' },
      '.cm-preview-h2': { fontSize: '1.4em', fontWeight: '600', color: 'var(--hal-amber)', lineHeight: '1.8', letterSpacing: '-0.01em', opacity: '0.9' },
      '.cm-preview-h3': { fontSize: '1.2em', fontWeight: '600', color: 'var(--hal-ivory)', lineHeight: '1.7' },
      '.cm-preview-h4': { fontSize: '1.05em', fontWeight: '600', color: 'var(--hal-ivory)', lineHeight: '1.6' },
      '.cm-preview-strong': { fontWeight: '700', color: 'var(--hal-ivory)' },
      '.cm-preview-em': { fontStyle: 'italic', color: 'var(--hal-ink)' },
      '.cm-preview-strike': { textDecoration: 'line-through', color: 'var(--hal-dim)', opacity: '0.7' },
      '.cm-preview-code': { fontFamily: 'var(--hal-font-mono)', background: 'var(--hal-plate-2)', border: '1px solid var(--hal-hairline)', padding: '0.05em 0.3em', borderRadius: '2px', color: 'var(--hal-amber)', fontSize: '0.92em' },
      '.cm-preview-list': { paddingLeft: '0.3em' },
      '.cm-line': { lineHeight: '1.75' }
    })
  ]
}
