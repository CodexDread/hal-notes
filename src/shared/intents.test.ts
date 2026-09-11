import { describe, expect, it } from 'vitest'
import { detectIndexRebuildIntent } from './intents'

describe('detectIndexRebuildIntent', () => {
  it('matches the owner phrasing', () => {
    expect(detectIndexRebuildIntent('Hello HAL, can you run a quick calibration test of the vault?')).toBe(true)
    expect(detectIndexRebuildIntent('HAL, run a calibration pass on the vault')).toBe(true)
  })

  it('matches explicit rebuild/reindex phrasings', () => {
    expect(detectIndexRebuildIntent('rebuild your index')).toBe(true)
    expect(detectIndexRebuildIntent('please reindex the vault')).toBe(true)
    expect(detectIndexRebuildIntent('can you rebuild the semantic index?')).toBe(true)
    expect(detectIndexRebuildIntent('your embeddings need a rebuild')).toBe(true)
  })

  it('does not match calibration talk that is not about the vault/index', () => {
    expect(detectIndexRebuildIntent('what is sensor calibration?')).toBe(false)
    expect(detectIndexRebuildIntent('my 3D printer calibration notes')).toBe(false)
  })

  it('does not match ordinary questions', () => {
    expect(detectIndexRebuildIntent('are there any notes about AI?')).toBe(false)
    expect(detectIndexRebuildIntent('how does gradient descent work?')).toBe(false)
    expect(detectIndexRebuildIntent('')).toBe(false)
  })
})
