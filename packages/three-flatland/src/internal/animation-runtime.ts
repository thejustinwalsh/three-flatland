import type { AnimationController } from '../animation/AnimationController'
import { AnimationPlayback } from '../ecs/traits'
import type { Entity, NumericStore, World } from '../ecs/runtime'

export interface AnimationPlaybackState {
  definition: number
  frameIndex: number
  elapsed: number
  speed: number
  direction: number
  playing: number
  paused: number
  loopCount: number
  loopMode: number
  store: NumericStore<typeof AnimationPlayback.defaults> | null
  index: number
  revision: number
}

const controllerStates = new WeakMap<object, AnimationPlaybackState>()
const spriteControllers = new WeakMap<object, AnimationController>()

export function createAnimationPlaybackState(controller: object): AnimationPlaybackState {
  const state: AnimationPlaybackState = {
    definition: -1,
    frameIndex: 0,
    elapsed: 0,
    speed: 1,
    direction: 1,
    playing: 0,
    paused: 0,
    loopCount: 0,
    loopMode: -1,
    store: null,
    index: 0,
    revision: 0,
  }
  controllerStates.set(controller, state)
  return state
}

export function registerAnimatedSprite(sprite: object, controller: AnimationController): void {
  spriteControllers.set(sprite, controller)
}

export function bindSpriteAnimationPlayback(sprite: object, world: World, entity: Entity): void {
  const controller = spriteControllers.get(sprite)
  if (!controller) return
  const state = controllerStates.get(controller)
  if (!state) return

  world.add(
    entity,
    AnimationPlayback({
      definition: state.definition,
      frameIndex: state.frameIndex,
      elapsed: state.elapsed,
      speed: state.speed,
      direction: state.direction,
      playing: state.playing,
      paused: state.paused,
      loopCount: state.loopCount,
      loopMode: state.loopMode,
    })
  )
  state.store = world.store(AnimationPlayback)
  state.index = world.index(entity)
}

export function unbindSpriteAnimationPlayback(sprite: object, world: World, entity: Entity): void {
  const controller = spriteControllers.get(sprite)
  if (!controller) return
  const state = controllerStates.get(controller)
  const store = state?.store
  if (!state || !store) return

  const index = state.index
  state.definition = store.definition[index]!
  state.frameIndex = store.frameIndex[index]!
  state.elapsed = store.elapsed[index]!
  state.speed = store.speed[index]!
  state.direction = store.direction[index]!
  state.playing = store.playing[index]!
  state.paused = store.paused[index]!
  state.loopCount = store.loopCount[index]!
  state.loopMode = store.loopMode[index]!
  state.store = null
  state.index = 0
  if (world.has(entity, AnimationPlayback)) world.remove(entity, AnimationPlayback)
}
