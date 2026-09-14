import { autocompletion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
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
import { renderMarkdown } from './markdown'

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
      markdown({ base: markdownLanguage }),
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


// ── Live preview: rendered markdown everywhere except the cursor's line ──────

class RenderedBlock extends WidgetType {
  constructor(readonly html: string) {
    super()
  }
  eq(other: RenderedBlock): boolean {
    return other.html === this.html
  }
  toDOM(): HTMLElement {
    const wrap = document.createElement('div')
    wrap.className = 'preview prose prose-sm prose-zinc cm-rendered-block'
    wrap.innerHTML = this.html
    return wrap
  }
  ignoreEvent(): boolean {
    return false
  }
}

/**
 * Obsidian-style live preview: blocks (separated by blank lines) away from the
 * cursor render as markdown; the cursor's block stays as raw source for editing.
 */
function buildLivePreviewDeco(view: EditorView): DecorationSet {
  const builder: { from: number; to: number; deco: Decoration }[] = []
  const doc = view.state.doc
  const cursorLine = view.state.selection.main.head
  const cursorBlock = doc.lineAt(cursorLine)

  // Group lines into blocks separated by blank lines
  let blockStart = 1 // 1-based line numbers
  let blockLines: string[] = []
  let blockFrom = 0

  const flush = (endLine: number): void => {
    if (blockLines.length === 0) return
    const text = blockLines.join('\n')
    const blockEnd = doc.line(endLine - 1).to
    // Skip if cursor is inside this block
    const cursorInBlock = cursorLine >= blockFrom && cursorLine <= blockEnd
    const isCodeFence = text.trim().startsWith('```')
    if (!cursorInBlock && !isCodeFence && text.trim() !== '') {
      const html = renderMarkdown(text)
      // Only replace if it renders to something visually different (has tags)
      if (html.includes('<')) {
        builder.push({
          from: blockFrom,
          to: blockEnd,
          deco: Decoration.replace({
            widget: new RenderedBlock(html),
            block: true
          })
        })
      }
    }
    blockLines = []
  }

  for (let ln = 1; ln <= doc.lines; ln++) {
    const line = doc.line(ln)
    if (line.text.trim() === '') {
      flush(ln)
      blockStart = ln + 1
      blockFrom = line.to + 1
    } else {
      if (blockLines.length === 0) blockFrom = line.from
      blockLines.push(line.text)
    }
  }
  flush(doc.lines + 1)

  // Sort by position (Decoration.replace with block must be ordered)
  builder.sort((a, b) => a.from - b.from)
  const rangeBuilder = new RangeSetBuilder<Decoration>()
  for (const b of builder) {
    try {
      rangeBuilder.add(b.from, b.to, b.deco)
    } catch {
      // overlapping ranges from rapid edits — skip this frame
    }
  }
  return rangeBuilder.finish()
}

const livePreviewPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = buildLivePreviewDeco(view)
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        this.decorations = buildLivePreviewDeco(update.view)
      }
    }
  },
  { decorations: (v) => v.decorations }
)

export function livePreview(): Extension {
  return livePreviewPlugin
}
