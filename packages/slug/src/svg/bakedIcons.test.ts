import { describe, it, expect } from 'vitest'
import { packShapeSet } from '../bake'
import { SlugShapeSet } from '../SlugShapeSet'
import { cubicToQuadraticsAdaptive, lineToQuadratic } from '../pipeline/fontParser'
import { iconFromBaked, iconNamesFromBaked } from './bakedIcons'
import type { BakedIconEntry, BakedIconsMeta } from './bakedIcons'
import type { QuadContour } from '../types'

function rect(x0: number, y0: number, x1: number, y1: number): QuadContour {
  const s = 1 / 1024
  return [
    lineToQuadratic(x0, y0, x1, y0, s),
    lineToQuadratic(x1, y0, x1, y1, s),
    lineToQuadratic(x1, y1, x0, y1, s),
    lineToQuadratic(x0, y1, x0, y0, s),
  ]
}

function curvy(): QuadContour {
  const contour = cubicToQuadraticsAdaptive(0, 0, 1.5, 0.1, 1.5, 0.9, 0, 1, 0.0035)
  contour.push(lineToQuadratic(0, 1, 0, 0, 1 / 1024))
  return contour
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

/** A two-icon atlas, shaped exactly like `uikit-bake icons` (post-U3) writes it. */
async function buildAtlas() {
  const set = new SlugShapeSet()
  const activity = set.registerShape([rect(0, 0, 1, 1)])
  const circle = set.registerShape([curvy()])

  const meta: BakedIconsMeta = {
    icons: {
      activity: {
        handles: [activity.glyphId],
        fills: [{ color: { r: 0, g: 0, b: 0, a: 1 }, rule: 'nonzero' }],
        viewBox: { minX: 0, minY: 0, width: 24, height: 24 },
      },
      circle: {
        handles: [circle.glyphId],
        fills: [{ color: { r: 0.1, g: 0.2, b: 0.3, a: 1 }, rule: 'evenodd' }],
        viewBox: { minX: 0, minY: 0, width: 32, height: 32 },
      },
    },
  }

  const glb = await packShapeSet(set, meta as unknown as Record<string, unknown>)
  const loaded = SlugShapeSet.fromBaked(toArrayBuffer(glb))
  return { loaded, activityId: activity.glyphId, circleId: circle.glyphId }
}

describe('iconNamesFromBaked', () => {
  it('lists every icon name baked into meta', async () => {
    const { loaded } = await buildAtlas()
    expect(iconNamesFromBaked(loaded).sort()).toEqual(['activity', 'circle'])
  })

  it('returns an empty array for a set with no icon meta', () => {
    const set = new SlugShapeSet()
    set.registerShape([rect(0, 0, 1, 1)])
    expect(iconNamesFromBaked(set)).toEqual([])
  })
})

describe('iconFromBaked', () => {
  it('resolves an icon by name with handle identity to the loaded set', async () => {
    const { loaded, activityId } = await buildAtlas()
    const icon = iconFromBaked(loaded, 'activity')

    expect(icon).toBeDefined()
    expect(icon!.set).toBe(loaded)
    expect(icon!.handles).toHaveLength(1)
    expect(icon!.handles[0]).toBe(loaded.getShape(activityId))
  })

  it('carries fills and viewBox through unchanged', async () => {
    const { loaded } = await buildAtlas()
    const icon = iconFromBaked(loaded, 'circle')!

    expect(icon.fills).toEqual([{ color: { r: 0.1, g: 0.2, b: 0.3, a: 1 }, rule: 'evenodd' }])
    expect(icon.viewBox).toEqual({ minX: 0, minY: 0, width: 32, height: 32 })
  })

  it('returns undefined for an unknown icon name', async () => {
    const { loaded } = await buildAtlas()
    expect(iconFromBaked(loaded, 'does-not-exist')).toBeUndefined()
  })

  it('returns undefined when the set carries no icon meta at all', () => {
    const set = new SlugShapeSet()
    set.registerShape([rect(0, 0, 1, 1)])
    expect(iconFromBaked(set, 'activity')).toBeUndefined()
  })

  it('throws on a dangling handle id (corrupt atlas)', async () => {
    const { loaded } = await buildAtlas()
    const meta = loaded.meta as unknown as BakedIconsMeta
    meta.icons['activity']!.handles = [999999]

    expect(() => iconFromBaked(loaded, 'activity')).toThrow(/dangling shape handle/)
  })

  it('throws the re-bake error when an entry lacks viewBox (D4)', async () => {
    const { loaded } = await buildAtlas()
    const meta = loaded.meta as unknown as { icons: Record<string, Partial<BakedIconEntry>> }
    delete meta.icons['activity']!.viewBox

    expect(() => iconFromBaked(loaded, 'activity')).toThrow(/re-bake/)
  })
})
