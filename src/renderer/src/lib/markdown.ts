import MarkdownIt from 'markdown-it'

export const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
  breaks: false
})

const WIKI_TARGET = 'data-wikilink-target'

// [[Note name|display]] and [[Note name#heading]]
md.inline.ruler.before(
  'link',
  'hal_wikilink',
  (state, silent) => {
    const src = state.src
    const pos = state.pos
    if (src.charCodeAt(pos) !== 0x5b /* [ */ || src.charCodeAt(pos + 1) !== 0x5b) return false
    const end = src.indexOf(']]', pos + 2)
    if (end < 0 || end > state.posMax) return false
    const raw = src.slice(pos + 2, end).trim()
    if (!raw) {
      state.pos = end + 2
      return true
    }
    const bar = raw.indexOf('|')
    let target = bar >= 0 ? raw.slice(0, bar).trim() : raw
    let display = bar >= 0 ? raw.slice(bar + 1).trim() : ''
    const hash = target.indexOf('#')
    if (hash >= 0) {
      target = target.slice(0, hash).trim()
    }
    if (!target) {
      state.pos = end + 2
      return true
    }
    if (!silent) {
      const token = state.push('hal_wikilink', '', 0)
      token.content = display || raw
      token.meta = { target }
    }
    state.pos = end + 2
    return true
  },
  { alt: [] }
)

md.renderer.rules.hal_wikilink = (tokens, idx) => {
  const t = tokens[idx]
  const target = md.utils.escapeHtml(String(t.meta?.target ?? ''))
  return `<a class="wl" ${WIKI_TARGET}="${target}">${md.utils.escapeHtml(t.content)}</a>`
}

// ![[attachment.png]] — embeds: images render inline, other files render as openable chips.
// Registered after hal_wikilink exists, but inserted before it so embeds win at the '!'.
md.inline.ruler.before(
  'hal_wikilink',
  'hal_embed',
  (state, silent) => {
    const src = state.src
    const pos = state.pos
    if (src.charCodeAt(pos) !== 0x21 /* ! */ || src.charCodeAt(pos + 1) !== 0x5b || src.charCodeAt(pos + 2) !== 0x5b) {
      return false
    }
    const end = src.indexOf(']]', pos + 3)
    if (end < 0 || end > state.posMax) return false
    const raw = src.slice(pos + 3, end).trim()
    const name = raw.split('#')[0].trim()
    if (!raw || raw.includes('|')) {
      state.pos = end + 2
      return true
    }
    if (!silent) {
      const token = state.push('hal_embed', '', 0)
      token.content = name
    }
    state.pos = end + 2
    return true
  },
  { alt: [] }
)

md.renderer.rules.hal_embed = (tokens, idx) => {
  const name = tokens[idx].content
  const escaped = md.utils.escapeHtml(name)
  const uri = encodeURIComponent(name)
  if (/\.(png|jpe?g|gif|webp|avif|bmp|svg)$/i.test(name)) {
    return `<img class="hal-embed" src="hal-att://${uri}" alt="${escaped}" loading="lazy">`
  }
  return `<a class="hal-file" data-attachment="${escaped}" title="Open ${escaped} with its default app">📎 ${escaped}</a>`
}

// #tags (inline, not headings)
md.inline.ruler.before(
  'emphasis',
  'hal_tag',
  (state, silent) => {
    const src = state.src
    const pos = state.pos
    if (src.charCodeAt(pos) !== 0x23 /* # */) return false
    const prev = pos > 0 ? src.charCodeAt(pos - 1) : 0x20
    if (!(prev === 0x20 || prev === 0x09 || prev === 0x0a || prev === 0)) return false
    const m = /^#([A-Za-z0-9][\w/-]*)/.exec(src.slice(pos))
    if (!m) return false
    if (!silent) {
      const token = state.push('hal_tag', '', 0)
      token.content = m[1]
    }
    state.pos += m[0].length
    return true
  },
  { alt: [] }
)

md.renderer.rules.hal_tag = (tokens, idx) => {
  const tag = md.utils.escapeHtml(tokens[idx].content)
  return `<span class="tag" data-tag="${tag}">#${tag}</span>`
}

// Open external links in the system browser (main window handler intercepts).
const defaultLinkOpen =
  md.renderer.rules.link_open ??
  ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options))
md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  const token = tokens[idx]
  const targetIndex = token.attrIndex('target')
  if (targetIndex < 0) token.attrPush(['target', '_blank'])
  else token.attrs![targetIndex][1] = '_blank'
  token.attrPush(['rel', 'noopener'])
  return defaultLinkOpen(tokens, idx, options, env, self)
}

const FRONTMATTER_RE = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/

export function renderMarkdown(content: string): string {
  const body = content.startsWith('---') ? content.replace(FRONTMATTER_RE, '') : content
  return md.render(body)
}
