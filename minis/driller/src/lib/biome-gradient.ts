import { DataTexture, LinearFilter, RGBAFormat, RepeatWrapping } from 'three'
import { BIOMES, WORLD_BODY_ROWS, WORLD_LENGTH_ROWS, WORLD_VOID_ROWS } from '../biomes'

/**
 * Width of the void-band transition zone, in rows, at each end of
 * the void. The void is otherwise pure black — only the top
 * `VOID_TRANSITION_ROWS` rows fade biome-end-color → black, and the
 * bottom `VOID_TRANSITION_ROWS` rows fade black → next biome's
 * start color. 8 rows ≈ 15% of the 55-row void band; the player
 * spends most of free-fall in pure black with quick fade-outs at
 * each boundary.
 */
const VOID_TRANSITION_ROWS = 8

function parseHex(hex: string): [number, number, number] {
  const m = hex.replace(/^#/, '')
  return [
    parseInt(m.slice(0, 2), 16) / 255,
    parseInt(m.slice(2, 4), 16) / 255,
    parseInt(m.slice(4, 6), 16) / 255,
  ]
}

function lerp3(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  t: number,
): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

/**
 * Compute the bg color at a given world row. Cycles through biomes
 * every `WORLD_LENGTH_ROWS` rows. Within each cycle:
 *
 *   - rows 0 .. WORLD_BODY_ROWS-1: biome body. Color fades from the
 *     biome's `bgGradient[0]` (start, top) to `bgGradient[1]` (end,
 *     bottom) across the body's length.
 *   - rows WORLD_BODY_ROWS .. WORLD_LENGTH_ROWS-1: void band. Mostly
 *     pure black, with quick fades end-color → black at the top and
 *     black → next-biome-start at the bottom (each
 *     `VOID_TRANSITION_ROWS` thick).
 */
export function bgColorAtRow(worldRow: number): [number, number, number] {
  const cycleLen = WORLD_LENGTH_ROWS
  const worldIdx = Math.floor(worldRow / cycleLen) % BIOMES.length
  const rowInWorld = ((worldRow % cycleLen) + cycleLen) % cycleLen
  const biome = BIOMES[worldIdx]!
  const startColor = parseHex(biome.bgGradient[0])
  const endColor = parseHex(biome.bgGradient[1])

  if (rowInWorld < WORLD_BODY_ROWS) {
    const t = WORLD_BODY_ROWS <= 1 ? 0 : rowInWorld / (WORLD_BODY_ROWS - 1)
    return lerp3(startColor, endColor, t)
  }
  // Void band
  const voidRow = rowInWorld - WORLD_BODY_ROWS
  const black: readonly [number, number, number] = [0, 0, 0]
  if (voidRow < VOID_TRANSITION_ROWS) {
    // end → black (entering void)
    const t = voidRow / VOID_TRANSITION_ROWS
    return lerp3(endColor, black, t)
  }
  if (voidRow >= WORLD_VOID_ROWS - VOID_TRANSITION_ROWS) {
    // black → next start (leaving void)
    const nextIdx = (worldIdx + 1) % BIOMES.length
    const nextStart = parseHex(BIOMES[nextIdx]!.bgGradient[0])
    const t = (voidRow - (WORLD_VOID_ROWS - VOID_TRANSITION_ROWS)) / VOID_TRANSITION_ROWS
    return lerp3(black, nextStart, t)
  }
  return [0, 0, 0]
}

/**
 * Build a 1×N DataTexture containing the biome-gradient color for
 * each world row across all biomes (one full cycle). Sampling this
 * texture by `worldRow / totalRows` (with RepeatWrapping) gives the
 * correct color for any depth.
 *
 * Texture height = WORLD_LENGTH_ROWS * BIOMES.length (e.g., 205 × 5
 * = 1025 rows). One Uint8Array RGBA per row.
 */
export function buildBiomeGradientTexture(): { texture: DataTexture; totalRows: number } {
  const totalRows = WORLD_LENGTH_ROWS * BIOMES.length
  const data = new Uint8Array(totalRows * 4)
  for (let r = 0; r < totalRows; r++) {
    const c = bgColorAtRow(r)
    data[r * 4 + 0] = Math.round(c[0] * 255)
    data[r * 4 + 1] = Math.round(c[1] * 255)
    data[r * 4 + 2] = Math.round(c[2] * 255)
    data[r * 4 + 3] = 255
  }
  const texture = new DataTexture(data, 1, totalRows, RGBAFormat)
  texture.minFilter = LinearFilter
  texture.magFilter = LinearFilter
  texture.wrapT = RepeatWrapping
  texture.generateMipmaps = false
  texture.needsUpdate = true
  return { texture, totalRows }
}
