import { describe, expect, it } from 'vitest'
import atlasManifest from '../src/assets/driller/driller-animations.json'
import {
  DRILLER_ATLAS_COLUMNS,
  DRILLER_ATLAS_ROWS,
  DRILLER_ANIMATION_SPECS,
  DRILLER_FLIPPED_FOOT_ANCHOR_X,
  DRILLER_FOOT_ANCHOR,
  DRILLER_FOOT_X,
  DRILLER_FOOT_Y_FROM_TOP,
  DRILLER_FRAME_SIZE,
  GHOST_BODY_ANCHOR,
  GHOST_BODY_X,
  GHOST_BODY_Y_FROM_TOP,
  GHOST_MAX_SCALE,
  drillerAnimationFrameAt,
  drillerFootAnchorX,
  drillerFrame,
  drillerShouldFlipX,
  ghostRiseScale,
} from '../src/lib/driller-frames'

describe('driller atlas registration', () => {
  it('keeps the runtime foot anchor synchronized with the generated atlas', () => {
    for (const [name, animation] of Object.entries(atlasManifest.animations)) {
      if (name === 'ghost') continue
      expect(animation.anchor, name).toEqual([DRILLER_FOOT_X, DRILLER_FOOT_Y_FROM_TOP])
    }
  })

  it('places the shared foot anchor exactly on the sprite origin', () => {
    expect(localXAtAnchor(DRILLER_FOOT_X, DRILLER_FOOT_ANCHOR[0])).toBeCloseTo(0)
    expect(localYAtAnchor(DRILLER_FOOT_Y_FROM_TOP, DRILLER_FOOT_ANCHOR[1])).toBeCloseTo(0)
  })

  it('mirrors the off-centre foot anchor with left-facing UVs', () => {
    const mirroredFootX = DRILLER_FRAME_SIZE - DRILLER_FOOT_X

    expect(drillerShouldFlipX('walk', -1)).toBe(true)
    expect(drillerFootAnchorX(true)).toBe(DRILLER_FLIPPED_FOOT_ANCHOR_X)
    expect(localXAtAnchor(mirroredFootX, DRILLER_FLIPPED_FOOT_ANCHOR_X)).toBeCloseTo(0)
  })

  it('keeps authored horizontal drill rows unflipped in both directions', () => {
    expect(drillerShouldFlipX('drillLeft', -1)).toBe(false)
    expect(drillerShouldFlipX('drillRight', 1)).toBe(false)
    expect(drillerFootAnchorX(false)).toBe(DRILLER_FOOT_ANCHOR[0])
  })

  it('centres every ghost afterimage on the same anatomical point', () => {
    expect(localXAtAnchor(GHOST_BODY_X, GHOST_BODY_ANCHOR[0])).toBeCloseTo(0)
    expect(localYAtAnchor(GHOST_BODY_Y_FROM_TOP, GHOST_BODY_ANCHOR[1])).toBeCloseTo(0)
  })

  it('maps all four authored ghost frames from the final atlas row', () => {
    const spec = DRILLER_ANIMATION_SPECS.ghost
    expect(spec).toMatchObject({ row: 9, frames: 4 })

    for (let column = 0; column < spec.frames; column++) {
      const frame = drillerFrame(spec.row, column, `ghost:${column}`, GHOST_BODY_ANCHOR)
      expect(frame.x).toBe(column / DRILLER_ATLAS_COLUMNS)
      expect(frame.y).toBe(0)
      expect(frame.width).toBe(1 / DRILLER_ATLAS_COLUMNS)
      expect(frame.height).toBe(1 / DRILLER_ATLAS_ROWS)
      expect(frame.pivot).toEqual({ x: GHOST_BODY_ANCHOR[0], y: GHOST_BODY_ANCHOR[1] })
    }
  })

  it('plays the fall entry once and loops only the two airborne frames', () => {
    expect(drillerAnimationFrameAt('fall', 0)).toBe(0)
    expect(drillerAnimationFrameAt('fall', 109)).toBe(0)
    expect(drillerAnimationFrameAt('fall', 110)).toBe(1)
    expect(drillerAnimationFrameAt('fall', 220)).toBe(2)
    expect(drillerAnimationFrameAt('fall', 330)).toBe(1)
    expect(drillerAnimationFrameAt('fall', 440)).toBe(2)
  })

  it('plays both landing frames once and holds the settled pose', () => {
    expect(drillerAnimationFrameAt('land', 0)).toBe(3)
    expect(drillerAnimationFrameAt('land', 109)).toBe(3)
    expect(drillerAnimationFrameAt('land', 110)).toBe(4)
    expect(drillerAnimationFrameAt('land', 1_000)).toBe(4)
  })

  it('grows the rising ghost smoothly from native size to a capped 2x', () => {
    expect(ghostRiseScale(60, 60, 0)).toBe(1)
    expect(ghostRiseScale(60, 45, 0)).toBeGreaterThan(1)
    expect(ghostRiseScale(60, 30, 0)).toBe(1.5)
    expect(ghostRiseScale(60, 0, 0)).toBe(GHOST_MAX_SCALE)
    expect(ghostRiseScale(60, -10, 0)).toBe(GHOST_MAX_SCALE)
    expect(ghostRiseScale(60, 70, 0)).toBe(1)
  })
})

function localXAtAnchor(sourceX: number, anchorX: number): number {
  const sourceOffset = sourceX - DRILLER_FRAME_SIZE / 2
  const anchorOffset = (0.5 - anchorX) * DRILLER_FRAME_SIZE
  return sourceOffset + anchorOffset
}

function localYAtAnchor(sourceYFromTop: number, anchorY: number): number {
  const sourceOffset = DRILLER_FRAME_SIZE / 2 - sourceYFromTop
  const anchorOffset = (0.5 - anchorY) * DRILLER_FRAME_SIZE
  return sourceOffset + anchorOffset
}
