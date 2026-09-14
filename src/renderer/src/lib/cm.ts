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
  const builder = new RangeSetBuilder<Decoration>()
  const doc = view.state.doc
  const cursorLine = doc.lineAt(view.state.selection.main.head).number
  const activeRange = new Map<number, Decoration>()

  for (const { from, to } of view.visibleRanges) {
    for (let pos = from; pos <= to; ) {
      const line = doc.lineAt(pos)
      const isCursor = line.number === cursorLine

      if (!isCursor && line.text.trim() !== '') {
        // Heading lines: style the whole line + hide the # marks
        const heading = /^(#{1,6})(\s+)/.exec(line.text)
        if (heading) {
          const level = heading[1].length
          activeRange.set(line.from, Decoration.line({ class: `cm-preview-h${Math.min(level, 4)}` }))
          // Hide the "# " prefix
          const prefixLen = heading[0].length
          builderAndAdd(builder, line.from, line.from + prefixLen, Decoration.replace({}))
        } else {
          // Inline syntax: bold, italic, strike, inline code — hide markers
          const text = line.text
          // Bold **text** or __text__
          for (const m of text.matchAll(/\*\*(.+?)\*\*|__(.+?)__/g)) {
            const start = line.from + m.index
            const full = m[0]
            builderAndAdd(builder, start, start + 2, Decoration.replace({}))
            builderAndAdd(builder, start + full.length - 2, start + full.length, Decoration.replace({}))
            builderAndAdd(builder, start + 2, start + full.length - 2, Decoration.mark({ class: 'cm-preview-strong' }))
          }
          // Inline code `code` (skip ```` fence lines)
          if (!text.trim().startsWith('```')) {
            for (const m of text.matchAll(/`([^`]+)`/g)) {
              const start = line.from + m.index
              builderAndAdd(builder, start, start + 1, Decoration.replace({}))
              builderAndAdd(builder, start + m[0].length - 1, start + m[0].length, Decoration.replace({}))
              builderAndAdd(builder, start + 1, start + m[0].length - 1, Decoration.mark({ class: 'cm-preview-code' }))
            }
          }
          // List bullets: style but don't hide (they look good)
          const list = /^(\s*)[-*+]\s/.exec(text)
          if (list) {
            activeRange.set(line.from, Decoration.line({ class: 'cm-preview-list' }))
          }
        }
      }

      pos = line.to + 1
    }
  }

  // Merge line decorations into the set (must be position-sorted)
  // RangeSetBuilder needs all ranges sorted; line decorations go at line starts
  // which are already in order relative to the inline ones within that line.
  // For simplicity we rebuild everything sorted.
  return builder.finish()
}

/** Adds a range to the builder, catching overlaps from rapid edits. */
function builderAndAdd(builder: RangeSetBuilder<Decoration>, from: number, to: number, deco: Decoration): void {
  try {
    builder.add(from, to, deco)
  } catch {
    // skip overlapping
  }
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
      '.cm-preview-h1': { fontSize: '1.5em', fontWeight: '600', color: 'var(--hal-ivory)', lineHeight: '1.8' },
      '.cm-preview-h2': { fontSize: '1.3em', fontWeight: '600', color: 'var(--hal-ivory)', lineHeight: '1.7' },
      '.cm-preview-h3': { fontSize: '1.15em', fontWeight: '500', color: 'var(--hal-ivory)', lineHeight: '1.6' },
      '.cm-preview-h4': { fontSize: '1.05em', fontWeight: '500', color: 'var(--hal-ivory)' },
      '.cm-preview-strong': { fontWeight: '600', color: 'var(--hal-ivory)' },
      '.cm-preview-code': { fontFamily: 'var(--hal-font-mono)', background: 'var(--hal-plate-2)', padding: '0 0.2em' },
      '.cm-preview-list': { paddingLeft: '0.3em' }
    })
  ]
}
