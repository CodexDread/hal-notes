import { app, safeStorage } from 'electron'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { GoogleGenAI } from '@google/genai'
import { getGeminiKey } from '../store/settings'
import { getSettings } from '../store/settings'

export type ProviderId = 'google' | 'openai' | 'anthropic' | 'openrouter' | 'custom'

export const PROVIDERS: { id: ProviderId; label: string; needsKey: boolean; hasEmbeddings: boolean }[] = [
  { id: 'google', label: 'Google (Gemini)', needsKey: true, hasEmbeddings: true },
  { id: 'openai', label: 'OpenAI', needsKey: true, hasEmbeddings: true },
  { id: 'anthropic', label: 'Anthropic', needsKey: true, hasEmbeddings: false },
  { id: 'openrouter', label: 'OpenRouter', needsKey: true, hasEmbeddings: false },
  { id: 'custom', label: 'OpenAI-compatible (Ollama, LM Studio, …)', needsKey: false, hasEmbeddings: true }
]

export interface RouterMessage {
  role: 'user' | 'assistant'
  text: string
}

export interface ChatRequest {
  system?: string
  messages: RouterMessage[]
  model?: string // resolved per-provider when omitted
  json?: boolean
  jsonSchema?: unknown // Gemini-style schema object; passed natively on Google, appended to the prompt elsewhere
  webGrounding?: boolean // Google Search grounding — Google only
  stream?: (delta: string) => void
}

export interface ChatResult {
  text: string
  groundingSources: { uri: string; title: string }[]
}

// ── Key storage (one encrypted file for non-Google providers) ────────────────

const KEYS_FILE = 'ai-keys.json'

function keysPath(): string {
  return join(app.getPath('userData'), KEYS_FILE)
}

type KeyMap = Partial<Record<ProviderId, string>> & { customBaseUrl?: string }

function readKeys(): KeyMap {
  if (!existsSync(keysPath())) return {}
  const raw = readFileSync(keysPath(), 'utf8')
  try {
    if (raw.startsWith('enc:')) {
      return JSON.parse(safeStorage.decryptString(Buffer.from(raw.slice(4), 'base64'))) as KeyMap
    }
    if (raw.startsWith('plain:')) {
      return JSON.parse(Buffer.from(raw.slice(6), 'base64').toString('utf8')) as KeyMap
    }
  } catch {
    return {}
  }
  return {}
}

function writeKeys(keys: KeyMap): void {
  const json = JSON.stringify(keys)
  const stored = safeStorage.isEncryptionAvailable()
    ? `enc:${safeStorage.encryptString(json).toString('base64')}`
    : `plain:${Buffer.from(json, 'utf8').toString('base64')}`
  writeFileSync(keysPath(), stored, 'utf8')
}

export function setProviderKey(id: ProviderId, key: string): void {
  const keys = readKeys()
  keys[id] = key.trim()
  writeKeys(keys)
}

export function setCustomBaseUrl(url: string): void {
  const keys = readKeys()
  keys.customBaseUrl = url.trim()
  writeKeys(keys)
}

export function getCustomBaseUrl(): string {
  return readKeys().customBaseUrl || 'http://localhost:11434/v1'
}

function providerApiKey(id: ProviderId): string {
  if (id === 'google') return getGeminiKey() ?? ''
  return readKeys()[id] ?? ''
}

export function providerReady(id: ProviderId): boolean {
  const meta = PROVIDERS.find((p) => p.id === id)
  if (!meta) return false
  if (!meta.needsKey) return true
  return providerApiKey(id).length > 0
}

interface ResolvedProvider {
  id: ProviderId
  apiKey: string
  baseUrl: string
}

function baseUrlFor(id: ProviderId): string {
  switch (id) {
    case 'openai':
      return 'https://api.openai.com/v1'
    case 'anthropic':
      return 'https://api.anthropic.com'
    case 'openrouter':
      return 'https://openrouter.ai/api/v1'
    case 'custom':
      return getCustomBaseUrl()
    default:
      return ''
  }
}

export function resolveProvider(id?: ProviderId): ResolvedProvider {
  const target = id ?? (getSettings().aiProvider as ProviderId) ?? 'google'
  return { id: target, apiKey: providerApiKey(target), baseUrl: baseUrlFor(target) }
}

function defaultModel(id: ProviderId): string {
  switch (id) {
    case 'google':
      return 'gemini-flash-latest'
    case 'openai':
      return 'gpt-4o-mini'
    case 'anthropic':
      return 'claude-3-5-haiku-latest'
    case 'openrouter':
      return 'openai/gpt-4o-mini'
    case 'custom':
      return 'llama3.1'
  }
}

function modelFor(req: ChatRequest, p: ResolvedProvider): string {
  return req.model || getSettings().chatModel || defaultModel(p.id)
}

// ── SSE parsing (pure — unit-tested) ─────────────────────────────────────────

export function parseSSE(buffer: string): { events: string[]; rest: string } {
  const events: string[] = []
  let rest = buffer
  for (;;) {
    const idx = rest.indexOf('\n\n')
    if (idx < 0) break
    const block = rest.slice(0, idx)
    rest = rest.slice(idx + 2)
    const data = block
      .split('\n')
      .filter((l) => l.startsWith('data:'))
      .map((l) => l.slice(5).trim())
      .join('\n')
    if (data.length > 0 && data !== '[DONE]') events.push(data)
  }
  return { events, rest }
}

export function openaiStreamDelta(eventJson: string): string {
  try {
    const parsed = JSON.parse(eventJson) as { choices?: { delta?: { content?: string } }[] }
    return parsed.choices?.[0]?.delta?.content ?? ''
  } catch {
    return ''
  }
}

export function anthropicStreamDelta(eventJson: string): string {
  try {
    const parsed = JSON.parse(eventJson) as { type?: string; delta?: { text?: string } }
    if (parsed.type === 'content_block_delta') return parsed.delta?.text ?? ''
    return ''
  } catch {
    return ''
  }
}

// ── OpenAI-compatible (openai, openrouter, custom/Ollama) ────────────────────

function openaiHeaders(p: ResolvedProvider): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (p.apiKey) headers.Authorization = `Bearer ${p.apiKey}`
  return headers
}

function schemaToPrompt(schema: unknown): string {
  return `\n\nRespond with ONLY a JSON object matching this schema (no prose, no code fences):\n${JSON.stringify(schema, null, 1)}`
}

async function openaiChat(req: ChatRequest, p: ResolvedProvider): Promise<ChatResult> {
  const messages: { role: string; content: string }[] = []
  if (req.system) messages.push({ role: 'system', content: req.system })
  for (const m of req.messages) {
    messages.push({ role: m.role, content: m.text })
  }
  let lastUser = messages[messages.length - 1]
  if (req.json && req.jsonSchema && lastUser?.role === 'user') {
    lastUser = { ...lastUser, content: lastUser.content + schemaToPrompt(req.jsonSchema) }
    messages[messages.length - 1] = lastUser
  }
  const body: Record<string, unknown> = { model: modelFor(req, p), messages }
  if (req.json) body.response_format = { type: 'json_object' }
  if (req.stream) body.stream = true
  if (req.webGrounding) {
    throw new Error('Web-grounded research requires the Google provider (its search tool is Google-only)')
  }

  const res = await fetch(`${p.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: openaiHeaders(p),
    body: JSON.stringify(body)
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`${p.id} chat failed (${res.status}): ${text.slice(0, 300)}`)
  }

  if (req.stream && res.body) {
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let full = ''
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const { events, rest } = parseSSE(buffer)
      buffer = rest
      for (const ev of events) {
        const delta = openaiStreamDelta(ev)
        if (delta) {
          full += delta
          req.stream(delta)
        }
      }
    }
    return { text: full, groundingSources: [] }
  }

  const parsed = (await res.json()) as { choices?: { message?: { content?: string } }[] }
  return { text: parsed.choices?.[0]?.message?.content ?? '', groundingSources: [] }
}

// ── Anthropic ────────────────────────────────────────────────────────────────

async function anthropicChat(req: ChatRequest, p: ResolvedProvider): Promise<ChatResult> {
  const messages = req.messages.map((m) => ({ role: m.role, content: m.text }))
  let system = req.system ?? ''
  if (req.json && req.jsonSchema) system += schemaToPrompt(req.jsonSchema)
  if (req.json) system += '\n\nOutput ONLY raw JSON — no prose, no code fences.'
  if (req.webGrounding) {
    throw new Error('Web-grounded research requires the Google provider (its search tool is Google-only)')
  }

  const body: Record<string, unknown> = { model: modelFor(req, p), max_tokens: 4096, messages, stream: !!req.stream }
  if (system) body.system = system

  const res = await fetch(`${p.baseUrl}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': p.apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify(body)
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`anthropic chat failed (${res.status}): ${text.slice(0, 300)}`)
  }

  if (req.stream && res.body) {
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let full = ''
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const { events, rest } = parseSSE(buffer)
      buffer = rest
      for (const ev of events) {
        const delta = anthropicStreamDelta(ev)
        if (delta) {
          full += delta
          req.stream(delta)
        }
      }
    }
    return { text: full, groundingSources: [] }
  }

  const parsed = (await res.json()) as { content?: { type: string; text?: string }[] }
  return { text: (parsed.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join(''), groundingSources: [] }
}

// ── Google (via the official SDK) ────────────────────────────────────────────

let googleClient: { key: string; client: GoogleGenAI } | null = null

function googleClientFor(apiKey: string): GoogleGenAI {
  if (!googleClient || googleClient.key !== apiKey) {
    googleClient = { key: apiKey, client: new GoogleGenAI({ apiKey }) }
  }
  return googleClient.client
}

export function extractGroundingSources(response: unknown): { uri: string; title: string }[] {
  const out: { uri: string; title: string }[] = []
  const seen = new Set<string>()
  const candidates =
    (response as { candidates?: { groundingMetadata?: { groundingChunks?: { web?: { uri?: string; title?: string } }[] } }[] })
      ?.candidates ?? []
  for (const candidate of candidates) {
    for (const chunk of candidate.groundingMetadata?.groundingChunks ?? []) {
      const uri = chunk.web?.uri
      if (!uri || seen.has(uri)) continue
      seen.add(uri)
      out.push({ uri, title: chunk.web?.title || uri })
    }
  }
  return out
}

async function googleChat(req: ChatRequest, p: ResolvedProvider): Promise<ChatResult> {
  const ai = googleClientFor(p.apiKey)
  const config: Record<string, unknown> = {}
  if (req.system) config.systemInstruction = req.system
  if (req.json) config.responseMimeType = 'application/json'
  if (req.json && req.jsonSchema) config.responseSchema = req.jsonSchema
  if (req.webGrounding) config.tools = [{ googleSearch: {} }]

  const contents = req.messages.map((m) => ({
    role: m.role === 'user' ? ('user' as const) : ('model' as const),
    parts: [{ text: m.text }]
  }))

  if (req.stream) {
    const stream = await ai.models.generateContentStream({
      model: modelFor(req, p),
      contents,
      config: config as never
    })
    let full = ''
    let grounding: { uri: string; title: string }[] = []
    for await (const chunk of stream) {
      const text = chunk.text ?? ''
      if (text) {
        full += text
        req.stream(text)
      }
      const sources = extractGroundingSources(chunk)
      if (sources.length > 0) grounding = sources
    }
    return { text: full, groundingSources: grounding }
  }

  const res = await ai.models.generateContent({
    model: modelFor(req, p),
    contents,
    config: config as never
  })
  return { text: res.text ?? '', groundingSources: extractGroundingSources(res) }
}

// ── Public surface ───────────────────────────────────────────────────────────

export async function aiChat(req: ChatRequest, provider?: ProviderId): Promise<ChatResult> {
  const p = resolveProvider(provider)
  if (!providerReady(p.id)) {
    const label = PROVIDERS.find((x) => x.id === p.id)?.label ?? p.id
    throw new Error(`${label} has no API key set — add it in Settings → Integrations`)
  }
  if (p.id === 'google') return googleChat(req, p)
  if (p.id === 'anthropic') return anthropicChat(req, p)
  return openaiChat(req, p)
}

/** Grounded research rounds: Google's search tool is the only web-grounding path. */
export async function aiGroundedChat(req: ChatRequest): Promise<ChatResult> {
  if (!providerReady('google')) {
    throw new Error('Web research needs the Google provider — add a Gemini API key in Settings → Integrations')
  }
  return googleChat({ ...req, webGrounding: true }, resolveProvider('google'))
}

export async function aiTest(provider: ProviderId): Promise<void> {
  const label = PROVIDERS.find((x) => x.id === provider)?.label ?? provider
  if (!providerReady(provider)) throw new Error(`${label} has no API key set`)
  await aiChat(
    { messages: [{ role: 'user', text: 'Reply with the single word: ok' }], model: defaultModel(provider) },
    provider
  )
}

export async function aiListModels(provider: ProviderId): Promise<string[]> {
  const p = resolveProvider(provider)
  if (p.id === 'google') {
    if (!providerReady('google')) return []
    const ai = googleClientFor(p.apiKey)
    const pager = await ai.models.list()
    const out: string[] = []
    for await (const m of pager) {
      const id = m.name?.replace(/^models\//, '') ?? ''
      if (!id) continue
      const model = m as unknown as { supportedGenerationMethods?: string[]; supportedActions?: string[] }
      const methods = model.supportedGenerationMethods ?? model.supportedActions ?? []
      if (methods.length === 0 || methods.includes('generateContent')) out.push(id)
    }
    return out.sort()
  }
  if (p.id === 'anthropic') {
    if (!providerReady(p.id)) return []
    const res = await fetch(`${p.baseUrl}/v1/models`, {
      headers: { 'x-api-key': p.apiKey, 'anthropic-version': '2023-06-01' }
    })
    if (!res.ok) return []
    const parsed = (await res.json()) as { data?: { id?: string }[] }
    return (parsed.data ?? []).map((d) => d.id ?? '').filter(Boolean).sort()
  }
  // OpenAI-compatible (openai, openrouter, custom) — custom works without a key (Ollama)
  const res = await fetch(`${p.baseUrl}/models`, { headers: openaiHeaders(p) }).catch(() => null)
  if (!res || !res.ok) return []
  const parsed = (await res.json()) as { data?: { id?: string }[] }
  return (parsed.data ?? []).map((d) => d.id ?? '').filter(Boolean).sort()
}

// ── Embeddings (Google or any OpenAI-compatible endpoint) ────────────────────

export function embeddingProviderId(): 'google' | 'openai' | 'custom' {
  const s = getSettings().embeddingProvider
  return s === 'openai' || s === 'custom' ? s : 'google'
}

export function embeddingModelFor(): string {
  const s = getSettings()
  if (s.embeddingModel) return s.embeddingModel
  switch (embeddingProviderId()) {
    case 'google':
      return 'gemini-embedding-001'
    case 'openai':
      return 'text-embedding-3-small'
    case 'custom':
      return 'nomic-embed-text'
  }
}

export function embeddingSignature(): string {
  return `${embeddingProviderId()}/${embeddingModelFor()}`
}

export async function aiEmbed(
  texts: string[],
  opts: { dimensionality?: number; taskType?: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY' } = {}
): Promise<Float32Array[]> {
  const id = embeddingProviderId()
  if (id === 'google') {
    if (!providerReady('google')) throw new Error('Google provider has no key for embeddings — check Settings → Integrations')
    const ai = googleClientFor(providerApiKey('google'))
    const res = await ai.models.embedContent({
      model: embeddingModelFor(),
      contents: texts,
      config: {
        outputDimensionality: opts.dimensionality ?? 768,
        taskType: opts.taskType ?? 'RETRIEVAL_DOCUMENT'
      } as never
    })
    return (res.embeddings ?? []).map((e) => Float32Array.from(e.values ?? []))
  }
  const p = resolveProvider(id)
  if (id !== 'custom' && !providerReady(id)) {
    throw new Error(`${id} has no API key set for embeddings — check Settings → Integrations`)
  }
  const res = await fetch(`${p.baseUrl}/embeddings`, {
    method: 'POST',
    headers: openaiHeaders(p),
    body: JSON.stringify({ model: embeddingModelFor(), input: texts })
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`${id} embeddings failed (${res.status}): ${text.slice(0, 300)}`)
  }
  const parsed = (await res.json()) as { data?: { embedding?: number[] }[] }
  return (parsed.data ?? []).map((d) => Float32Array.from(d.embedding ?? []))
}

export function embeddingReady(): boolean {
  const id = embeddingProviderId()
  return id === 'custom' ? true : providerReady(id)
}

export function aiActiveReady(): boolean {
  return providerReady(getSettings().aiProvider as ProviderId)
}
