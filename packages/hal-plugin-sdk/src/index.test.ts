import { describe, expect, it } from 'vitest'
import { checkVersion, validateManifest } from './index'

describe('checkVersion', () => {
  it('accepts exact and older plugin versions', () => {
    expect(checkVersion('0.11.0', '0.11.5')).toBeNull()
    expect(checkVersion('0.11.5', '0.11.5')).toBeNull()
    expect(checkVersion('0.10.0', '0.11.5')).toBeNull()
    expect(checkVersion('0.11.0-beta.1', '0.11.0')).toBeNull()
  })

  it('rejects plugin versions newer than the app', () => {
    expect(checkVersion('0.12.0', '0.11.5')).toMatch(/requires HAL Notes/)
    expect(checkVersion('0.11.6', '0.11.5')).toMatch(/requires HAL Notes/)
    expect(checkVersion('0.11.5.1', '0.11.5')).toMatch(/requires HAL Notes/)
  })

  it('allows major-version jumps down', () => {
    expect(checkVersion('0.99.0', '1.0.0')).toBeNull()
  })
})

describe('validateManifest', () => {
  const valid = { id: 'com.example.myplugin', name: 'My Plugin', version: '1.0.0', entry: 'index.js' }

  it('accepts a valid manifest', () => {
    expect(validateManifest(valid)).toEqual([])
  })

  it('catches missing required fields', () => {
    const errors = validateManifest({})
    const fields = errors.map((e) => e.field).sort()
    expect(fields).toEqual(['entry', 'id', 'name', 'version'])
  })

  it('catches invalid id format', () => {
    expect(validateManifest({ ...valid, id: 'has spaces!' })).toHaveLength(1)
  })

  it('catches non-semver version', () => {
    expect(validateManifest({ ...valid, version: 'latest' })).toHaveLength(1)
  })

  it('catches unknown permissions', () => {
    const errors = validateManifest({ ...valid, permissions: ['ui', 'root'] })
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toContain('root')
  })
})
