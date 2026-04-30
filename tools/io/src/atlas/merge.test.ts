import { describe, it, expect } from 'vitest'
import type { AtlasJson } from './types'
import { computeMerge, type MergeSource } from './merge'

function makeSource(alias: string, frames: Record<string, [number, number, number, number]>): MergeSource {
  const json: AtlasJson = {
    meta: { app: 'x', version: '1', image: `${alias}.png`, size: { w: 64, h: 64 }, scale: '1' },
    frames: Object.fromEntries(
      Object.entries(frames).map(([n, [x, y, w, h]]) => [
        n,
        {
          frame: { x, y, w, h },
          rotated: false,
          trimmed: false,
          spriteSourceSize: { x: 0, y: 0, w, h },
          sourceSize: { w, h },
        },
      ])
    ),
  }
  return { uri: `file:///${alias}.atlas.json`, alias, json, renames: {} }
}

describe('computeMerge', () => {
  it('passes unique frame names through unchanged', () => {
    const r = computeMerge({
      sources: [
        makeSource('knight', { hand: [0, 0, 8, 8] }),
        makeSource('goblin', { foot: [0, 0, 8, 8] }),
      ],
      maxSize: 64,
      padding: 0,
      powerOfTwo: false,
    })
    if (r.kind !== 'ok') throw new Error('expected ok')
    expect(Object.keys(r.atlas.frames).sort()).toEqual(['foot', 'hand'])
  })

  it('detects frame name conflicts and reports them', () => {
    const r = computeMerge({
      sources: [
        makeSource('knight', { idle_0: [0, 0, 8, 8] }),
        makeSource('goblin', { idle_0: [0, 0, 8, 8] }),
      ],
      maxSize: 64,
      padding: 0,
      powerOfTwo: false,
    })
    expect(r.kind).toBe('conflicts')
    if (r.kind !== 'conflicts') throw new Error()
    expect(r.frameConflicts).toHaveLength(1)
    expect(r.frameConflicts[0]!.name).toBe('idle_0')
    expect(r.frameConflicts[0]!.sources.map((s) => s.alias).sort()).toEqual(['goblin', 'knight'])
  })

  it('applies a per-source rename to resolve a conflict', () => {
    const knight = makeSource('knight', { idle_0: [0, 0, 8, 8] })
    const goblin = makeSource('goblin', { idle_0: [0, 0, 8, 8] })
    knight.renames = { frames: { idle_0: 'knight/idle_0' } }
    const r = computeMerge({
      sources: [knight, goblin],
      maxSize: 64,
      padding: 0,
      powerOfTwo: false,
    })
    if (r.kind !== 'ok') throw new Error('expected ok')
    expect(Object.keys(r.atlas.frames).sort()).toEqual(['idle_0', 'knight/idle_0'])
  })

  it('rewrites animation frame references when frames are renamed', () => {
    const src: MergeSource = {
      uri: 'file:///a.atlas.json',
      alias: 'a',
      json: {
        meta: {
          app: 'x',
          version: '1',
          image: 'a.png',
          size: { w: 64, h: 64 },
          scale: '1',
          animations: {
            walk: { frameSet: ['idle_0'], frames: [0], fps: 12, loop: true, pingPong: false },
          },
        },
        frames: {
          idle_0: {
            frame: { x: 0, y: 0, w: 8, h: 8 },
            rotated: false,
            trimmed: false,
            spriteSourceSize: { x: 0, y: 0, w: 8, h: 8 },
            sourceSize: { w: 8, h: 8 },
          },
        },
      },
      renames: { frames: { idle_0: 'a/idle_0' } },
    }
    const r = computeMerge({ sources: [src], maxSize: 64, padding: 0, powerOfTwo: false })
    if (r.kind !== 'ok') throw new Error('expected ok')
    expect(r.atlas.meta.animations!.walk!.frameSet).toEqual(['a/idle_0'])
  })

  it('records merge sources in meta.merge.sources', () => {
    const r = computeMerge({
      sources: [makeSource('knight', { hand: [0, 0, 8, 8] })],
      maxSize: 64,
      padding: 0,
      powerOfTwo: false,
    })
    if (r.kind !== 'ok') throw new Error('expected ok')
    expect(r.atlas.meta.merge?.sources[0]).toMatchObject({ alias: 'knight', frames: 1 })
  })
})
