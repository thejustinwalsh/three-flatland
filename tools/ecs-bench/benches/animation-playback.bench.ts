import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { bench, group } from '@pmndrs/labs'
import { Sprite2DMaterial } from '../../../packages/three-flatland/src/materials/Sprite2DMaterial.ts'
import { SpriteGroup } from '../../../packages/three-flatland/src/pipeline/SpriteGroup.ts'
import { AnimatedSprite2D } from '../../../packages/three-flatland/src/sprites/AnimatedSprite2D.ts'
import type { Animation } from '../../../packages/three-flatland/src/animation/types.ts'
import type { SpriteFrame, SpriteSheet } from '../../../packages/three-flatland/src/sprites/types.ts'

if (
  process.env['NODE_ENV'] !== 'production' ||
  process.env['FL_PROFILE'] === 'true' ||
  process.env['FL_DEVTOOLS'] === 'true'
) {
  throw new Error('Animation Labs benchmarks require NODE_ENV=production with FL_PROFILE and FL_DEVTOOLS disabled')
}

type TextureType = SpriteSheet['texture']

interface Context {
  group: SpriteGroup
  material: Sprite2DMaterial
  sprites: AnimatedSprite2D[]
  texture: TextureType
  expectedFrame: number
}

const ROOT = resolve(import.meta.dirname, '../../..')
const { Texture } = createRequire(resolve(ROOT, 'packages/three-flatland/package.json'))('three') as {
  Texture: new () => TextureType
}
const DELTA_MS = 1000 / 60

function makeFrame(name: string, index: number): SpriteFrame {
  return {
    name,
    x: index * 0.25,
    y: 0,
    width: 0.25,
    height: 1,
    sourceWidth: 16,
    sourceHeight: 16,
  }
}

function createContext(count: number): Context {
  const texture = new Texture()
  texture.image = { width: 64, height: 16 }
  const material = new Sprite2DMaterial({ map: texture })
  const spriteGroup = new SpriteGroup({ expectedSprites: count })
  const frames = Array.from({ length: 4 }, (_, index) => makeFrame(`walk-${index}`, index))
  const sheet: SpriteSheet = {
    texture,
    frames: new Map(frames.map((frame) => [frame.name, frame])),
    width: 64,
    height: 16,
    getFrame(name) {
      const frame = this.frames.get(name)
      if (!frame) throw new Error(`Missing benchmark frame: ${name}`)
      return frame
    },
    getFrameNames() {
      return Array.from(this.frames.keys())
    },
  }
  const walk: Animation = {
    name: 'walk',
    frames: frames.map((frame) => ({ frame })),
    fps: 60,
    loop: true,
  }
  const sprites = Array.from(
    { length: count },
    () => new AnimatedSprite2D({ spriteSheet: sheet, material, animations: [walk], animation: 'walk' })
  )
  for (let start = 0; start < sprites.length; start += 1024) {
    spriteGroup.add(...sprites.slice(start, start + 1024))
  }
  spriteGroup.update()
  if (spriteGroup.spriteCount !== count) throw new Error('Animation fixture did not enroll every sprite')
  return { group: spriteGroup, material, sprites, texture, expectedFrame: 0 }
}

function advance(context: Context): void {
  context.group.advanceAnimations(DELTA_MS)
  context.expectedFrame = (context.expectedFrame + 1) & 3
}

function assertPlayback(context: Context): void {
  const first = context.sprites[0]
  const last = context.sprites.at(-1)
  if (!first || !last) throw new Error('Animation fixture has no sprites')
  if (first.controller.getState().frameIndex !== context.expectedFrame) {
    throw new Error('First animated sprite did not advance deterministically')
  }
  if (last.controller.getState().frameIndex !== context.expectedFrame) {
    throw new Error('Last animated sprite did not advance deterministically')
  }
}

function register(count: number, tags = ''): void {
  bench(`group playback ${count.toLocaleString()} ${tags}`.trim(), function* () {
    const context = createContext(count)
    try {
      yield {
        bench: () => advance(context),
      }
      assertPlayback(context)
    } finally {
      context.group.dispose()
      for (const sprite of context.sprites) sprite.dispose()
      context.material.dispose()
      context.texture.dispose()
    }
  }).gc('inner')
}

group('AnimatedSprite2D production playback @animation-playback', () => {
  register(1_000, '@animation-smoke')
  register(16_384)
  register(60_000, '@scale')
})
