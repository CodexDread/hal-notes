import { describe, expect, it } from 'vitest'
import { md, renderMarkdown } from './markdown'

describe('attachment embeds', () => {
  it('renders image embeds as hal-att images', () => {
    const html = md.renderInline('before ![[screenshot 2026.png]] after')
    expect(html).toContain('<img class="hal-embed"')
    expect(html).toContain(`src="hal-att://${encodeURIComponent('screenshot 2026.png')}"`)
    expect(html).toContain('alt="screenshot 2026.png"')
    expect(html).toContain('before')
    expect(html).toContain('after')
  })

  it('url-encodes names with special characters', () => {
    const html = md.renderInline('![[my image&copy.png]]')
    expect(html).toContain(`src="hal-att://${encodeURIComponent('my image&copy.png')}"`)
  })

  it('renders non-image files as openable chips', () => {
    const html = md.renderInline('see ![[report.pdf]] here')
    expect(html).toContain('class="hal-file"')
    expect(html).toContain('data-attachment="report.pdf"')
    expect(html).toContain('📎 report.pdf')
    expect(html).not.toContain('<img')
  })

  it('leaves plain wiki links untouched', () => {
    const html = md.renderInline('[[screenshot 2026.png]]')
    expect(html).toContain('class="wl"')
    expect(html).not.toContain('<img')
  })

  it('skips embeds with aliases or empty names', () => {
    expect(md.renderInline('![[pic.png|hero]]')).not.toContain('<img')
    expect(md.renderInline('![[]]')).not.toContain('<img')
  })

  it('still renders through the full pipeline', () => {
    const html = renderMarkdown('# Title\n\n![[chart.webp]]\n')
    expect(html).toContain('<h1>Title</h1>')
    expect(html).toContain('hal-att://')
  })
})
