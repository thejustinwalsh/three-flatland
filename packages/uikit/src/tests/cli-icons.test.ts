/**
 * `uikit-bake icons` (`../cli.ts`) — U3: `viewBox` in per-icon meta plus
 * deterministic (basename-then-path) file ordering and a hard error on a
 * duplicate resolved icon name. The CLI installs its own happy-dom
 * `DOMParser` shim (`installDomParserShim`), so no test-level shim is
 * needed here — unlike `svg-shared-set.test.ts`, which drives `loadSvg`
 * directly and must install one itself.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, copyFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SlugShapeSet } from '@three-flatland/slug'
import baker from '../cli.js'

const ACTIVITY_SVG = join(process.cwd(), 'packages/uikit-lucide/icons/activity.svg')

function svg(viewBox: string, path: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}"><path d="${path}" fill="black"/></svg>`
}

const SQUARE = svg('0 0 24 24', 'M2 2 H22 V22 H2 Z')
const TRIANGLE = svg('0 0 32 32', 'M16 2 L30 30 L2 30 Z')

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

function loadOutput(path: string): SlugShapeSet {
  return SlugShapeSet.fromBaked(toArrayBuffer(readFileSync(path)))
}

interface IconsMeta {
  icons: Record<
    string,
    {
      handles: number[]
      fills: { color: { r: number; g: number; b: number; a: number }; rule: string }[]
      viewBox: { minX: number; minY: number; width: number; height: number }
    }
  >
}

describe('uikit-bake icons — viewBox meta + deterministic ordering', () => {
  let tmp: string

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'uikit-bake-icons-'))
  })

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true })
  })

  it('writes handles, fills, and viewBox per icon in meta.icons', async () => {
    const dir = join(tmp, 'src')
    mkdirSync(dir)
    writeFileSync(join(dir, 'square.svg'), SQUARE)
    writeFileSync(join(dir, 'triangle.svg'), TRIANGLE)
    copyFileSync(ACTIVITY_SVG, join(dir, 'activity.svg'))

    const out = join(tmp, 'icons.glb')
    const code = await baker.run(['icons', dir, '-o', out])
    expect(code).toBe(0)

    const set = loadOutput(out)
    const meta = set.meta as unknown as IconsMeta
    expect(Object.keys(meta.icons).sort()).toEqual(['activity', 'square', 'triangle'])

    for (const name of ['activity', 'square', 'triangle']) {
      const entry = meta.icons[name]!
      expect(Array.isArray(entry.handles)).toBe(true)
      expect(entry.handles.length).toBeGreaterThan(0)
      expect(Array.isArray(entry.fills)).toBe(true)
      expect(entry.fills.length).toBe(entry.handles.length)
      for (const fill of entry.fills) {
        expect(fill.rule === 'nonzero' || fill.rule === 'evenodd').toBe(true)
        expect(typeof fill.color.r).toBe('number')
      }
      expect(entry.viewBox).toBeDefined()
      // Every handle must resolve in the packed set — proves the id was
      // captured correctly, not just carried through untouched.
      for (const id of entry.handles) {
        expect(set.getShape(id)).toBeDefined()
      }
    }

    expect(meta.icons.square!.viewBox).toEqual({ minX: 0, minY: 0, width: 24, height: 24 })
    expect(meta.icons.triangle!.viewBox).toEqual({ minX: 0, minY: 0, width: 32, height: 32 })
  })

  it('assigns shape ids in basename-sorted order regardless of directory listing order', async () => {
    const dir = join(tmp, 'src')
    mkdirSync(dir)
    // Write in an order that does NOT match basename-sort, to prove sorting
    // (not readdir/insertion order) determines id assignment.
    writeFileSync(join(dir, 'zebra.svg'), svg('0 0 10 10', 'M0 0 H10 V10 H0 Z'))
    writeFileSync(join(dir, 'apple.svg'), svg('0 0 10 10', 'M0 0 H10 V10 H0 Z'))
    writeFileSync(join(dir, 'mango.svg'), svg('0 0 10 10', 'M0 0 H10 V10 H0 Z'))

    const out = join(tmp, 'icons.glb')
    const code = await baker.run(['icons', dir, '-o', out])
    expect(code).toBe(0)

    const set = loadOutput(out)
    const meta = set.meta as unknown as IconsMeta
    const appleId = meta.icons.apple!.handles[0]!
    const mangoId = meta.icons.mango!.handles[0]!
    const zebraId = meta.icons.zebra!.handles[0]!
    expect(appleId).toBeLessThan(mangoId)
    expect(mangoId).toBeLessThan(zebraId)
  })

  it('errors on two different paths resolving to the same icon name, naming both', async () => {
    const dirA = join(tmp, 'a')
    const dirB = join(tmp, 'b')
    mkdirSync(dirA)
    mkdirSync(dirB)
    const fileA = join(dirA, 'icon.svg')
    const fileB = join(dirB, 'icon.svg')
    writeFileSync(fileA, SQUARE)
    writeFileSync(fileB, TRIANGLE)

    const out = join(tmp, 'icons.glb')
    const errors: string[] = []
    const originalError = console.error
    console.error = (...msgs: unknown[]) => {
      errors.push(msgs.map(String).join(' '))
    }
    try {
      const code = await baker.run(['icons', dirA, dirB, '-o', out])
      expect(code).toBe(1)
    } finally {
      console.error = originalError
    }
    const message = errors.join('\n')
    expect(message).toContain(fileA)
    expect(message).toContain(fileB)
    expect(message).toContain('icon')
  })

  it('same input directory bakes to byte-identical meta across two runs', async () => {
    const dir = join(tmp, 'src')
    mkdirSync(dir)
    writeFileSync(join(dir, 'square.svg'), SQUARE)
    writeFileSync(join(dir, 'triangle.svg'), TRIANGLE)

    const outA = join(tmp, 'a.glb')
    const outB = join(tmp, 'b.glb')
    expect(await baker.run(['icons', dir, '-o', outA])).toBe(0)
    expect(await baker.run(['icons', dir, '-o', outB])).toBe(0)

    const metaA = (loadOutput(outA).meta as unknown as IconsMeta).icons
    const metaB = (loadOutput(outB).meta as unknown as IconsMeta).icons
    expect(metaA).toEqual(metaB)
  })
})
