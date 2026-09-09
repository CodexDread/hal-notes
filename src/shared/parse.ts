export interface WikiLink {
  target: string
  display: string
  hasHeading: boolean
}

const WIKI_LINK_RE = /\[\[([^\[\]]+?)\]\]/g
const TAG_RE = /(^|\s)#([A-Za-z0-9][\w\/-]*)/g

export function parseWikiLinks(content: string): WikiLink[] {
  const links: WikiLink[] = []
  for (const m of content.matchAll(WIKI_LINK_RE)) {
    const raw = m[1].trim()
    if (!raw) continue
    const bar = raw.indexOf('|')
    let target = bar >= 0 ? raw.slice(0, bar).trim() : raw
    let display = bar >= 0 ? raw.slice(bar + 1).trim() : ''
    const hash = target.indexOf('#')
    let hasHeading = false
    if (hash >= 0) {
      hasHeading = true
      target = target.slice(0, hash).trim() || target
    }
    if (!display) display = raw
    links.push({ target, display, hasHeading })
  }
  return links
}

export function parseTags(content: string): string[] {
  const tags = new Set<string>()
  for (const m of content.matchAll(TAG_RE)) {
    tags.add(m[2])
  }
  return [...tags]
}

export function normalizeName(name: string): string {
  return name.trim().toLowerCase()
}

export function stripMdExtension(fileName: string): string {
  return fileName.replace(/\.md$/i, '')
}

export function sanitizeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|#]/g, '-').replace(/\s+/g, ' ').trim()
}

export function buildPath(parentPath: string | null, name: string): string {
  return parentPath ? `${parentPath}/${name}` : name
}
