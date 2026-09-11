import { bus } from '../events'
import { getNoteRow, listTags, noteNameList } from '../store/notes'
import { getSettings } from '../store/settings'
import { aiActiveReady, aiChat } from './router'

const CAPTURE_MIN_LEN = 250
const CAPTURE_DEBOUNCE_MS = 12_000
const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'A concise descriptive title for the note, or empty string if the current name is already good' },
    tags: { type: 'array', items: { type: 'string' }, description: '3-6 short lowercase tags (no # symbol)' },
    links: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'An exact substring of the note that mentions the concept' },
          target: { type: 'string', description: 'The exact name of an existing note this should link to' }
        },
        required: ['text', 'target']
      }
    }
  },
  required: ['tags', 'links']
} as const

const timers = new Map<string, NodeJS.Timeout>()
const lastSuggestedVersion = new Map<string, number>()

export function initCaptureWatcher(): void {
  bus.on('note:saved', (id: string) => {
    if (!aiActiveReady()) return
    const existing = timers.get(id)
    if (existing) clearTimeout(existing)
    const delay = Math.max(3_000, getSettings().captureDelayMs || CAPTURE_DEBOUNCE_MS)
    const timer = setTimeout(() => {
      timers.delete(id)
      void suggestFor(id).catch((err) => console.error('Smart capture failed:', err))
    }, delay)
    timers.set(id, timer)
  })
}

async function suggestFor(id: string): Promise<void> {
  const row = getNoteRow(id)
  if (!row || row.trashed === 1) return
  if (row.content.trim().length < CAPTURE_MIN_LEN) {
    console.log(`[capture] skip "${row.name}": ${row.content.trim().length} chars < ${CAPTURE_MIN_LEN}`)
    return
  }
  if (lastSuggestedVersion.get(id) === row.content_version) {
    console.log(`[capture] skip "${row.name}": already suggested for this version`)
    return
  }
  lastSuggestedVersion.set(id, row.content_version)

  const names = noteNameList(400).filter((n) => n !== row.name)
  const existingTags = listTags()
    .slice(0, 60)
    .map((t) => t.tag)

  const prompt = `You organize a personal markdown note vault. Analyze this note and suggest improvements.

<note name="${row.name}">
${row.content.slice(0, 6_000)}
</note>

Existing note names in the vault (link targets MUST be chosen from this list, only when genuinely related):
${names.join('\n')}

Existing tags in the vault (prefer reusing these when apt): ${existingTags.join(', ') || '(none yet)'}

Return JSON per the schema. Tags: 3-6 short lowercase tags without the # symbol, kebab-case, no duplicates of tags already in the note. Links: at most 4, only strong conceptual connections; "text" must be an exact substring copied from the note; "target" must exactly match a name from the list. Use empty arrays when nothing fits.`

  const res = await aiChat({
    messages: [{ role: 'user', text: prompt }],
    json: true,
    jsonSchema: RESPONSE_SCHEMA
  })

  let parsed: { title?: string; tags?: string[]; links?: { text: string; target: string }[] }
  try {
    parsed = JSON.parse(res.text ?? '{}')
  } catch {
    console.log(`[capture] "${row.name}": model returned unparseable JSON, skipping`)
    return
  }

  const nameSet = new Set(names.map((n) => n.toLowerCase()))
  const existingTagSet = new Set(
    (row.content.match(/#([\w/-]+)/g) ?? []).map((t) => t.slice(1).toLowerCase())
  )

  const tags = [...new Set((parsed.tags ?? []).map((t) => String(t).toLowerCase().replace(/\s+/g, '-').slice(0, 24)))]
    .filter((t) => t.length > 1 && !existingTagSet.has(t))
    .slice(0, 6)

  const rawLinkCount = (parsed.links ?? []).length
  const links = (parsed.links ?? [])
    .filter(
      (l) =>
        typeof l?.text === 'string' &&
        typeof l?.target === 'string' &&
        nameSet.has(l.target.toLowerCase()) &&
        row.content.includes(l.text) &&
        l.text !== l.target.toLowerCase()
    )
    .slice(0, 4)

  const title =
    typeof parsed.title === 'string' &&
    parsed.title.trim().length > 2 &&
    parsed.title.trim().toLowerCase() !== row.name.toLowerCase()
      ? parsed.title.trim().slice(0, 80)
      : ''

  console.log(
    `[capture] "${row.name}": title=${title ? `'${title}'` : '-'} tags=${tags.length}(of ${(parsed.tags ?? []).length}) links=${links.length}(of ${rawLinkCount})`
  )

  if (!title && tags.length === 0 && links.length === 0) return

  bus.emit('capture:suggestion', {
    noteId: id,
    baseVersion: row.content_version,
    title,
    tags,
    links
  })
}
