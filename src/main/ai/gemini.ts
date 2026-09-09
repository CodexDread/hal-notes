import { GoogleGenAI } from '@google/genai'
import { getGeminiKey } from '../store/settings'

let cached: { key: string; client: GoogleGenAI } | null = null

export function hasKey(): boolean {
  return !!getGeminiKey()
}

export function getClient(): GoogleGenAI {
  const key = getGeminiKey()
  if (!key) throw new Error('Gemini API key is not set — add it in Settings')
  if (!cached || cached.key !== key) {
    cached = { key, client: new GoogleGenAI({ apiKey: key }) }
  }
  return cached.client
}

/** Chat-capable model ids (no 'models/' prefix), for the Settings dropdown. */
export async function listChatModels(): Promise<string[]> {
  const ai = getClient()
  const pager = await ai.models.list()
  const out: string[] = []
  for await (const m of pager) {
    const id = m.name?.replace(/^models\//, '') ?? ''
    if (!id) continue
    const model = m as unknown as {
      supportedGenerationMethods?: string[]
      supportedActions?: string[]
    }
    const methods = model.supportedGenerationMethods ?? model.supportedActions ?? []
    if (methods.length === 0 || methods.includes('generateContent')) out.push(id)
  }
  return out.sort()
}

/** Cheap round-trip to verify the key works. */
export async function testKey(): Promise<void> {
  const ai = getClient()
  await ai.models.generateContent({
    model: 'gemini-flash-latest',
    contents: 'Reply with the single word: ok'
  })
}
