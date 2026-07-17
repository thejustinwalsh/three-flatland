import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import gemAtlasManifest from '../src/assets/driller/gem-pickups-atlas.json'
import actionAtlasManifest from '../src/assets/driller/action-icons.json'
import worldAtlasManifest from '../src/assets/driller/world-tiles.json'
import worldArtManifest from '../src/assets/driller/world-art.json'
import { AUTOTILE_FRAME_COUNT, autotileFrameIndex } from '../src/lib/autotile'
import { GEM_RENDER_SIZE_PX, gemFrame, gemRenderScale } from '../src/lib/gem-frames'
import { RENDER_LAYERS } from '../src/lib/render-layers'
import type { GemColor, GemSize } from '../src/traits'

const TILE_SIZE = 16
const TILE_PADDING = 2
const TILE_SLOT_SIZE = 20
const ATLAS_COLUMNS = 47
const FIXTURE_COLUMNS = 16
const FIXTURE_ROW = 10
const CHARACTER_CELL_SIZE = 68
const CHARACTER_PADDING = 2
const CHARACTER_FRAME_COUNTS = [4, 6, 5, 5, 4, 4, 5, 4, 5, 4] as const
const worldTiles = fileURLToPath(new URL('../src/assets/driller/world-tiles.png', import.meta.url))
const characterAtlas = fileURLToPath(
  new URL('../src/assets/driller/driller-animations.png', import.meta.url)
)
const actionAtlas = fileURLToPath(
  new URL('../src/assets/driller/action-icons.png', import.meta.url)
)
const titleBillboard = fileURLToPath(
  new URL('../src/assets/driller/title-attract.png', import.meta.url)
)
const webtylerMiniInputs = worldAtlasManifest.autotile.miniInputs.map((path) =>
  fileURLToPath(new URL(`../${path}`, import.meta.url))
)

describe('world tile atlas', () => {
  it('renders the smallest gem at a readable pickup size', () => {
    expect(gemAtlasManifest.renderedSizes).toEqual(Object.values(GEM_RENDER_SIZE_PX))
    expect(gemAtlasManifest.frames).toBe('tight-alpha-bounds')
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
    expect(RENDER_LAYERS.terrain).toBeLessThan(RENDER_LAYERS.fixtureDecor)
    expect(RENDER_LAYERS.fixtureDecor).toBeLessThan(RENDER_LAYERS.fallingTerrain)
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
      const interiorColumn = autotileFrameIndex(15, 0)
      expect(countTransparentPixels(data, info.width, interiorColumn, row), `row ${row}`).toBe(0)
    }
  })

  it('packs all 47 valid topologies with transparent bleed padding', async () => {
    expect(worldAtlasManifest.columns).toBe(ATLAS_COLUMNS)
    expect(worldAtlasManifest.padding).toBe(TILE_PADDING)
    expect(worldAtlasManifest.slotSize).toBe(TILE_SLOT_SIZE)
    expect(worldAtlasManifest.autotile.frameCount).toBe(AUTOTILE_FRAME_COUNT)
    expect(worldAtlasManifest.autotile.frames).toHaveLength(AUTOTILE_FRAME_COUNT)

    const { data, info } = await sharp(worldTiles)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
    for (let row = 0; row <= FIXTURE_ROW; row++) {
      for (let column = 0; column < ATLAS_COLUMNS; column++) {
        expect(countOpaqueSlotPadding(data, info.width, column, row), `${column}:${row}`).toBe(0)
      }
    }
  })

  it('keeps five concept-derived Webtyler minitiles for every biome layer', async () => {
    expect(worldAtlasManifest.autotile.generator).toBe('wareya/webtyler:minitiles')
    expect(webtylerMiniInputs).toHaveLength(10)

    for (const miniInput of webtylerMiniInputs) {
      const { data, info } = await sharp(miniInput)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true })
      expect(info.width, miniInput).toBe(TILE_SIZE * 5)
      expect(info.height, miniInput).toBe(TILE_SIZE)
      for (let role = 0; role < 5; role++) {
        expect(
          countOpaqueRegion(data, info.width, role * TILE_SIZE, 0),
          `${miniInput}:${role}`
        ).toBeGreaterThan(24)
      }
    }
  })

  it('maps every generated frame to the requested edge and corner topology', async () => {
    const { data, info } = await sharp(worldTiles)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })

    for (const [column, frame] of worldAtlasManifest.autotile.frames.entries()) {
      for (const [bit, side] of [
        [1, 'top'],
        [2, 'bottom'],
        [4, 'right'],
        [8, 'left'],
      ] as const) {
        const alpha = readEdgeAlpha(data, info.width, column, 0, side).slice(2, 14)
        if ((frame.cardinalMask & bit) !== 0) {
          expect(
            alpha.every((value) => value === 255),
            `${column}:${side}:connected`
          ).toBe(true)
        } else {
          expect(
            alpha.some((value) => value === 0),
            `${column}:${side}:exposed`
          ).toBe(true)
        }
      }

      for (const [bit, eligibleCardinals, x, y] of [
        [1, 9, 0, 0],
        [2, 5, 15, 0],
        [4, 10, 0, 15],
        [8, 6, 15, 15],
      ] as const) {
        if ((frame.cardinalMask & eligibleCardinals) !== eligibleCardinals) continue
        const expected = (frame.missingCornerMask & bit) !== 0 ? 0 : 255
        expect(readSlotAlpha(data, info.width, column, 0, x, y), `${column}:corner-${bit}`).toBe(
          expected
        )
      }
    }
  })

  it('packs authored fixture art as a transparent overlay over the runtime stone anchor', async () => {
    expect(worldAtlasManifest.fixtures.renderMode).toBe('biome-stone-base-with-decoration-overlay')
    const { data, info } = await sharp(worldTiles)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })

    for (let column = 0; column < FIXTURE_COLUMNS; column++) {
      const transparent = countTransparentPixels(data, info.width, column, FIXTURE_ROW)
      expect(transparent, `column ${column}`).toBeGreaterThan(0)
      expect(transparent, `column ${column}`).toBeLessThan(TILE_SIZE * TILE_SIZE)
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

  it('packs all five pixel-fixed action badges without text on the UI atlas', async () => {
    expect(actionAtlasManifest.columns).toEqual([
      'add-support',
      'boost-drill',
      'shield',
      'drop-rocks',
      'chaos-quake',
    ])
    expect(actionAtlasManifest.padding).toBe(TILE_PADDING)
    const { data, info } = await sharp(actionAtlas)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
    for (let column = 0; column < actionAtlasManifest.columns.length; column++) {
      expect(countOpaqueSlotPadding(data, info.width, column, 0)).toBe(0)
      expect(countOpaqueContentPixels(data, info.width, column, 0)).toBeGreaterThan(20)
    }
  })

  it('keeps the complete title billboard with transparent outer edges', async () => {
    expect(worldArtManifest.collections['title-attract'].width).toBe(138)
    expect(worldArtManifest.collections['title-attract'].height).toBe(36)
    const { data, info } = await sharp(titleBillboard)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
    expect(data[3]).toBe(0)
    expect(data[(info.width - 1) * 4 + 3]).toBe(0)
    expect(countOpaquePixels(data)).toBeGreaterThan(1_000)
  })
})

function countTransparentPixels(
  data: Buffer,
  atlasWidth: number,
  column: number,
  row: number
): number {
  let transparent = 0
  const left = column * TILE_SLOT_SIZE + TILE_PADDING
  const top = row * TILE_SLOT_SIZE + TILE_PADDING
  for (let y = top; y < top + TILE_SIZE; y++) {
    for (let x = left; x < left + TILE_SIZE; x++) {
      if (data[(y * atlasWidth + x) * 4 + 3] !== 255) transparent++
    }
  }
  return transparent
}

function countOpaqueSlotPadding(data: Buffer, atlasWidth: number, column: number, row: number) {
  let opaque = 0
  const left = column * TILE_SLOT_SIZE
  const top = row * TILE_SLOT_SIZE
  for (let y = 0; y < TILE_SLOT_SIZE; y++) {
    for (let x = 0; x < TILE_SLOT_SIZE; x++) {
      const isPadding =
        x < TILE_PADDING ||
        x >= TILE_SLOT_SIZE - TILE_PADDING ||
        y < TILE_PADDING ||
        y >= TILE_SLOT_SIZE - TILE_PADDING
      if (isPadding && data[((top + y) * atlasWidth + left + x) * 4 + 3] !== 0) opaque++
    }
  }
  return opaque
}

function countOpaqueContentPixels(data: Buffer, atlasWidth: number, column: number, row: number) {
  return TILE_SIZE * TILE_SIZE - countTransparentPixels(data, atlasWidth, column, row)
}

function countOpaquePixels(data: Buffer) {
  let count = 0
  for (let offset = 3; offset < data.length; offset += 4) if (data[offset] !== 0) count++
  return count
}

function countOpaqueRegion(data: Buffer, imageWidth: number, left: number, top: number) {
  let count = 0
  for (let y = top; y < top + TILE_SIZE; y++) {
    for (let x = left; x < left + TILE_SIZE; x++) {
      if (data[(y * imageWidth + x) * 4 + 3] !== 0) count++
    }
  }
  return count
}

function readEdgeAlpha(
  data: Buffer,
  atlasWidth: number,
  column: number,
  row: number,
  edge: 'left' | 'right' | 'top' | 'bottom'
) {
  const left = column * TILE_SLOT_SIZE + TILE_PADDING
  const top = row * TILE_SLOT_SIZE + TILE_PADDING
  const pixels: number[] = []
  for (let index = 0; index < TILE_SIZE; index++) {
    const x = edge === 'left' ? left : edge === 'right' ? left + TILE_SIZE - 1 : left + index
    const y = edge === 'top' ? top : edge === 'bottom' ? top + TILE_SIZE - 1 : top + index
    pixels.push(data[(y * atlasWidth + x) * 4 + 3]!)
  }
  return pixels
}

function readSlotAlpha(
  data: Buffer,
  atlasWidth: number,
  column: number,
  row: number,
  x: number,
  y: number
) {
  const atlasX = column * TILE_SLOT_SIZE + TILE_PADDING + x
  const atlasY = row * TILE_SLOT_SIZE + TILE_PADDING + y
  return data[(atlasY * atlasWidth + atlasX) * 4 + 3]!
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
