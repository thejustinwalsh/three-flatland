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
}

interface TimelineCohort {
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
}

export interface AnimationGroupState {
  sprites: AnimatedSprite2D[]
  cohorts: TimelineCohort[]
  cohortCount: number
}

const animatedSprites = new WeakSet<object>()
let standardUpdate: AnimatedSprite2D['update'] | null = null
let standardSetFrame: Sprite2D['setFrame'] | null = null
const MAX_COHORTS = 32

export function createAnimationGroupState(): AnimationGroupState {
  return { sprites: [], cohorts: [], cohortCount: 0 }
}

export function registerAnimatedSprite(
  sprite: AnimatedSprite2D,
  update: AnimatedSprite2D['update'],
  setFrame: Sprite2D['setFrame']
): void {
  animatedSprites.add(sprite)
  standardUpdate ??= update
  standardSetFrame ??= setFrame
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
  return sprite.update === standardUpdate && sprite.setFrame === standardSetFrame
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

function findCohort(state: AnimationGroupState, view: ControllerView): TimelineCohort | null {
  for (let index = 0; index < state.cohortCount; index++) {
    const cohort = state.cohorts[index]!
    if (matches(cohort, view)) return cohort
  }
  return null
}

/** Advance a stable enrolled-sprite snapshot, coalescing only equivalent single-transition timelines. */
export function advanceAnimationGroup(state: AnimationGroupState, world: World, deltaMs: number): void {
  state.cohortCount = 0
  for (const sprite of state.sprites) {
    if (spriteWorld(sprite) !== world || !spriteEntity(sprite)) continue
    const view = controllerView(sprite.controller)
    if (!isStandardSprite(sprite) || !canShareSingleTransition(view, deltaMs)) {
      sprite.update(deltaMs)
      continue
    }

    const existing = findCohort(state, view)
    if (existing) {
      applyCohort(existing, view, sprite)
      continue
    }
    if (state.cohortCount >= MAX_COHORTS) {
      sprite.update(deltaMs)
      continue
    }

    let cohort = state.cohorts[state.cohortCount]
    if (!cohort) {
      cohort = {} as TimelineCohort
      state.cohorts.push(cohort)
    }
    state.cohortCount++
    captureCohort(cohort, view, sprite, deltaMs)
  }
}

export function resetAnimationGroupState(state: AnimationGroupState): void {
  state.sprites.length = 0
  state.cohortCount = 0
}

export function disposeAnimationGroupState(state: AnimationGroupState): void {
  resetAnimationGroupState(state)
  state.cohorts.length = 0
}
