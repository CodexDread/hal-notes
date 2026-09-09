import { autocompletion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { EditorState, type Extension } from '@codemirror/state'
import {
  Decoration,
  EditorView,
  MatchDecorator,
  ViewPlugin,
  keymap,
  type DecorationSet,
  type ViewUpdate
} from '@codemirror/view'

export interface CmOptions {
  onOpenNote(target: string): void
  getNoteNames(): string[]
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
      options: opts.getNoteNames().map((n) => ({ label: n, type: 'text' })),
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

const halTheme = EditorView.theme(
  {
    '&': { height: '100%', backgroundColor: 'transparent' },
    '.cm-content': { caretColor: '#a78bfa' }
  },
  { dark: true }
)

export function createEditorState(doc: string, opts: CmOptions): EditorState {
  return EditorState.create({
    doc,
    extensions: [
      EditorView.lineWrapping,
      history(),
      keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
      markdown({ base: markdownLanguage }),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      autocompletion({ override: [wikiCompletion(opts), tagCompletion(opts)] }),
      matchPlugin(WIKI_RE, 'cm-wikilink'),
      matchPlugin(TAG_RE, 'cm-tag'),
      clickHandler(opts),
      halTheme,
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
