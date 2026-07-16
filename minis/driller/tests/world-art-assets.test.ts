import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { GEM_RENDER_SIZE_PX, gemFrame, gemRenderScale } from '../src/lib/gem-frames'
import { RENDER_LAYERS } from '../src/lib/render-layers'
import type { GemColor, GemSize } from '../src/traits'

const TILE_SIZE = 16
const ATLAS_COLUMNS = 16
const FIXTURE_ROW = 10
const CHARACTER_CELL_SIZE = 68
const CHARACTER_PADDING = 2
const CHARACTER_FRAME_COUNTS = [4, 6, 5, 5, 4, 4, 5, 4, 5, 4] as const
const worldTiles = fileURLToPath(new URL('../src/assets/driller/world-tiles.png', import.meta.url))
const characterAtlas = fileURLToPath(
  new URL('../src/assets/driller/driller-animations.png', import.meta.url)
)

describe('world tile atlas', () => {
  it('renders the smallest gem at a readable pickup size', () => {
    expect(GEM_RENDER_SIZE_PX.small).toBeGreaterThanOrEqual(8)
    expect(GEM_RENDER_SIZE_PX.medium).toBeGreaterThan(GEM_RENDER_SIZE_PX.small)

    const colors: GemColor[] = ['emerald', 'topaz', 'ruby', 'amethyst']
    const sizes: GemSize[] = ['small', 'medium', 'large', 'huge']
    for (const color of colors) {
      for (const size of sizes) {
        const frame = gemFrame(color, size)
        const scale = gemRenderScale(color, size)
        expect(Math.max(scale[0], scale[1])).toBe(GEM_RENDER_SIZE_PX[size])
        expect(frame.sourceWidth).toBeLessThan(24)
        expect(frame.sourceHeight).toBeLessThan(24)
      }
    }
  })

  it('draws pickups above every terrain batch', () => {
    expect(RENDER_LAYERS.terrain).toBeLessThan(RENDER_LAYERS.fallingTerrain)
    expect(RENDER_LAYERS.fallingTerrain).toBeLessThan(RENDER_LAYERS.pickups)
    expect(RENDER_LAYERS.pickups).toBeLessThan(RENDER_LAYERS.actors)
    expect(RENDER_LAYERS.actors).toBeLessThan(RENDER_LAYERS.effects)
    expect(RENDER_LAYERS.effects).toBeLessThan(RENDER_LAYERS.interaction)
    expect(RENDER_LAYERS.interaction).toBeLessThan(RENDER_LAYERS.uiBackground)
    expect(RENDER_LAYERS.uiBackground).toBeLessThan(RENDER_LAYERS.ui)
  })

  it('keeps every biome interior tile fully opaque', async () => {
    const { data, info } = await sharp(worldTiles)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })

    for (let row = 0; row < FIXTURE_ROW; row++) {
      expect(countTransparentPixels(data, info.width, ATLAS_COLUMNS - 1, row), `row ${row}`).toBe(0)
    }
  })

  it('composites every fixture over an opaque stone backing', async () => {
    const { data, info } = await sharp(worldTiles)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })

    for (let column = 0; column < ATLAS_COLUMNS; column++) {
      expect(
        countTransparentPixels(data, info.width, column, FIXTURE_ROW),
        `column ${column}`
      ).toBe(0)
    }
  })

  it('keeps transparent padding around every character animation frame', async () => {
    const { data, info } = await sharp(characterAtlas)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })

    for (const [row, frameCount] of CHARACTER_FRAME_COUNTS.entries()) {
      for (let column = 0; column < frameCount; column++) {
        expect(countOpaquePaddingPixels(data, info.width, column, row), `${row}:${column}`).toBe(0)
      }
    }
  })

  it('preserves the complete final ghost head', async () => {
    const { data, info } = await sharp(characterAtlas)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
    const bounds = opaqueBounds(data, info.width, 3, 9)

    expect(bounds.top).toBeLessThanOrEqual(12)
    expect(bounds.bottom - bounds.top + 1).toBeGreaterThanOrEqual(30)
    expect(bounds.right - bounds.left + 1).toBeGreaterThanOrEqual(18)
  })
})

function countTransparentPixels(
  data: Buffer,
  atlasWidth: number,
  column: number,
  row: number
): number {
  let transparent = 0
  const left = column * TILE_SIZE
  const top = row * TILE_SIZE
  for (let y = top; y < top + TILE_SIZE; y++) {
    for (let x = left; x < left + TILE_SIZE; x++) {
      if (data[(y * atlasWidth + x) * 4 + 3] !== 255) transparent++
    }
  }
  return transparent
}

function countOpaquePaddingPixels(
  data: Buffer,
  atlasWidth: number,
  column: number,
  row: number
): number {
  let opaque = 0
  const left = column * CHARACTER_CELL_SIZE
  const top = row * CHARACTER_CELL_SIZE
  for (let y = 0; y < CHARACTER_CELL_SIZE; y++) {
    for (let x = 0; x < CHARACTER_CELL_SIZE; x++) {
      const inPadding =
        x < CHARACTER_PADDING ||
        x >= CHARACTER_CELL_SIZE - CHARACTER_PADDING ||
        y < CHARACTER_PADDING ||
        y >= CHARACTER_CELL_SIZE - CHARACTER_PADDING
      if (inPadding && data[((top + y) * atlasWidth + left + x) * 4 + 3] !== 0) opaque++
    }
  }
  return opaque
}

function opaqueBounds(data: Buffer, atlasWidth: number, column: number, row: number) {
  let left = CHARACTER_CELL_SIZE
  let top = CHARACTER_CELL_SIZE
  let right = -1
  let bottom = -1
  const cellLeft = column * CHARACTER_CELL_SIZE
  const cellTop = row * CHARACTER_CELL_SIZE
  for (let y = 0; y < CHARACTER_CELL_SIZE; y++) {
    for (let x = 0; x < CHARACTER_CELL_SIZE; x++) {
      if (data[((cellTop + y) * atlasWidth + cellLeft + x) * 4 + 3] === 0) continue
      left = Math.min(left, x)
      top = Math.min(top, y)
      right = Math.max(right, x)
      bottom = Math.max(bottom, y)
    }
  }
  return { left, top, right, bottom }
}
