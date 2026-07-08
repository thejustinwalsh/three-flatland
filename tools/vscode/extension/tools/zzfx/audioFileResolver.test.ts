import { describe, expect, it, vi } from 'vitest'
import { audioFileCandidates, resolveAudioFilePath } from './audioFileResolver'

const SOURCE_DIR = '/ws/src/sounds'
const WORKSPACE_ROOT = '/ws'

describe('audioFileCandidates', () => {
  it('builds candidates in precedence order: source dir, workspace root, workspace root/public', () => {
    expect(audioFileCandidates('jump.wav', SOURCE_DIR, WORKSPACE_ROOT)).toEqual([
      '/ws/src/sounds/jump.wav',
      '/ws/jump.wav',
      '/ws/public/jump.wav',
    ])
  })

  it('resolves a relative subpath against each candidate root', () => {
    expect(audioFileCandidates('audio/jump.wav', SOURCE_DIR, WORKSPACE_ROOT)).toEqual([
      '/ws/src/sounds/audio/jump.wav',
      '/ws/audio/jump.wav',
      '/ws/public/audio/jump.wav',
    ])
  })
})

describe('resolveAudioFilePath', () => {
  it('returns the source-directory candidate when it exists — first match wins', () => {
    const exists = vi.fn((p: string) => p === '/ws/src/sounds/jump.wav')
    const result = resolveAudioFilePath('jump.wav', SOURCE_DIR, WORKSPACE_ROOT, exists)
    expect(result).toBe('/ws/src/sounds/jump.wav')
  })

  it('falls back to the workspace root when the source-directory candidate is absent', () => {
    const exists = vi.fn((p: string) => p === '/ws/jump.wav')
    const result = resolveAudioFilePath('jump.wav', SOURCE_DIR, WORKSPACE_ROOT, exists)
    expect(result).toBe('/ws/jump.wav')
  })

  it('falls back to workspace root/public last', () => {
    const exists = vi.fn((p: string) => p === '/ws/public/jump.wav')
    const result = resolveAudioFilePath('jump.wav', SOURCE_DIR, WORKSPACE_ROOT, exists)
    expect(result).toBe('/ws/public/jump.wav')
  })

  it('returns undefined when the path resolves nowhere — the lens must not appear', () => {
    const exists = vi.fn(() => false)
    const result = resolveAudioFilePath('missing.wav', SOURCE_DIR, WORKSPACE_ROOT, exists)
    expect(result).toBeUndefined()
  })

  it('source-directory precedence wins even when a same-named file also exists at workspace root', () => {
    const exists = vi.fn((p: string) => p === '/ws/src/sounds/jump.wav' || p === '/ws/jump.wav')
    const result = resolveAudioFilePath('jump.wav', SOURCE_DIR, WORKSPACE_ROOT, exists)
    expect(result).toBe('/ws/src/sounds/jump.wav')
  })
})
