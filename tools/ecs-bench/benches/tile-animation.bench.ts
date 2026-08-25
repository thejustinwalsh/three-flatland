import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { bench, group } from '@pmndrs/labs'
import { TileLayer } from '../../../packages/three-flatland/src/tilemap/TileLayer.ts'
import { Tileset } from '../../../packages/three-flatland/src/tilemap/Tileset.ts'
import type { TileDefinition, TileLayerData } from '../../../packages/three-flatland/src/tilemap/types.ts'

if (
  process.env['NODE_ENV'] !== 'production' ||
  process.env['FL_PROFILE'] === 'true' ||
  process.env['FL_DEVTOOLS'] === 'true'
) {
  throw new Error('Tile-animation Labs benchmarks require production mode without profiling or devtools')
}

interface Context {
  layer: TileLayer
  tileset: Tileset
  expectedFrame: number
}

const ROOT = resolve(import.meta.dirname, '../../..')
const { Texture } = createRequire(resolve(ROOT, 'packages/three-flatland/package.json'))('three') as {
  Texture: new () => { image?: { width: number; height: number }; dispose(): void }
}
const FRAME_DURATION_MS = 16
const ANIMATION_COUNT = 16

function dimensions(count: number): readonly [width: number, height: number] {
  if (count === 1_000) return [40, 25]
  if (count === 16_384) return [128, 128]
  if (count === 60_000) return [300, 200]
  throw new Error(`Unsupported tile-animation benchmark count: ${count}`)
}

function createContext(count: number): Context {
  const [width, height] = dimensions(count)
  const texture = new Texture()
  texture.image = { width: 128, height: 128 }
  const frames = Array.from({ length: 4 }, (_, frameIndex) => ({
    tileId: 16 + frameIndex,
    duration: FRAME_DURATION_MS,
  }))
  const tiles = new Map<number, TileDefinition>()
  for (let localId = 0; localId < ANIMATION_COUNT; localId++) {
    tiles.set(localId, {
      id: localId,
      uv: { x: (localId % 8) / 8, y: Math.floor(localId / 8) / 8, width: 1 / 8, height: 1 / 8 },
      animation: frames,
    })
  }
  const tileset = new Tileset({
    name: 'tile-animation-benchmark',
    firstGid: 1,
    tileWidth: 16,
    tileHeight: 16,
    imageWidth: 128,
    imageHeight: 128,
    columns: 8,
    tileCount: 64,
    tiles,
    texture: texture as never,
  })
  const data = new Uint32Array(count)
  for (let index = 0; index < count; index++) data[index] = 1 + (index % ANIMATION_COUNT)
  const layerData: TileLayerData = {
    name: 'animated',
    id: 1,
    width,
    height,
    data,
  }
  const layer = new TileLayer(layerData, tileset, 16, 16, 64)
  return { layer, tileset, expectedFrame: 0 }
}

function advance(context: Context): void {
  context.layer.update(FRAME_DURATION_MS)
  context.expectedFrame = (context.expectedFrame + 1) & 3
}

function assertProjection(context: Context): void {
  const chunks = Reflect.get(context.layer, 'chunks') as Map<string, { instanceData: Float32Array }>
  const firstChunk = chunks.values().next().value as { instanceData: Float32Array } | undefined
  if (!firstChunk) throw new Error('Tile-animation fixture did not build a chunk')
  const expectedX = ((16 + context.expectedFrame) % 8) / 8
  if (Math.abs(firstChunk.instanceData[0]! - expectedX) > Number.EPSILON) {
    throw new Error('Tile-animation fixture did not publish the expected UV frame')
  }
}

function register(count: number, tags = ''): void {
  bench(`animated tiles ${count.toLocaleString()} ${tags}`.trim(), function* () {
    const context = createContext(count)
    try {
      yield { bench: () => advance(context) }
      assertProjection(context)
    } finally {
      context.layer.dispose()
      context.tileset.dispose()
    }
  }).gc('inner')
}

group('TileLayer production animation @tile-animation', () => {
  register(1_000, '@tile-animation-smoke')
  register(16_384)
  register(60_000, '@scale')
})
