import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as bakeModule from './bake'
import { encodePng } from './bake'
import { flatlandAtlas, validateEntries, bakeEntry, type AtlasEntry } from './vite-plugin'

/** A tiny valid opaque PNG — enough for `bakeAtlas` to succeed on real bytes. */
function writeFixturePng(path: string, size = 4): void {
  const rgba = new Uint8Array(size * size * 4).fill(255)
  writeFileSync(path, encodePng({ width: size, height: size, rgba }))
}

describe('validateEntries', () => {
  it('throws when entries is empty', () => {
    expect(() => validateEntries([])).toThrow(/at least one entry/)
  })

  it('throws on missing src (empty string)', () => {
    expect(() => validateEntries([{ src: '', out: 'a' }])).toThrow(/src is missing/)
  })

  it('throws on missing src (empty array)', () => {
    expect(() => validateEntries([{ src: [], out: 'a' }])).toThrow(/src is missing/)
  })

  it('throws on missing out', () => {
    expect(() => validateEntries([{ src: 'sprites', out: '' }])).toThrow(/out is missing/)
  })

  it('throws on colliding out across entries', () => {
    expect(() =>
      validateEntries([
        { src: 'sprites/a', out: 'assets/particles' },
        { src: 'sprites/b', out: 'assets/particles' },
      ])
    ).toThrow(/collides/)
  })

  it('accepts well-formed entries', () => {
    expect(() => validateEntries([{ src: 'sprites', out: 'assets/particles' }])).not.toThrow()
  })
})

describe('bakeEntry staleness cache', () => {
  let dir: string
  let cacheDir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'flatland-atlas-test-'))
    cacheDir = join(dir, '.cache')
    mkdirSync(join(dir, 'sprites'))
    writeFixturePng(join(dir, 'sprites', 'a.png'))
    writeFixturePng(join(dir, 'sprites', 'b.png'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  it('bakes once and reuses the cache across a second, unchanged call', () => {
    const spy = vi.spyOn(bakeModule, 'bakeAtlas')
    const entry: AtlasEntry = { src: 'sprites', out: 'assets/particles' }

    const first = bakeEntry(dir, cacheDir, entry)
    const second = bakeEntry(dir, cacheDir, entry)

    expect(spy).toHaveBeenCalledTimes(1)
    expect(second.json).toEqual(first.json)
    expect(existsSync(join(cacheDir, 'assets_particles.hash'))).toBe(true)
    expect(existsSync(join(cacheDir, 'assets_particles.json'))).toBe(true)
    expect(existsSync(join(cacheDir, 'assets_particles.png'))).toBe(true)
  })

  it('re-bakes when a source file changes', () => {
    const spy = vi.spyOn(bakeModule, 'bakeAtlas')
    const entry: AtlasEntry = { src: 'sprites', out: 'assets/particles' }

    bakeEntry(dir, cacheDir, entry)
    writeFixturePng(join(dir, 'sprites', 'a.png'), 8)
    bakeEntry(dir, cacheDir, entry)

    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('re-bakes when bake options change', () => {
    const spy = vi.spyOn(bakeModule, 'bakeAtlas')
    const withDefaults: AtlasEntry = { src: 'sprites', out: 'assets/particles' }
    const withOptions: AtlasEntry = {
      src: 'sprites',
      out: 'assets/particles',
      bake: { vertexBudget: 4 },
    }

    bakeEntry(dir, cacheDir, withDefaults)
    bakeEntry(dir, cacheDir, withOptions)

    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('supports a glob src alongside a bare directory', () => {
    const entry: AtlasEntry = { src: 'sprites/*.png', out: 'assets/particles' }
    const result = bakeEntry(dir, cacheDir, entry)
    expect(Object.keys(result.json.frames).sort()).toEqual(['a', 'b'])
  })

  it('throws when a src pattern matches no files', () => {
    const entry: AtlasEntry = { src: 'sprites/*.jpg', out: 'assets/nothing' }
    expect(() => bakeEntry(dir, cacheDir, entry)).toThrow(/matched no \.png files/)
  })
})

describe('flatlandAtlas plugin hooks', () => {
  let dir: string
  let cacheDir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'flatland-atlas-plugin-'))
    cacheDir = join(dir, '.cache')
    mkdirSync(join(dir, 'sprites'))
    writeFixturePng(join(dir, 'sprites', 'a.png'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  // Mocked `ResolvedConfig` / `PluginContext` / `ViteDevServer` shapes —
  // narrow, hand-rolled stand-ins for the slice of Vite's API this plugin
  // actually touches. Real Vite objects are exercised in
  // vite-plugin.integration.test.ts.
  function resolvedConfig(command: 'build' | 'serve') {
    return { root: dir, cacheDir, command } as any
  }

  it('validates entries eagerly at construction, before any hook runs', () => {
    expect(() => flatlandAtlas({ entries: [] })).toThrow(/at least one entry/)
  })

  it('emits the baked pair via emitFile in build mode', () => {
    const plugin = flatlandAtlas({ entries: [{ src: 'sprites', out: 'assets/particles' }] })
    ;(plugin.configResolved as any).call(undefined, resolvedConfig('build'))

    const emitFile = vi.fn()
    ;(plugin.buildStart as any).call({ emitFile })

    expect(emitFile).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'asset', fileName: 'assets/particles.json' })
    )
    expect(emitFile).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'asset', fileName: 'assets/particles.png' })
    )
  })

  it('does not emit files in serve mode', () => {
    const plugin = flatlandAtlas({ entries: [{ src: 'sprites', out: 'assets/particles' }] })
    ;(plugin.configResolved as any).call(undefined, resolvedConfig('serve'))

    const emitFile = vi.fn()
    ;(plugin.buildStart as any).call({ emitFile })

    expect(emitFile).not.toHaveBeenCalled()
  })

  it('serves the baked json + png from a dev middleware', () => {
    const plugin = flatlandAtlas({ entries: [{ src: 'sprites', out: 'assets/particles' }] })
    ;(plugin.configResolved as any).call(undefined, resolvedConfig('serve'))
    ;(plugin.buildStart as any).call({ emitFile: vi.fn() })

    const middlewares = { use: vi.fn() }
    const watcher = { add: vi.fn(), on: vi.fn() }
    const server = {
      middlewares,
      watcher,
      ws: { send: vi.fn() },
      config: { logger: { warn: vi.fn() } },
    }
    ;(plugin.configureServer as any).call(undefined, server)

    expect(watcher.add).toHaveBeenCalledWith(join(dir, 'sprites'))
    const handler = middlewares.use.mock.calls[0]![0]

    const jsonRes = { setHeader: vi.fn(), end: vi.fn() }
    handler({ url: '/assets/particles.json' }, jsonRes, vi.fn())
    expect(jsonRes.setHeader).toHaveBeenCalledWith('Content-Type', 'application/json')
    expect(jsonRes.end).toHaveBeenCalled()

    const pngRes = { setHeader: vi.fn(), end: vi.fn() }
    handler({ url: '/assets/particles.png' }, pngRes, vi.fn())
    expect(pngRes.setHeader).toHaveBeenCalledWith('Content-Type', 'image/png')

    const next = vi.fn()
    handler({ url: '/unknown.json' }, { setHeader: vi.fn(), end: vi.fn() }, next)
    expect(next).toHaveBeenCalled()
  })

  it('re-bakes and triggers a full reload when a watched sprite changes', () => {
    const plugin = flatlandAtlas({ entries: [{ src: 'sprites', out: 'assets/particles' }] })
    ;(plugin.configResolved as any).call(undefined, resolvedConfig('serve'))
    ;(plugin.buildStart as any).call({ emitFile: vi.fn() })

    const watcher = { add: vi.fn(), on: vi.fn() }
    const wsSend = vi.fn()
    const server = {
      middlewares: { use: vi.fn() },
      watcher,
      ws: { send: wsSend },
      config: { logger: { warn: vi.fn() } },
    }
    ;(plugin.configureServer as any).call(undefined, server)

    const onAll = watcher.on.mock.calls.find((call: unknown[]) => call[0] === 'all')![1] as (
      event: string,
      file: string
    ) => void
    writeFixturePng(join(dir, 'sprites', 'a.png'), 8)
    onAll('change', join(dir, 'sprites', 'a.png'))

    expect(wsSend).toHaveBeenCalledWith({ type: 'full-reload' })
  })

  it('ignores watcher events outside a watched entry directory', () => {
    const plugin = flatlandAtlas({ entries: [{ src: 'sprites', out: 'assets/particles' }] })
    ;(plugin.configResolved as any).call(undefined, resolvedConfig('serve'))
    ;(plugin.buildStart as any).call({ emitFile: vi.fn() })

    const watcher = { add: vi.fn(), on: vi.fn() }
    const wsSend = vi.fn()
    const server = {
      middlewares: { use: vi.fn() },
      watcher,
      ws: { send: wsSend },
      config: { logger: { warn: vi.fn() } },
    }
    ;(plugin.configureServer as any).call(undefined, server)

    const onAll = watcher.on.mock.calls.find((call: unknown[]) => call[0] === 'all')![1] as (
      event: string,
      file: string
    ) => void
    onAll('change', join(dir, 'unrelated.png'))

    expect(wsSend).not.toHaveBeenCalled()
  })

  it('warns instead of crashing the dev server when a re-bake fails', () => {
    const plugin = flatlandAtlas({ entries: [{ src: 'sprites', out: 'assets/particles' }] })
    ;(plugin.configResolved as any).call(undefined, resolvedConfig('serve'))
    ;(plugin.buildStart as any).call({ emitFile: vi.fn() })

    const watcher = { add: vi.fn(), on: vi.fn() }
    const warn = vi.fn()
    const wsSend = vi.fn()
    const server = {
      middlewares: { use: vi.fn() },
      watcher,
      ws: { send: wsSend },
      config: { logger: { warn } },
    }
    ;(plugin.configureServer as any).call(undefined, server)

    rmSync(join(dir, 'sprites', 'a.png'))
    const onAll = watcher.on.mock.calls.find((call: unknown[]) => call[0] === 'all')![1] as (
      event: string,
      file: string
    ) => void
    onAll('unlink', join(dir, 'sprites', 'a.png'))

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('assets/particles'))
    expect(wsSend).not.toHaveBeenCalled()
  })
})
