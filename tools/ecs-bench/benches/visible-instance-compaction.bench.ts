import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { bench, group as benchGroup } from '@pmndrs/labs'
import { Sprite2DMaterial } from '../../../packages/three-flatland/src/materials/Sprite2DMaterial.ts'
import { SpriteGroup } from '../../../packages/three-flatland/src/pipeline/SpriteGroup.ts'
import type { SpriteBatch } from '../../../packages/three-flatland/src/pipeline/SpriteBatch.ts'
import { Sprite2D } from '../../../packages/three-flatland/src/sprites/Sprite2D.ts'
import type { Sprite2DOptions } from '../../../packages/three-flatland/src/sprites/types.ts'

if (
  process.env['NODE_ENV'] !== 'production' ||
  process.env['FL_PROFILE'] === 'true' ||
  process.env['FL_DEVTOOLS'] === 'true'
) {
  throw new Error('Visibility Labs benchmarks require NODE_ENV=production with FL_PROFILE and FL_DEVTOOLS disabled')
}

type TextureType = NonNullable<Sprite2DOptions['texture']>
type Occupancy = 1 | 0.2 | 0.05
type Motion = 'static' | 'camera-pan' | 'ten-percent-moving'

interface Context {
  batches: SpriteBatch[]
  camera: CameraFixture
  group: SpriteGroup
  material: Sprite2DMaterial
  renderer: object
  scene: object
  sprites: Sprite2D[]
  texture: TextureType
  tick: number
}

interface CameraFixture {
  bottom: number
  left: number
  position: { x: number; y: number; set(x: number, y: number, z: number): void }
  right: number
  top: number
  updateMatrixWorld(force?: boolean): void
  updateProjectionMatrix(): void
}

interface IndexProjection {
  batch: SpriteBatch
  visibleSlots: Uint32Array
}

const ROOT = resolve(import.meta.dirname, '../../..')
const { OrthographicCamera, Scene, Texture } = createRequire(resolve(ROOT, 'packages/three-flatland/package.json'))(
  'three'
) as {
  OrthographicCamera: new (
    left?: number,
    right?: number,
    top?: number,
    bottom?: number,
    near?: number,
    far?: number
  ) => CameraFixture
  Scene: new () => object
  Texture: new () => TextureType
}

function collectBatches(group: SpriteGroup): SpriteBatch[] {
  const batches: SpriteBatch[] = []
  for (const run of group.batches.values()) batches.push(...run)
  return batches
}

class VisibleIndexPrototype {
  private readonly _batches: IndexProjection[]
  private _lastCount = 0
  private _lastChecksum = 0

  constructor(batches: readonly SpriteBatch[]) {
    this._batches = batches.map((batch) => ({
      batch,
      visibleSlots: new Uint32Array(batch.maxSize),
    }))
  }

  project(camera: CameraFixture): number {
    const minX = camera.position.x + camera.left
    const maxX = camera.position.x + camera.right
    const minY = camera.position.y + camera.bottom
    const maxY = camera.position.y + camera.top
    let checksum = 0
    let total = 0

    for (const projection of this._batches) {
      let row = 0
      for (const sprite of projection.batch.grid.querySegment(minX, minY, maxX, maxY)) {
        const x = sprite.position.x
        const y = sprite.position.y
        if (!sprite.visible || x < minX || x > maxX || y < minY || y > maxY) continue
        const slot = sprite._batchSlot
        if (slot < 0 || sprite._batchMesh !== projection.batch) continue
        projection.visibleSlots[row++] = slot
        checksum = ((checksum << 5) - checksum + slot) | 0
      }
      total += row
    }
    this._lastCount = total
    this._lastChecksum = checksum
    return total ^ checksum
  }

  assertPublished(): void {
    if (this._lastCount === 0 || !Number.isInteger(this._lastChecksum)) {
      throw new Error('Visible index projection was not published')
    }
  }
}

function createContext(count: number, occupancy: Occupancy): Context {
  const texture = new Texture()
  texture.image = { width: 16, height: 16 }
  const material = new Sprite2DMaterial({ alphaTest: 0.5, map: texture })
  const group = new SpriteGroup({ expectedSprites: count })
  const columns = 256
  const rows = Math.ceil(count / columns)
  const sprites = Array.from({ length: count }, (_, index) => {
    const sprite = new Sprite2D({ material, texture })
    sprite.position.set(index % columns, Math.floor(index / columns), 0)
    return sprite
  })

  for (let start = 0; start < sprites.length; start += 1024) {
    group.add(...sprites.slice(start, start + 1024))
  }
  group.update()

  const visibleWidth = columns * Math.sqrt(occupancy)
  const visibleHeight = rows * Math.sqrt(occupancy)
  const camera = new OrthographicCamera(0, visibleWidth, visibleHeight, 0, -10, 10)
  camera.position.set(0, 0, 1)
  camera.updateProjectionMatrix()
  camera.updateMatrixWorld(true)

  const scene = new Scene()
  const batches = collectBatches(group)
  if (batches.length === 0) throw new Error(`visibility fixture created no batches at ${count}`)

  return {
    batches,
    camera,
    group,
    material,
    renderer: {},
    scene,
    sprites,
    texture,
    tick: 0,
  }
}

function mutate(context: Context, motion: Motion): void {
  const tick = ++context.tick
  if (motion === 'camera-pan') {
    context.camera.position.x = (tick & 1) === 0 ? 0 : 24
    context.camera.position.y = (tick & 2) === 0 ? 0 : 12
    context.camera.updateMatrixWorld(true)
    return
  }
  if (motion !== 'ten-percent-moving') return

  const moving = Math.floor(context.sprites.length / 10)
  for (let index = 0; index < moving; index++) {
    const sprite = context.sprites[index]!
    sprite.position.x += (index & 1) === 0 ? 0.25 : -0.25
    sprite.position.y += (index & 2) === 0 ? 0.125 : -0.125
  }
}

function renderBoundary(context: Context): number {
  context.group.update()
  let submitted = 0
  for (const batch of context.batches) {
    batch.onBeforeRender(
      context.renderer as never,
      context.scene as never,
      context.camera as never,
      batch.geometry,
      batch.material as never,
      context.group as never
    )
    submitted += batch.count
  }
  return submitted
}

function register(name: string, count: number, occupancy: Occupancy, motion: Motion, indexed: boolean): void {
  bench(`${name} / ${indexed ? 'visible-index prototype' : 'authoritative rows'}`, function* () {
    const context = createContext(count, occupancy)
    const projection = indexed ? new VisibleIndexPrototype(context.batches) : null
    mutate(context, motion)

    try {
      yield {
        bench: () => {
          const submitted = renderBoundary(context)
          return projection?.project(context.camera) ?? submitted
        },
        after: () => mutate(context, motion),
      }

      projection?.assertPublished()
      if (context.group.spriteCount !== count) {
        throw new Error(`visibility fixture lost sprites for ${name}`)
      }
    } finally {
      context.group.dispose()
      context.material.dispose()
      context.texture.dispose()
    }
  }).gc('inner')
}

function registerPair(name: string, count: number, occupancy: Occupancy, motion: Motion): void {
  register(name, count, occupancy, motion, false)
  register(name, count, occupancy, motion, true)
}

benchGroup('SpriteGroup camera-visible projection @visible-instance-compaction', () => {
  registerPair('dense static 16,384 @smoke', 16_384, 1, 'static')
  registerPair('20% camera pan 16,384', 16_384, 0.2, 'camera-pan')
  registerPair('5% camera pan 16,384', 16_384, 0.05, 'camera-pan')
  registerPair('dense static 60,000 @scale', 60_000, 1, 'static')
  registerPair('20% occupancy with 10% movement 60,000 @scale', 60_000, 0.2, 'ten-percent-moving')
  registerPair('5% occupancy with 10% movement 60,000 @scale', 60_000, 0.05, 'ten-percent-moving')
})
