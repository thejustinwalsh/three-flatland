import { describe, expect, it, vi } from 'vitest'
import { publishAtomically, type AtomicPublishDeps, type AtomicPublishPaths } from './atomicPublish'

function fakeDeps(overrides: Partial<AtomicPublishDeps> = {}) {
  const calls: string[] = []
  const deps: AtomicPublishDeps = {
    bake: vi.fn((p: string) => {
      calls.push(`bake:${p}`)
    }),
    writeJson: vi.fn((p: string) => {
      calls.push(`writeJson:${p}`)
    }),
    rename: vi.fn((from: string, to: string) => {
      calls.push(`rename:${from}->${to}`)
    }),
    unlink: vi.fn((p: string) => {
      calls.push(`unlink:${p}`)
    }),
    ...overrides,
  }
  return { deps, calls }
}

const paths: AtomicPublishPaths = {
  pngPath: '/img/a.normal.png',
  jsonPath: '/img/a.normal.json',
  pngTmpPath: '/img/a.normal.png.tmp-x',
  jsonTmpPath: '/img/a.normal.json.tmp-x',
}

describe('publishAtomically', () => {
  it('bakes, writes, and publishes both files in order on success', () => {
    const { deps, calls } = fakeDeps()
    publishAtomically(paths, deps)
    expect(calls).toEqual([
      `bake:${paths.pngTmpPath}`,
      `writeJson:${paths.jsonTmpPath}`,
      `rename:${paths.pngTmpPath}->${paths.pngPath}`,
      `rename:${paths.jsonTmpPath}->${paths.jsonPath}`,
    ])
    expect(deps.unlink).not.toHaveBeenCalled()
  })

  it('never touches the final paths when the bake step fails', () => {
    const { deps } = fakeDeps({
      bake: vi.fn(() => {
        throw new Error('bake failed')
      }),
    })
    expect(() => publishAtomically(paths, deps)).toThrow('bake failed')
    expect(deps.rename).not.toHaveBeenCalled()
    expect(deps.unlink).toHaveBeenCalledWith(paths.pngTmpPath)
    expect(deps.unlink).toHaveBeenCalledWith(paths.jsonTmpPath)
  })

  it('never touches the final paths when JSON serialization fails after a successful bake', () => {
    const { deps } = fakeDeps({
      writeJson: vi.fn(() => {
        throw new Error('write failed')
      }),
    })
    expect(() => publishAtomically(paths, deps)).toThrow('write failed')
    expect(deps.rename).not.toHaveBeenCalled()
    expect(deps.unlink).toHaveBeenCalledWith(paths.pngTmpPath)
    expect(deps.unlink).toHaveBeenCalledWith(paths.jsonTmpPath)
  })

  it('cleans up both temps and rethrows when the first rename fails', () => {
    const { deps } = fakeDeps({
      rename: vi.fn((from: string) => {
        throw new Error(`rename failed: ${from}`)
      }),
    })
    expect(() => publishAtomically(paths, deps)).toThrow(/rename failed/)
    expect(deps.unlink).toHaveBeenCalledWith(paths.pngTmpPath)
    expect(deps.unlink).toHaveBeenCalledWith(paths.jsonTmpPath)
  })

  it('does not let a cleanup failure mask the original error', () => {
    const { deps } = fakeDeps({
      bake: vi.fn(() => {
        throw new Error('bake failed')
      }),
      unlink: vi.fn(() => {
        throw new Error('unlink also failed')
      }),
    })
    expect(() => publishAtomically(paths, deps)).toThrow('bake failed')
  })
})
