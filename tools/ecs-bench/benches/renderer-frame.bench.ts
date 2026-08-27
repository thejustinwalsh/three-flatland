import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { bench, group } from '@pmndrs/labs'
import { Sprite2DMaterial } from '../../../packages/three-flatland/src/materials/Sprite2DMaterial.ts'
import { SpriteGroup } from '../../../packages/three-flatland/src/pipeline/SpriteGroup.ts'
import { Sprite2D } from '../../../packages/three-flatland/src/sprites/Sprite2D.ts'
import type { Sprite2DOptions } from '../../../packages/three-flatland/src/sprites/types.ts'

if (
  process.env['NODE_ENV'] !== 'production' ||
  process.env['FL_PROFILE'] === 'true' ||
  process.env['FL_DEVTOOLS'] === 'true'
) {
  throw new Error('Renderer Labs benchmarks require NODE_ENV=production with FL_PROFILE and FL_DEVTOOLS disabled')
}

type TextureType = NonNullable<Sprite2DOptions['texture']>
type Scenario = 'static' | 'moving-alpha-depth' | 'transparent-sort' | 'routing-12000'

interface Context {
  group: SpriteGroup
  material: Sprite2DMaterial
  sprites: Sprite2D[]
  texture: TextureType
  tick: number
}

const ROOT = resolve(import.meta.dirname, '../../..')
const { Texture } = createRequire(resolve(ROOT, 'packages/three-flatland/package.json'))('three') as {
  Texture: new () => TextureType
}

function createContext(count: number, scenario: Scenario): Context {
  const texture = new Texture()
  texture.image = { width: 16, height: 16 }
  const material = new Sprite2DMaterial({
    ...(scenario === 'static' || scenario === 'moving-alpha-depth' ? { alphaTest: 0.5 } : {}),
    map: texture,
  })
  const group = new SpriteGroup()
  const sprites = Array.from({ length: count }, (_, index) => {
    const sprite = new Sprite2D({ material, texture, zIndex: index })
    sprite.position.set(index % 256, Math.floor(index / 256), 0)
    return sprite
  })

  for (let start = 0; start < sprites.length; start += 1024) {
    group.add(...sprites.slice(start, start + 1024))
  }
  group.update()
  assertTopology({ group, material, sprites, texture, tick: 0 }, scenario, count, 'initial')
  return { group, material, sprites, texture, tick: 0 }
}

function mutate(context: Context, scenario: Scenario): void {
  const tick = ++context.tick
  if (scenario === 'static') return

  if (scenario === 'routing-12000') {
    const changed = Math.min(12_000, context.sprites.length)
    for (let index = 0; index < changed; index++) {
      context.sprites[index]!.sortLayer = (index + tick) & 1
    }
    return
  }

  const sorted = scenario === 'transparent-sort'
  for (let index = 0; index < context.sprites.length; index++) {
    const sprite = context.sprites[index]!
    sprite.position.x += (index & 1) === 0 ? 0.25 : -0.25
    sprite.position.y += (index & 2) === 0 ? 0.125 : -0.125
    sprite.alpha = 0.5 + ((index + tick) % 50) / 100
    if (sorted) sprite.zIndex = (tick & 1) === 0 ? index : context.sprites.length - index
  }
}

function assertTopology(context: Context, scenario: Scenario, count: number, phase: 'initial' | 'final'): void {
  if (context.group.stats.spriteCount !== count || context.group.stats.visibleSprites !== count) {
    throw new Error(`${phase} topology mismatch for ${scenario} at ${count}`)
  }
}

function register(name: string, count: number, scenario: Scenario): void {
  bench(name, function* () {
    const context = createContext(count, scenario)
    mutate(context, scenario)

    try {
      yield {
        bench: () => context.group.update(),
        after: () => mutate(context, scenario),
      }

      assertTopology(context, scenario, count, 'final')
    } finally {
      context.group.dispose()
      context.material.dispose()
      context.texture.dispose()
    }
  }).gc('inner')
}

group('SpriteGroup production frame @renderer-frame', () => {
  register('static 16,384 @smoke', 16_384, 'static')
  register('moving alpha/depth 16,384', 16_384, 'moving-alpha-depth')
  register('transparent sort 16,384', 16_384, 'transparent-sort')
  register('routing 12,000 of 16,384', 16_384, 'routing-12000')
  register('static 60,000 @scale', 60_000, 'static')
  register('moving alpha/depth 60,000 @scale', 60_000, 'moving-alpha-depth')
})
