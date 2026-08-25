import type { Animation, AnimationState, PlayOptions } from './types'
import type { SpriteFrame } from '../sprites/types'
import { createAnimationPlaybackState, type AnimationPlaybackState } from '../internal/animation-runtime'

type FrameCallback = (frame: SpriteFrame) => void
type EventCallback = (event: string, frameIndex: number) => void

/**
 * Controls animation playback and state.
 *
 * @example
 * ```typescript
 * const controller = new AnimationController();
 * controller.addAnimation({
 *   name: 'walk',
 *   frames: walkFrames,
 *   fps: 12,
 *   loop: true,
 * });
 * controller.play('walk');
 *
 * // In update loop
 * controller.update(deltaMs, (frame) => {
 *   sprite.setFrame(frame);
 * });
 * ```
 */
export class AnimationController {
  private animations = new Map<string, { animation: Animation; definition: number }>()
  private definitions: Array<Animation | undefined> = []
  private _playback: AnimationPlaybackState

  // Current play options
  private options: PlayOptions = {}

  constructor() {
    this._playback = createAnimationPlaybackState(this)
  }

  private _read(field: keyof Omit<AnimationPlaybackState, 'store' | 'index' | 'revision'>): number {
    const playback = this._playback
    return playback.store ? playback.store[field][playback.index]! : playback[field]
  }

  private _write(field: keyof Omit<AnimationPlaybackState, 'store' | 'index' | 'revision'>, value: number): void {
    const playback = this._playback
    playback.revision++
    if (playback.store) playback.store[field][playback.index] = value
    else playback[field] = value
  }

  private _commitFrame(frameIndex: number, elapsed: number): void {
    const playback = this._playback
    const store = playback.store
    if (store) {
      const index = playback.index
      store.frameIndex[index] = frameIndex
      store.elapsed[index] = elapsed
      return
    }
    playback.frameIndex = frameIndex
    playback.elapsed = elapsed
  }

  private _commitElapsed(elapsed: number): void {
    const playback = this._playback
    if (playback.store) playback.store.elapsed[playback.index] = elapsed
    else playback.elapsed = elapsed
  }

  private _commitDirection(direction: number): void {
    const playback = this._playback
    if (playback.store) playback.store.direction[playback.index] = direction
    else playback.direction = direction
  }

  private _commitLoop(loopCount: number, elapsed: number, direction: number): void {
    const playback = this._playback
    const store = playback.store
    if (store) {
      const index = playback.index
      store.loopCount[index] = loopCount
      store.elapsed[index] = elapsed
      store.direction[index] = direction
      return
    }
    playback.loopCount = loopCount
    playback.elapsed = elapsed
    playback.direction = direction
  }

  private _commitComplete(frameIndex: number, elapsed: number, direction: number, loopCount: number): void {
    const playback = this._playback
    const store = playback.store
    if (store) {
      const index = playback.index
      store.frameIndex[index] = frameIndex
      store.elapsed[index] = elapsed
      store.direction[index] = direction
      store.playing[index] = 0
      store.loopCount[index] = loopCount
      return
    }
    playback.frameIndex = frameIndex
    playback.elapsed = elapsed
    playback.direction = direction
    playback.playing = 0
    playback.loopCount = loopCount
  }

  private _current(): Animation | null {
    const definition = this._read('definition')
    return definition < 0 ? null : (this.definitions[definition] ?? null)
  }

  /**
   * Add an animation definition.
   */
  addAnimation(animation: Animation): this {
    const existing = this.animations.get(animation.name)
    if (existing) {
      existing.animation = animation
      this.definitions[existing.definition] = animation
    } else {
      const definition = this.definitions.length
      this.definitions.push(animation)
      this.animations.set(animation.name, { animation, definition })
    }
    return this
  }

  /**
   * Add multiple animations.
   */
  addAnimations(animations: Animation[]): this {
    for (const anim of animations) {
      this.addAnimation(anim)
    }
    return this
  }

  /**
   * Remove an animation.
   */
  removeAnimation(name: string): this {
    const existing = this.animations.get(name)
    if (!existing) return this
    this.animations.delete(name)
    this.definitions[existing.definition] = undefined
    if (this._read('definition') === existing.definition) {
      this.stop()
    }
    return this
  }

  /**
   * Get an animation by name.
   */
  getAnimation(name: string): Animation | undefined {
    return this.animations.get(name)?.animation
  }

  /**
   * Get all animation names.
   */
  getAnimationNames(): string[] {
    return Array.from(this.animations.keys())
  }

  /**
   * Play an animation.
   */
  play(name: string, options: PlayOptions = {}): this {
    const entry = this.animations.get(name)
    if (!entry) {
      console.warn(`Animation not found: ${name}`)
      return this
    }

    // If same animation and already playing, optionally restart
    if (this._read('definition') === entry.definition && this._read('playing') === 1 && this._read('paused') === 0) {
      if (options.startFrame === undefined) {
        return this // Continue playing
      }
    }

    this._write('definition', entry.definition)
    this._write('frameIndex', options.startFrame ?? 0)
    this._write('elapsed', 0)
    this._write('playing', 1)
    this._write('paused', 0)
    this._write('loopCount', 0)
    this._write('speed', options.speed ?? 1)
    this._write('direction', 1)
    this._write('loopMode', options.loop === undefined ? -1 : options.loop ? 1 : 0)
    this.options = options

    return this
  }

  /**
   * Pause the current animation.
   */
  pause(): this {
    this._write('paused', 1)
    return this
  }

  /**
   * Resume a paused animation.
   */
  resume(): this {
    this._write('paused', 0)
    return this
  }

  /**
   * Stop the current animation.
   */
  stop(): this {
    this._write('playing', 0)
    this._write('paused', 0)
    this._write('definition', -1)
    this._write('frameIndex', 0)
    this._write('elapsed', 0)
    return this
  }

  /**
   * Go to a specific frame.
   */
  gotoFrame(index: number): this {
    const current = this._current()
    if (current && index >= 0 && index < current.frames.length) {
      this._write('frameIndex', index)
      this._write('elapsed', 0)
    }
    return this
  }

  /**
   * Update animation state.
   * @param deltaMs Time since last update in milliseconds
   * @param onFrame Callback when frame changes
   * @param onEvent Callback when frame event fires
   */
  update(deltaMs: number, onFrame?: FrameCallback, onEvent?: EventCallback): void {
    const playback = this._playback
    const store = playback.store
    const index = playback.index
    const definition = store ? store.definition[index]! : playback.definition
    let frameIndex = store ? store.frameIndex[index]! : playback.frameIndex
    let elapsed = store ? store.elapsed[index]! : playback.elapsed
    const speed = store ? store.speed[index]! : playback.speed
    let direction = store ? store.direction[index]! : playback.direction
    let playing = store ? store.playing[index]! : playback.playing
    const paused = store ? store.paused[index]! : playback.paused
    let loopCount = store ? store.loopCount[index]! : playback.loopCount
    const loopMode = store ? store.loopMode[index]! : playback.loopMode
    const animation = definition < 0 ? undefined : this.definitions[definition]
    if (!animation || playing === 0 || paused === 1) return

    const transaction = ++playback.revision
    const frames = animation.frames
    if (frames.length === 0) return
    const fps = animation.fps ?? 12
    const loop = loopMode === -1 ? (animation.loop ?? true) : loopMode === 1
    const pingPong = animation.pingPong ?? false
    const maxLoops = animation.loopCount ?? -1

    // Accumulate time
    elapsed += deltaMs * speed

    // Check if we need to advance frames
    while (playing === 1) {
      const currentAnimFrame = frames[frameIndex]
      const frameDuration = currentAnimFrame?.duration ?? 1000 / fps
      if (!(frameDuration > 0) || elapsed < frameDuration) break
      elapsed -= frameDuration

      // Determine next frame
      let nextFrame = frameIndex + direction
      let completed = false
      let loopCompleted = false

      // Handle ping-pong
      if (pingPong) {
        if (frames.length === 1) {
          nextFrame = 0
          loopCompleted = true
        } else if (nextFrame >= frames.length) {
          direction = -1
          this._commitDirection(direction)
          nextFrame = frames.length - 2
        } else if (nextFrame < 0) {
          direction = 1
          nextFrame = 1
          loopCompleted = true
        }
      } else {
        // Handle normal loop/end
        if (nextFrame >= frames.length) {
          nextFrame = loop ? 0 : frames.length - 1
          loopCompleted = loop
          completed = !loop
        }
      }

      if (loopCompleted) {
        loopCount++
        this._commitLoop(loopCount, elapsed, direction)
        this.options.onLoop?.(loopCount)
        if (playback.revision !== transaction) return
        if (!loop || (maxLoops !== -1 && loopCount >= maxLoops)) completed = true
      }

      if (completed) {
        playing = 0
        frameIndex = pingPong ? 0 : frames.length - 1
        this._commitComplete(frameIndex, elapsed, direction, loopCount)
        this.options.onComplete?.()
        return
      }

      // Apply frame change
      if (nextFrame !== frameIndex) {
        frameIndex = nextFrame
        this._commitFrame(frameIndex, elapsed)

        const newFrame = frames[nextFrame]
        if (newFrame) {
          // Fire frame callback
          onFrame?.(newFrame.frame)
          this.options.onFrame?.(nextFrame, newFrame)

          // Fire event if present
          if (newFrame.event) {
            onEvent?.(newFrame.event, nextFrame)
            this.options.onEvent?.(newFrame.event, nextFrame)
          }
          if (playback.revision !== transaction) return
        }
      }
    }
    this._commitElapsed(elapsed)
  }

  /**
   * Get current frame.
   */
  getCurrentFrame(): SpriteFrame | null {
    const current = this._current()
    const frameIndex = this._read('frameIndex')
    if (!current || frameIndex >= current.frames.length) {
      return null
    }
    return current.frames[frameIndex]?.frame ?? null
  }

  /**
   * Get current animation state.
   */
  getState(): AnimationState {
    return {
      animation: this._current()?.name ?? null,
      frameIndex: this._read('frameIndex'),
      elapsed: this._read('elapsed'),
      playing: this._read('playing') === 1,
      paused: this._read('paused') === 1,
      loopCount: this._read('loopCount'),
      speed: this._read('speed'),
    }
  }

  /**
   * Check if an animation is playing.
   */
  isPlaying(name?: string): boolean {
    if (name) {
      return this._read('playing') === 1 && this._read('paused') === 0 && this._current()?.name === name
    }
    return this._read('playing') === 1 && this._read('paused') === 0
  }

  /**
   * Get current animation name.
   */
  get currentAnimation(): string | null {
    return this._current()?.name ?? null
  }

  /**
   * Get playback speed.
   */
  getSpeed(): number {
    return this._read('speed')
  }

  /**
   * Set playback speed.
   */
  setSpeed(speed: number): this {
    this._write('speed', speed)
    return this
  }

  /**
   * Get animation duration in milliseconds.
   */
  getAnimationDuration(name: string): number {
    const animation = this.animations.get(name)?.animation
    if (!animation) return 0

    const fps = animation.fps ?? 12
    const defaultDuration = 1000 / fps

    return animation.frames.reduce((total, frame) => {
      return total + (frame.duration ?? defaultDuration)
    }, 0)
  }

  /**
   * Dispose of resources.
   */
  dispose(): void {
    this.animations.clear()
    this.definitions.length = 0
    this._write('definition', -1)
    this._write('playing', 0)
    this.options = {}
  }
}
