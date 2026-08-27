import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { bench, group } from '@pmndrs/labs'
import { transformSyncSystem } from '../../../packages/three-flatland/src/ecs/systems/transformSyncSystem.ts'
import type { World } from '../../../packages/three-flatland/src/ecs/runtime/index.ts'
import { Sprite2DMaterial } from '../../../packages/three-flatland/src/materials/Sprite2DMaterial.ts'
import { SpriteGroup } from '../../../packages/three-flatland/src/pipeline/SpriteGroup.ts'
import { Sprite2D } from '../../../packages/three-flatland/src/sprites/Sprite2D.ts'
import type { Sprite2DOptions } from '../../../packages/three-flatland/src/sprites/types.ts'

if (
  process.env['NODE_ENV'] !== 'production' ||
  process.env['FL_PROFILE'] === 'true' ||
  process.env['FL_DEVTOOLS'] === 'true'
) {
  throw new Error('Hierarchy Labs benchmarks require NODE_ENV=production with FL_PROFILE and FL_DEVTOOLS disabled')
}

type TextureType = NonNullable<Sprite2DOptions['texture']>
// The workspace deliberately keeps Three as a peer of this private harness.
// Group's Object3D surface used below is a structural subset of SpriteGroup.
type GroupType = SpriteGroup
type Scenario = 'direct-static' | 'hierarchy-static' | 'hierarchy-root-motion' | 'hierarchy-leaf-motion'

interface Context {
  group: SpriteGroup
  material: Sprite2DMaterial
  sprites: Sprite2D[]
  texture: TextureType
  world: World
  root: GroupType | null
  leaves: GroupType[]
  tick: number
}

const ROOT = resolve(import.meta.dirname, '../../..')
const { Group, Texture } = createRequire(resolve(ROOT, 'packages/three-flatland/package.json'))('three') as {
  Group: new () => GroupType
  Texture: new () => TextureType
}
const COUNT = 16_384
const MEMBERS_PER_LEAF = 16

function createSprite(material: Sprite2DMaterial, texture: TextureType, index: number): Sprite2D {
  const sprite = new Sprite2D({ material, texture })
  sprite.position.set(index & 255, index >>> 8, 0)
  return sprite
}

function createContext(scenario: Scenario): Context {
  const texture = new Texture()
  texture.image = { width: 16, height: 16 }
  const material = new Sprite2DMaterial({ alphaTest: 0.5, map: texture })
  const spriteGroup = new SpriteGroup({ expectedSprites: COUNT })
  const sprites: Sprite2D[] = []
  const leaves: GroupType[] = []
  let root: GroupType | null = null

  if (scenario === 'direct-static') {
    for (let index = 0; index < COUNT; index++) sprites.push(createSprite(material, texture, index))
    for (let start = 0; start < sprites.length; start += 1024) {
      spriteGroup.addSprites(...sprites.slice(start, start + 1024))
    }
  } else {
    root = new Group()
    for (let start = 0; start < COUNT; start += MEMBERS_PER_LEAF) {
      const levelOne = new Group()
      const levelTwo = new Group()
      const leaf = new Group()
      leaves.push(leaf)
      levelOne.add(levelTwo)
      levelTwo.add(leaf)
      root.add(levelOne)
      for (let offset = 0; offset < MEMBERS_PER_LEAF; offset++) {
        const sprite = createSprite(material, texture, start + offset)
        sprites.push(sprite)
        leaf.add(sprite)
      }
    }
    spriteGroup.add(root)
  }

  spriteGroup.update()
  const world = Reflect.get(spriteGroup, '_world') as World | null
  if (!world || spriteGroup.spriteCount !== COUNT) throw new Error('Hierarchy fixture enrollment failed')
  transformSyncSystem(world)
  return { group: spriteGroup, material, sprites, texture, world, root, leaves, tick: 0 }
}

function mutate(context: Context, scenario: Scenario): void {
  const direction = (++context.tick & 1) === 0 ? 0.25 : -0.25
  if (scenario === 'hierarchy-root-motion') context.root!.position.x += direction
  else if (scenario === 'hierarchy-leaf-motion') {
    for (const leaf of context.leaves) leaf.position.x += direction
  }
}

function register(name: string, scenario: Scenario): void {
  bench(name, function* () {
    const context = createContext(scenario)
    try {
      yield {
        bench: () => transformSyncSystem(context.world),
        after: () => mutate(context, scenario),
      }
      if (context.group.spriteCount !== COUNT) throw new Error(`${name} lost hierarchy enrollment`)
    } finally {
      context.group.dispose()
      for (const sprite of context.sprites) sprite.dispose()
      context.material.dispose()
      context.texture.dispose()
    }
  }).gc('inner')
}

group('SpriteGroup hierarchy transform profile @hierarchy-profile', () => {
  register('direct static 16,384 @hierarchy-smoke', 'direct-static')
  register('depth-3 static 16,384', 'hierarchy-static')
  register('depth-3 shared-root motion 16,384', 'hierarchy-root-motion')
  register('depth-3 1,024-leaf motion 16,384', 'hierarchy-leaf-motion')
})
