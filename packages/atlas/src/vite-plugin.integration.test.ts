/**
 * Exercises the plugin against a real Vite build (and a real dev server)
 * rather than mocked hooks — proof that `emitFile` lands the baked pair
 * at the right path in a real bundle, and that the dev middleware serves
 * the same pair over HTTP.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { build, createServer } from 'vite'
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  readFileSync,
  existsSync,
  realpathSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as bakeModule from './bake'
import { encodePng, type BakedAtlasJSON } from './bake'
import { flatlandAtlas, type FlatlandAtlasOptions } from './vite-plugin'

function writeFixturePng(path: string, size = 4): void {
  const rgba = new Uint8Array(size * size * 4).fill(255)
  writeFileSync(path, encodePng({ width: size, height: size, rgba }))
}

describe('flatlandAtlas — real Vite build', () => {
  let root: string
  let outDir: string

  beforeEach(() => {
    // realpath: on macOS os.tmpdir() lives under a /var -> /private/var
    // symlink; Vite resolves paths through fs.realpath internally, and a
    // root that doesn't match trips its relative-path math for emitted
    // HTML assets.
    root = realpathSync(mkdtempSync(join(tmpdir(), 'flatland-atlas-vite-')))
    outDir = join(root, 'dist')
    mkdirSync(join(root, 'sprites'))
    writeFixturePng(join(root, 'sprites', 'ember.png'))
    writeFixturePng(join(root, 'sprites', 'spark.png'))
    writeFileSync(join(root, 'index.html'), '<script type="module" src="/main.js"></script>')
    writeFileSync(join(root, 'main.js'), 'console.log("ok")\n')
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  function buildOptions(): FlatlandAtlasOptions {
    return { entries: [{ src: 'sprites', out: 'assets/particles' }] }
  }

  it('emits the baked json + png with mesh polygons into the build output', async () => {
    await build({
      root,
      logLevel: 'silent',
      configFile: false,
      plugins: [flatlandAtlas(buildOptions())],
      build: { outDir, write: true, emptyOutDir: true },
    })

    const jsonPath = join(outDir, 'assets', 'particles.json')
    const pngPath = join(outDir, 'assets', 'particles.png')
    expect(existsSync(jsonPath)).toBe(true)
    expect(existsSync(pngPath)).toBe(true)

    const json = JSON.parse(readFileSync(jsonPath, 'utf-8')) as BakedAtlasJSON
    expect(Object.keys(json.frames).sort()).toEqual(['ember', 'spark'])
    expect(json.meta.image).toBe('particles.png')
    for (const frame of Object.values(json.frames)) {
      expect(frame.mesh).toBeDefined()
      expect(frame.mesh!.verts.length).toBeGreaterThan(0)
      expect(frame.mesh!.indices.length).toBeGreaterThan(0)
    }
  }, 30000)

  it('bakes once across two builds with unchanged inputs, and re-bakes after a source changes', async () => {
    const spy = vi.spyOn(bakeModule, 'bakeAtlas')

    await build({
      root,
      logLevel: 'silent',
      configFile: false,
      plugins: [flatlandAtlas(buildOptions())],
      build: { outDir, write: true, emptyOutDir: true },
    })
    expect(spy).toHaveBeenCalledTimes(1)

    await build({
      root,
      logLevel: 'silent',
      configFile: false,
      plugins: [flatlandAtlas(buildOptions())],
      build: { outDir, write: true, emptyOutDir: true },
    })
    expect(spy).toHaveBeenCalledTimes(1) // cache hit — still written to dist below
    expect(existsSync(join(outDir, 'assets', 'particles.json'))).toBe(true)

    writeFixturePng(join(root, 'sprites', 'ember.png'), 8)
    await build({
      root,
      logLevel: 'silent',
      configFile: false,
      plugins: [flatlandAtlas(buildOptions())],
      build: { outDir, write: true, emptyOutDir: true },
    })
    expect(spy).toHaveBeenCalledTimes(2)
  }, 60000)

  it('serves the baked pair over HTTP from a real dev server', async () => {
    const server = await createServer({
      root,
      logLevel: 'silent',
      configFile: false,
      plugins: [flatlandAtlas(buildOptions())],
      server: { port: 0, strictPort: false },
    })
    await server.listen()

    try {
      const address = server.httpServer!.address()
      const port = typeof address === 'object' && address ? address.port : undefined
      expect(port).toBeDefined()

      const jsonRes = await fetch(`http://localhost:${port}/assets/particles.json`)
      expect(jsonRes.status).toBe(200)
      const json = (await jsonRes.json()) as BakedAtlasJSON
      expect(Object.keys(json.frames).sort()).toEqual(['ember', 'spark'])

      const pngRes = await fetch(`http://localhost:${port}/assets/particles.png`)
      expect(pngRes.status).toBe(200)
      expect(pngRes.headers.get('content-type')).toBe('image/png')
    } finally {
      await server.close()
    }
  }, 30000)
})
