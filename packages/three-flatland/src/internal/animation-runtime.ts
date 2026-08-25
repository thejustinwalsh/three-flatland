import type { Animation, AnimationFrame, PlayOptions } from '../animation/types'
import type { AnimationController } from '../animation/AnimationController'
import type { AnimatedSprite2D } from '../sprites/AnimatedSprite2D'
import type { Sprite2D } from '../sprites/Sprite2D'
import type { SpriteFrame } from '../sprites/types'
import type { World } from '../ecs/runtime'
import { spriteEntity, spriteWorld } from './sprite-runtime'

interface ControllerView {
  current: Animation | null
  frameIndex: number
  elapsed: number
  playing: boolean
  paused: boolean
  loopCount: number
  speed: number
  direction: 1 | -1
  options: PlayOptions
  timelineShareable: boolean
  timelineRevision: number
}

interface TimelineCohort {
  index: number
  animation: Animation
  frames: AnimationFrame[]
  fps: number | undefined
  loop: boolean | undefined
  pingPong: boolean | undefined
  maxLoops: number | undefined
  optionLoop: boolean | undefined
  inputFrame: AnimationFrame | undefined
  inputFrameIndex: number
  inputElapsed: number
  inputPlaying: boolean
  inputPaused: boolean
  inputLoopCount: number
  inputSpeed: number
  inputDirection: 1 | -1
  outputFrameIndex: number
  outputElapsed: number
  outputPlaying: boolean
  outputPaused: boolean
  outputLoopCount: number
  outputSpeed: number
  outputDirection: 1 | -1
  projectedFrame: SpriteFrame | null
  projectedAnimationFrame: AnimationFrame | undefined
  projectedDuration: number | undefined
  projectedEvent: string | undefined
  projected: boolean
  processedTick: number
  lastUsedTick: number
  disabledTick: number
}

export interface AnimationGroupState {
  members: AnimatedSprite2D[]
  sprites: Array<AnimatedSprite2D | null>
  spriteCount: number
  cohorts: TimelineCohort[]
  bindingEntity: Float64Array
  bindingCohort: Uint8Array
  bindingTick: Uint32Array
  bindingRevision: Uint32Array
  tick: number
}

const animatedSprites = new WeakSet<object>()
let standardUpdate: AnimatedSprite2D['update'] | null = null
let standardSetFrame: Sprite2D['setFrame'] | null = null
let standardControllerUpdate: AnimationController['update'] | null = null
const MAX_COHORTS = 32
const EMPTY_F64 = new Float64Array(0)
const EMPTY_U32 = new Uint32Array(0)
const EMPTY_U8 = new Uint8Array(0)

export function createAnimationGroupState(): AnimationGroupState {
  return {
    members: [],
    sprites: [],
    spriteCount: 0,
    cohorts: [],
    bindingEntity: EMPTY_F64,
    bindingCohort: EMPTY_U8,
    bindingTick: EMPTY_U32,
    bindingRevision: EMPTY_U32,
    tick: 0,
  }
}

export function registerAnimatedSprite(
  sprite: AnimatedSprite2D,
  update: AnimatedSprite2D['update'],
  setFrame: Sprite2D['setFrame'],
  controllerUpdate: AnimationController['update']
): void {
  animatedSprites.add(sprite)
  standardUpdate ??= update
  standardSetFrame ??= setFrame
  standardControllerUpdate ??= controllerUpdate
}

export function prepareAnimationGroupState(state: AnimationGroupState, capacity: number): void {
  if (state.cohorts.length === 0) {
    for (let index = 0; index < MAX_COHORTS; index++) {
      state.cohorts.push({ index, processedTick: 0, lastUsedTick: -1, disabledTick: 0 } as TimelineCohort)
    }
  }
  if (capacity <= state.bindingEntity.length) return
  let nextCapacity = Math.max(16, state.bindingEntity.length)
  while (nextCapacity < capacity) nextCapacity *= 2

  const bindingEntity = new Float64Array(nextCapacity)
  const bindingCohort = new Uint8Array(nextCapacity)
  const bindingTick = new Uint32Array(nextCapacity)
  const bindingRevision = new Uint32Array(nextCapacity)
  bindingEntity.set(state.bindingEntity)
  bindingCohort.set(state.bindingCohort)
  bindingTick.set(state.bindingTick)
  bindingRevision.set(state.bindingRevision)
  state.bindingEntity = bindingEntity
  state.bindingCohort = bindingCohort
  state.bindingTick = bindingTick
  state.bindingRevision = bindingRevision
}

/** Register animation membership and reserve frame scratch during topology work. */
export function registerAnimationGroupSprite(state: AnimationGroupState, sprite: AnimatedSprite2D): void {
  if (state.members.includes(sprite)) return
  state.members.push(sprite)
  while (state.sprites.length < state.members.length) state.sprites.push(null)
}

/** Release animation membership outside the frame step. */
export function unregisterAnimationGroupSprite(state: AnimationGroupState, sprite: AnimatedSprite2D): void {
  const index = state.members.indexOf(sprite)
  if (index < 0) return
  state.members.splice(index, 1)
  if (state.spriteCount === 0) {
    for (let scratchIndex = state.members.length; scratchIndex < state.sprites.length; scratchIndex++) {
      state.sprites[scratchIndex] = null
    }
  }
}

/** Snapshot current animation membership without allocating during the frame step. */
export function snapshotAnimationGroupState(state: AnimationGroupState): void {
  const count = state.members.length
  for (let index = 0; index < count; index++) state.sprites[index] = state.members[index]!
  state.spriteCount = count
}

export function isAnimatedSprite(sprite: Sprite2D): sprite is AnimatedSprite2D {
  return animatedSprites.has(sprite)
}

function controllerView(controller: AnimationController): ControllerView {
  return controller as unknown as ControllerView
}

function frameDuration(frame: AnimationFrame | undefined, fps: number): number {
  return frame?.duration ?? 1000 / fps
}

function nextFrameIndex(view: ControllerView, animation: Animation, loop: boolean, maxLoops: number): number {
  const length = animation.frames.length
  let next = view.frameIndex + view.direction
  if (animation.pingPong) {
    if (next >= length) next = length - 2
    else if (next < 0) next = 1
    return next
  }
  if (next < length) return next
  if (!loop || (maxLoops !== -1 && view.loopCount + 1 >= maxLoops)) return length - 1
  return 0
}

function canShareSingleTransition(view: ControllerView, deltaMs: number): boolean {
  const animation = view.current
  if (!animation || !view.playing || view.paused || !view.timelineShareable) return false
  const frames = animation.frames
  if (frames.length === 0 || view.frameIndex < 0 || view.frameIndex >= frames.length) return false

  const scaledDelta = deltaMs * view.speed
  const totalElapsed = view.elapsed + scaledDelta
  if (!Number.isFinite(totalElapsed)) return false
  const fps = animation.fps ?? 12
  const currentDuration = frameDuration(frames[view.frameIndex], fps)
  if (!(currentDuration > 0) || totalElapsed < currentDuration) return true

  const loop = view.options.loop ?? animation.loop ?? true
  const maxLoops = animation.loopCount ?? -1
  const nextIndex = nextFrameIndex(view, animation, loop, maxLoops)
  const nextFrame = frames[nextIndex]
  if (!nextFrame || nextFrame.event) return false
  const nextDuration = frameDuration(nextFrame, fps)
  return !(nextDuration > 0) || totalElapsed - currentDuration < nextDuration
}

function isStandardSprite(sprite: AnimatedSprite2D): boolean {
  return (
    sprite.update === standardUpdate &&
    sprite.setFrame === standardSetFrame &&
    sprite.controller.update === standardControllerUpdate
  )
}

function matches(cohort: TimelineCohort, view: ControllerView): boolean {
  const animation = view.current
  if (!animation || animation !== cohort.animation || animation.frames !== cohort.frames) return false
  if (
    animation.fps !== cohort.fps ||
    animation.loop !== cohort.loop ||
    animation.pingPong !== cohort.pingPong ||
    animation.loopCount !== cohort.maxLoops ||
    view.options.loop !== cohort.optionLoop ||
    view.frameIndex !== cohort.inputFrameIndex ||
    !Object.is(view.elapsed, cohort.inputElapsed) ||
    view.playing !== cohort.inputPlaying ||
    view.paused !== cohort.inputPaused ||
    view.loopCount !== cohort.inputLoopCount ||
    !Object.is(view.speed, cohort.inputSpeed) ||
    view.direction !== cohort.inputDirection
  ) {
    return false
  }

  const inputFrame = animation.frames[view.frameIndex]
  if (!cohort.projected) return inputFrame === cohort.inputFrame
  const projected = animation.frames[cohort.outputFrameIndex]
  return (
    inputFrame === cohort.inputFrame &&
    projected === cohort.projectedAnimationFrame &&
    projected?.frame === cohort.projectedFrame &&
    projected?.duration === cohort.projectedDuration &&
    projected?.event === cohort.projectedEvent
  )
}

function captureCohort(cohort: TimelineCohort, view: ControllerView, sprite: AnimatedSprite2D, deltaMs: number): void {
  const animation = view.current!
  const frames = animation.frames
  cohort.animation = animation
  cohort.frames = frames
  cohort.fps = animation.fps
  cohort.loop = animation.loop
  cohort.pingPong = animation.pingPong
  cohort.maxLoops = animation.loopCount
  cohort.optionLoop = view.options.loop
  cohort.inputFrame = frames[view.frameIndex]
  cohort.inputFrameIndex = view.frameIndex
  cohort.inputElapsed = view.elapsed
  cohort.inputPlaying = view.playing
  cohort.inputPaused = view.paused
  cohort.inputLoopCount = view.loopCount
  cohort.inputSpeed = view.speed
  cohort.inputDirection = view.direction

  sprite.update(deltaMs)

  cohort.outputFrameIndex = view.frameIndex
  cohort.outputElapsed = view.elapsed
  cohort.outputPlaying = view.playing
  cohort.outputPaused = view.paused
  cohort.outputLoopCount = view.loopCount
  cohort.outputSpeed = view.speed
  cohort.outputDirection = view.direction
  cohort.projected = cohort.outputPlaying && cohort.outputFrameIndex !== cohort.inputFrameIndex
  cohort.projectedAnimationFrame = cohort.projected ? frames[view.frameIndex] : undefined
  cohort.projectedFrame = cohort.projectedAnimationFrame?.frame ?? null
  cohort.projectedDuration = cohort.projectedAnimationFrame?.duration
  cohort.projectedEvent = cohort.projectedAnimationFrame?.event
}

function applyCohort(cohort: TimelineCohort, view: ControllerView, sprite: AnimatedSprite2D): void {
  view.timelineRevision = (view.timelineRevision + 1) >>> 0
  view.frameIndex = cohort.outputFrameIndex
  view.elapsed = cohort.outputElapsed
  view.playing = cohort.outputPlaying
  view.paused = cohort.outputPaused
  view.loopCount = cohort.outputLoopCount
  view.speed = cohort.outputSpeed
  view.direction = cohort.outputDirection
  if (cohort.projected && cohort.projectedFrame) {
    sprite.setFrame(cohort.projectedFrame)
  }
}

function findCurrentCohort(state: AnimationGroupState, view: ControllerView): TimelineCohort | null {
  for (const cohort of state.cohorts) {
    if (cohort.processedTick === state.tick && cohort.disabledTick !== state.tick && matches(cohort, view)) {
      return cohort
    }
  }
  return null
}

function acquireCohort(state: AnimationGroupState): TimelineCohort | null {
  const previousTick = state.tick - 1
  for (const cohort of state.cohorts) {
    if (cohort.lastUsedTick < previousTick) return cohort
  }
  return null
}

function clearBinding(state: AnimationGroupState, index: number): void {
  state.bindingCohort[index] = 0
}

function bind(
  state: AnimationGroupState,
  index: number,
  entity: number,
  cohort: TimelineCohort,
  view: ControllerView
): void {
  state.bindingEntity[index] = entity
  state.bindingCohort[index] = cohort.index + 1
  state.bindingTick[index] = state.tick
  state.bindingRevision[index] = view.timelineRevision
  cohort.lastUsedTick = state.tick
}

function advanceFallback(state: AnimationGroupState, index: number, sprite: AnimatedSprite2D, deltaMs: number): void {
  clearBinding(state, index)
  sprite.update(deltaMs)
}

function beginTick(state: AnimationGroupState): void {
  state.tick = (state.tick + 1) >>> 0
  if (state.tick !== 0) return
  state.bindingTick.fill(0)
  state.bindingCohort.fill(0)
  for (const cohort of state.cohorts) {
    cohort.processedTick = 0
    cohort.lastUsedTick = -1
    cohort.disabledTick = 0
  }
  state.tick = 1
}

/** Advance a stable enrolled-sprite snapshot, coalescing equivalent single-transition timelines. */
export function advanceAnimationGroup(state: AnimationGroupState, world: World, deltaMs: number): void {
  beginTick(state)
  const previousTick = state.tick - 1
  for (let spriteIndex = 0; spriteIndex < state.spriteCount; spriteIndex++) {
    const sprite = state.sprites[spriteIndex]!
    const entity = spriteEntity(sprite)
    if (spriteWorld(sprite) !== world || !entity) continue
    const index = world.index(entity)
    const view = controllerView(sprite.controller)
    const cohortIndex = state.bindingCohort[index]! - 1
    const boundCohort = cohortIndex >= 0 ? state.cohorts[cohortIndex] : undefined
    const bindingValid =
      isStandardSprite(sprite) &&
      boundCohort !== undefined &&
      state.bindingEntity[index] === entity &&
      state.bindingTick[index] === previousTick &&
      state.bindingRevision[index] === view.timelineRevision

    if (bindingValid) {
      if (boundCohort.disabledTick === state.tick) {
        advanceFallback(state, index, sprite, deltaMs)
        continue
      }
      if (boundCohort.processedTick !== state.tick) {
        if (!canShareSingleTransition(view, deltaMs)) {
          boundCohort.disabledTick = state.tick
          boundCohort.lastUsedTick = state.tick
          advanceFallback(state, index, sprite, deltaMs)
          continue
        }
        captureCohort(boundCohort, view, sprite, deltaMs)
        boundCohort.processedTick = state.tick
        bind(state, index, entity, boundCohort, view)
        continue
      }
      applyCohort(boundCohort, view, sprite)
      bind(state, index, entity, boundCohort, view)
      continue
    }

    clearBinding(state, index)
    if (!isStandardSprite(sprite) || !canShareSingleTransition(view, deltaMs)) {
      sprite.update(deltaMs)
      continue
    }

    const existing = findCurrentCohort(state, view)
    if (existing) {
      applyCohort(existing, view, sprite)
      bind(state, index, entity, existing, view)
      continue
    }

    const cohort = acquireCohort(state)
    if (!cohort) {
      sprite.update(deltaMs)
      continue
    }
    captureCohort(cohort, view, sprite, deltaMs)
    cohort.processedTick = state.tick
    cohort.disabledTick = 0
    bind(state, index, entity, cohort, view)
  }
}

export function resetAnimationGroupState(state: AnimationGroupState): void {
  for (let index = 0; index < state.spriteCount; index++) state.sprites[index] = null
  state.spriteCount = 0
}

export function disposeAnimationGroupState(state: AnimationGroupState): void {
  resetAnimationGroupState(state)
  state.members.length = 0
  state.sprites.length = 0
  state.cohorts.length = 0
  state.bindingEntity = EMPTY_F64
  state.bindingCohort = EMPTY_U8
  state.bindingTick = EMPTY_U32
  state.bindingRevision = EMPTY_U32
  state.tick = 0
}
