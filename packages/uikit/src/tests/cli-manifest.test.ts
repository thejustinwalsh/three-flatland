/**
 * `uikit-bake icons --manifest <file.json>` (`../cli.ts`) — U10: a
 * declarative bake config, checked into source for deterministic re-bakes,
 * as an alternative to a long positional invocation. The CLI installs its
 * own happy-dom `DOMParser` shim, so no test-level shim is needed here.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, copyFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SlugShapeSet } from '@three-flatland/slug'
import baker from '../cli.js'

const LUCIDE_DIR = join(process.cwd(), 'packages/uikit-lucide/icons')
const ACTIVITY_SVG = join(LUCIDE_DIR, 'activity.svg')
const CIRCLE_SVG = join(LUCIDE_DIR, 'circle.svg')
const X_SVG = join(LUCIDE_DIR, 'x.svg')

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

async function run(args: string[]): Promise<{ code: number; errors: string }> {
  const errors: string[] = []
  const originalError = console.error
  console.error = (...msgs: unknown[]) => {
    errors.push(msgs.map(String).join(' '))
  }
  try {
    const code = await baker.run(args)
    return { code, errors: errors.join('\n') }
  } finally {
    console.error = originalError
  }
}

describe('uikit-bake icons --manifest', () => {
  let tmp: string

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'uikit-bake-manifest-'))
  })

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true })
  })

  it('bakes sources with a name override; meta.icons names/order/viewBox match', async () => {
    const out = join(tmp, 'icons.glb')
    const manifestPath = join(tmp, 'manifest.json')
    writeFileSync(
      manifestPath,
      JSON.stringify({
        out,
        sources: [
          X_SVG,
          { path: ACTIVITY_SVG, name: 'pulse' },
          CIRCLE_SVG,
        ],
      })
    )

    const { code, errors } = await run(['icons', '--manifest', manifestPath])
    expect(errors).toBe('')
    expect(code).toBe(0)

    const set = loadOutput(out)
    const meta = set.meta as unknown as IconsMeta
    // Resolved names: circle, pulse (overridden from activity), x — sorted.
    expect(Object.keys(meta.icons).sort()).toEqual(['circle', 'pulse', 'x'])
    expect(meta.icons.pulse).toBeDefined()
    expect(meta.icons.activity).toBeUndefined()

    for (const name of ['circle', 'pulse', 'x']) {
      const entry = meta.icons[name]!
      expect(entry.handles.length).toBeGreaterThan(0)
      expect(entry.fills.length).toBe(entry.handles.length)
      expect(entry.viewBox).toEqual({ minX: 0, minY: 0, width: 24, height: 24 })
      for (const id of entry.handles) {
        expect(set.getShape(id)).toBeDefined()
      }
    }

    // Ordering: resolved names sort circle < pulse < x, so ids follow suit.
    const circleId = meta.icons.circle!.handles[0]!
    const pulseId = meta.icons.pulse!.handles[0]!
    const xId = meta.icons.x!.handles[0]!
    expect(circleId).toBeLessThan(pulseId)
    expect(pulseId).toBeLessThan(xId)
  })

  it('produces byte-identical output to the equivalent positional bake', async () => {
    const outManifest = join(tmp, 'via-manifest.glb')
    const outPositional = join(tmp, 'via-positional.glb')
    const manifestPath = join(tmp, 'manifest.json')
    writeFileSync(
      manifestPath,
      JSON.stringify({
        out: outManifest,
        sources: [ACTIVITY_SVG, CIRCLE_SVG, X_SVG],
      })
    )

    const manifestRun = await run(['icons', '--manifest', manifestPath])
    expect(manifestRun.errors).toBe('')
    expect(manifestRun.code).toBe(0)

    const positionalRun = await run([
      'icons',
      X_SVG,
      ACTIVITY_SVG,
      CIRCLE_SVG,
      '-o',
      outPositional,
    ])
    expect(positionalRun.errors).toBe('')
    expect(positionalRun.code).toBe(0)

    const bytesManifest = readFileSync(outManifest)
    const bytesPositional = readFileSync(outPositional)
    expect(Buffer.compare(bytesManifest, bytesPositional)).toBe(0)
  })

  it('errors when both --manifest and positional args/--output are supplied', async () => {
    const dir = join(tmp, 'src')
    mkdirSync(dir)
    copyFileSync(ACTIVITY_SVG, join(dir, 'activity.svg'))
    const manifestPath = join(tmp, 'manifest.json')
    writeFileSync(
      manifestPath,
      JSON.stringify({ out: join(tmp, 'icons.glb'), sources: [ACTIVITY_SVG] })
    )

    const withPositional = await run(['icons', '--manifest', manifestPath, dir])
    expect(withPositional.code).toBe(1)
    expect(withPositional.errors).toContain('--manifest')
    expect(withPositional.errors).toContain('mutually exclusive')

    const withOutput = await run([
      'icons',
      '--manifest',
      manifestPath,
      '-o',
      join(tmp, 'other.glb'),
    ])
    expect(withOutput.code).toBe(1)
    expect(withOutput.errors).toContain('mutually exclusive')
  })

  it('errors on an invalid manifest, naming the offending field', async () => {
    const manifestPath = join(tmp, 'manifest.json')

    writeFileSync(manifestPath, JSON.stringify({ sources: [ACTIVITY_SVG] }))
    const missingOut = await run(['icons', '--manifest', manifestPath])
    expect(missingOut.code).toBe(1)
    expect(missingOut.errors).toContain('manifest.out')

    writeFileSync(
      manifestPath,
      JSON.stringify({ out: join(tmp, 'icons.glb'), sources: [{ path: ACTIVITY_SVG, fillRule: 'weird' }] })
    )
    const badFillRule = await run(['icons', '--manifest', manifestPath])
    expect(badFillRule.code).toBe(1)
    expect(badFillRule.errors).toContain('manifest.sources[0].fillRule')
  })
})
