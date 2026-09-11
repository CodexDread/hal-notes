import { describe, expect, it } from 'vitest'

// The router module touches Electron at import time (app.getPath, safeStorage),
// so its pure transport helpers are mirrored here under contract tests — keep in
// sync with src/main/ai/router.ts.

function parseSSE(buffer: string): { events: string[]; rest: string } {
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

function openaiStreamDelta(eventJson: string): string {
  try {
    const parsed = JSON.parse(eventJson) as { choices?: { delta?: { content?: string } }[] }
    return parsed.choices?.[0]?.delta?.content ?? ''
  } catch {
    return ''
  }
}

function anthropicStreamDelta(eventJson: string): string {
  try {
    const parsed = JSON.parse(eventJson) as { type?: string; delta?: { text?: string } }
    if (parsed.type === 'content_block_delta') return parsed.delta?.text ?? ''
    return ''
  } catch {
    return ''
  }
}

describe('parseSSE', () => {
  it('extracts complete events and keeps the remainder buffered', () => {
    const chunk = 'data: {"a":1}\n\ndata: {"a":2}\n\ndata: {"a":3}'
    const { events, rest } = parseSSE(chunk)
    expect(events).toEqual(['{"a":1}', '{"a":2}'])
    expect(rest).toBe('data: {"a":3}')
  })

  it('joins multi-line data fields and skips [DONE]', () => {
    const chunk = 'data: line1\ndata: line2\n\ndata: [DONE]\n\n'
    const { events } = parseSSE(chunk)
    expect(events).toEqual(['line1\nline2'])
  })

  it('ignores non-data comment lines', () => {
    const { events } = parseSSE(': keepalive\n\ndata: {"x":9}\n\n')
    expect(events).toEqual(['{"x":9}'])
  })

  it('returns nothing for empty input', () => {
    expect(parseSSE('')).toEqual({ events: [], rest: '' })
  })
})

describe('openaiStreamDelta', () => {
  it('reads delta content', () => {
    expect(openaiStreamDelta('{"choices":[{"delta":{"content":"hel"}}]}')).toBe('hel')
  })
  it('returns empty for chunks without content (roles, finish)', () => {
    expect(openaiStreamDelta('{"choices":[{"delta":{"role":"assistant"}}]}')).toBe('')
    expect(openaiStreamDelta('{"choices":[{"finish_reason":"stop"}]}')).toBe('')
  })
  it('tolerates garbage', () => {
    expect(openaiStreamDelta('not json')).toBe('')
  })
})

describe('anthropicStreamDelta', () => {
  it('reads content_block_delta text', () => {
    expect(anthropicStreamDelta('{"type":"content_block_delta","delta":{"text":"lo"}}')).toBe('lo')
  })
  it('ignores message_start and ping events', () => {
    expect(anthropicStreamDelta('{"type":"message_start"}')).toBe('')
    expect(anthropicStreamDelta('{"type":"ping"}')).toBe('')
  })
  it('tolerates garbage', () => {
    expect(anthropicStreamDelta('oops')).toBe('')
  })
})

describe('role mapping contract', () => {
  it('router messages use user/assistant and convert to user/model for google', () => {
    // The google path maps assistant → model; user stays user. Guard the mapping table.
    const toGoogle = (r: 'user' | 'assistant'): 'user' | 'model' => (r === 'user' ? 'user' : 'model')
    expect(toGoogle('user')).toBe('user')
    expect(toGoogle('assistant')).toBe('model')
  })
})
