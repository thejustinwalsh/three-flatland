import type { SpriteFrame } from 'three-flatland/react'
import type { DrillerAnimState } from '../traits'

export const DRILLER_ATLAS_COLUMNS = 6
export const DRILLER_ATLAS_ROWS = 10

// The extracted 64px source cell has 2px transparent padding on every side.
// Rendering the padded 68px quad at 68 world units preserves the source pixel
// scale while keeping drill and dodge overflow away from adjacent frames.
export const DRILLER_FRAME_SIZE = 68

export const DRILLER_FOOT_X = 38
export const DRILLER_FOOT_Y_FROM_TOP = 42

// Source registration is measured from the atlas top-left. Sprite2D anchors
// use bottom-left Y, so the authored Y coordinate must be inverted. The X
// registration matches the generated atlas manifest exactly. Directional
// drill overflow stays inside its padded frame rather than shifting the body.
export const DRILLER_FOOT_ANCHOR: [number, number] = [
  DRILLER_FOOT_X / DRILLER_FRAME_SIZE,
  1 - DRILLER_FOOT_Y_FROM_TOP / DRILLER_FRAME_SIZE,
]

// Sprite2D flipX mirrors UVs around the frame centre; it deliberately does
// not move the quad anchor. The authored foot is 4px right of the 68px cell
// centre, so a flipped frame must mirror the anchor too or the planted body
// jumps 8px left when facing left.
export const DRILLER_FLIPPED_FOOT_ANCHOR_X = 1 - DRILLER_FOOT_ANCHOR[0]

/** Horizontal drill rows are already authored in both directions. */
export function drillerShouldFlipX(state: DrillerAnimState, facing: 1 | -1): boolean {
  return facing < 0 && state !== 'drillLeft' && state !== 'drillRight'
}

/** Resolve the anatomical foot anchor after an optional UV mirror. */
export function drillerFootAnchorX(flipX: boolean): number {
  return flipX ? DRILLER_FLIPPED_FOOT_ANCHOR_X : DRILLER_FOOT_ANCHOR[0]
}

// The ghost is airborne, so register its body centre to the cleared cell
// instead of pinning its feet to terrain. Its authored upward motion remains
// inside each frame while all afterimages share a stable anatomical anchor.
export const GHOST_BODY_X = 38
export const GHOST_BODY_Y_FROM_TOP = 30
export const GHOST_BODY_ANCHOR: [number, number] = [
  GHOST_BODY_X / DRILLER_FRAME_SIZE,
  1 - GHOST_BODY_Y_FROM_TOP / DRILLER_FRAME_SIZE,
]
export const GHOST_MAX_SCALE = 2

/**
 * Scale the ghost from native size at emergence to 2× near the beam exit.
 * Rows decrease as the ghost rises. Smoothstep keeps both endpoints calm and
 * clamps overshoot if a frame renders just before or after the planned span.
 */
export function ghostRiseScale(startRow: number, currentRow: number, fullScaleRow: number): number {
  const riseSpan = Math.max(1, startRow - fullScaleRow)
  const linear = Math.min(1, Math.max(0, (startRow - currentRow) / riseSpan))
  const eased = linear * linear * (3 - 2 * linear)
  return 1 + eased * (GHOST_MAX_SCALE - 1)
}

export interface DrillerAnimationSpec {
  row: number
  frames: number
  frameMs: number
  /** Atlas columns in playback order. */
  sequence: readonly number[]
  /** Sequence index to loop from; omitted means play once and hold the last frame. */
  loopFrom?: number
}

export const DRILLER_ANIMATION_SPECS = {
  idle: { row: 0, frames: 4, frameMs: 220, sequence: [0, 1, 2, 3], loopFrom: 0 },
  walk: { row: 1, frames: 6, frameMs: 90, sequence: [0, 1, 2, 3, 4, 5], loopFrom: 0 },
  drillDown: { row: 2, frames: 5, frameMs: 85, sequence: [0, 1, 2, 3, 4], loopFrom: 0 },
  drillUp: { row: 3, frames: 5, frameMs: 85, sequence: [0, 1, 2, 3, 4], loopFrom: 0 },
  drillLeft: { row: 4, frames: 4, frameMs: 85, sequence: [0, 1, 2, 3], loopFrom: 0 },
  drillRight: { row: 5, frames: 4, frameMs: 85, sequence: [0, 1, 2, 3], loopFrom: 0 },
  trip: { row: 6, frames: 5, frameMs: 120, sequence: [0, 1, 2, 3, 4], loopFrom: 0 },
  dodge: { row: 7, frames: 4, frameMs: 90, sequence: [0, 1, 2, 3], loopFrom: 0 },
  // The authored fall row is a compound sequence: enter on frame 0, loop
  // airborne frames 1–2, then hand off to the landing state for frames 3–4.
  fall: { row: 8, frames: 5, frameMs: 110, sequence: [0, 1, 2], loopFrom: 1 },
  land: { row: 8, frames: 5, frameMs: 110, sequence: [3, 4] },
  ghost: { row: 9, frames: 4, frameMs: 150, sequence: [0, 1, 2, 3], loopFrom: 0 },
} satisfies Record<DrillerAnimState, DrillerAnimationSpec>

/** Resolve an atlas column from time elapsed since this state began. */
export function drillerAnimationFrameAt(state: DrillerAnimState, elapsedMs: number): number {
  const spec = DRILLER_ANIMATION_SPECS[state]
  const sequenceStep = Math.max(0, Math.floor(elapsedMs / spec.frameMs))
  if ('loopFrom' in spec && sequenceStep >= spec.sequence.length) {
    const loopLength = spec.sequence.length - spec.loopFrom
    return spec.sequence[spec.loopFrom + ((sequenceStep - spec.loopFrom) % loopLength)]!
  }
  return spec.sequence[Math.min(sequenceStep, spec.sequence.length - 1)]!
}

export function drillerFrame(
  row: number,
  column: number,
  name: string,
  pivot: [number, number] = DRILLER_FOOT_ANCHOR
): SpriteFrame {
  return {
    name,
    x: column / DRILLER_ATLAS_COLUMNS,
    y: 1 - (row + 1) / DRILLER_ATLAS_ROWS,
    width: 1 / DRILLER_ATLAS_COLUMNS,
    height: 1 / DRILLER_ATLAS_ROWS,
    sourceWidth: DRILLER_FRAME_SIZE,
    sourceHeight: DRILLER_FRAME_SIZE,
    pivot: { x: pivot[0], y: pivot[1] },
  }
}
