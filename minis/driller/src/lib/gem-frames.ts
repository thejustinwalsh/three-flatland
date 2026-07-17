import type { SpriteFrame } from 'three-flatland/react'
import type { GemColor, GemSize } from '../traits'

const ATLAS_SIZE = 96
const CELL_SIZE = 24

interface OpaqueBounds {
  left: number
  top: number
  width: number
  height: number
}

/** Tight alpha bounds measured from the production atlas cells. */
const OPAQUE_BOUNDS = {
  emerald: {
    small: { left: 10, top: 10, width: 4, height: 3 },
    medium: { left: 8, top: 8, width: 7, height: 6 },
    large: { left: 6, top: 4, width: 12, height: 12 },
    huge: { left: 5, top: 2, width: 14, height: 19 },
  },
  topaz: {
    small: { left: 10, top: 10, width: 4, height: 3 },
    medium: { left: 8, top: 8, width: 7, height: 6 },
    large: { left: 6, top: 5, width: 12, height: 11 },
    huge: { left: 5, top: 2, width: 14, height: 20 },
  },
  ruby: {
    small: { left: 10, top: 10, width: 4, height: 3 },
    medium: { left: 7, top: 8, width: 8, height: 7 },
    large: { left: 6, top: 5, width: 12, height: 13 },
    huge: { left: 5, top: 2, width: 15, height: 19 },
  },
  amethyst: {
    small: { left: 10, top: 11, width: 4, height: 3 },
    medium: { left: 7, top: 10, width: 8, height: 7 },
    large: { left: 6, top: 7, width: 12, height: 13 },
    huge: { left: 3, top: 2, width: 19, height: 20 },
  },
} as const satisfies Record<GemColor, Record<GemSize, OpaqueBounds>>

/** Longest visible axis, in world pixels, for each pickup tier. */
export const GEM_RENDER_SIZE_PX = {
  small: 8,
  medium: 11,
  large: 16,
  huge: 22,
} as const satisfies Record<GemSize, number>

function atlasFrame(color: GemColor, size: GemSize, row: number, column: number): SpriteFrame {
  const bounds = OPAQUE_BOUNDS[color][size]
  return {
    name: `gem-${color}-${size}`,
    x: (column * CELL_SIZE + bounds.left) / ATLAS_SIZE,
    y: 1 - (row * CELL_SIZE + bounds.top + bounds.height) / ATLAS_SIZE,
    width: bounds.width / ATLAS_SIZE,
    height: bounds.height / ATLAS_SIZE,
    sourceWidth: bounds.width,
    sourceHeight: bounds.height,
  }
}

function colorFrames(color: GemColor, row: number): Record<GemSize, SpriteFrame> {
  return {
    small: atlasFrame(color, 'small', row, 0),
    medium: atlasFrame(color, 'medium', row, 1),
    large: atlasFrame(color, 'large', row, 2),
    huge: atlasFrame(color, 'huge', row, 3),
  }
}

const FRAMES: Record<GemColor, Record<GemSize, SpriteFrame>> = {
  emerald: colorFrames('emerald', 0),
  topaz: colorFrames('topaz', 1),
  ruby: colorFrames('ruby', 2),
  amethyst: colorFrames('amethyst', 3),
}

export function gemFrame(color: GemColor, size: GemSize): SpriteFrame {
  return FRAMES[color][size]
}

/** Preserve each authored silhouette's aspect ratio at its readable tier size. */
export function gemRenderScale(color: GemColor, size: GemSize): [number, number, number] {
  const bounds = OPAQUE_BOUNDS[color][size]
  const longestSourceAxis = Math.max(bounds.width, bounds.height)
  const longestRenderedAxis = GEM_RENDER_SIZE_PX[size]
  return [
    (bounds.width / longestSourceAxis) * longestRenderedAxis,
    (bounds.height / longestSourceAxis) * longestRenderedAxis,
    1,
  ]
}
