import type { Animation, AnimationState, PlayOptions } from './types'
import type { SpriteFrame } from '../sprites/types'

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
  private animations: Map<string, Animation> = new Map()
  private current: Animation | null = null
  private frameIndex: number = 0
  private elapsed: number = 0
  private playing: boolean = false
  private paused: boolean = false
  private loopCount: number = 0
  private speed: number = 1
  private direction: 1 | -1 = 1 // For ping-pong

  // Current play options
  private options: PlayOptions = {}

  /**
   * Add an animation definition.
   */
  addAnimation(animation: Animation): this {
    this.animations.set(animation.name, animation)
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
    this.animations.delete(name)
    if (this.current?.name === name) {
      this.stop()
    }
    return this
  }

  /**
   * Get an animation by name.
   */
  getAnimation(name: string): Animation | undefined {
    return this.animations.get(name)
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
    const animation = this.animations.get(name)
    if (!animation) {
      console.warn(`Animation not found: ${name}`)
      return this
    }

    // If same animation and already playing, optionally restart
    if (this.current?.name === name && this.playing && !this.paused) {
      if (options.startFrame === undefined) {
        return this // Continue playing
      }
    }

    this.current = animation
    this.frameIndex = options.startFrame ?? 0
    this.elapsed = 0
    this.playing = true
    this.paused = false
    this.loopCount = 0
    this.speed = options.speed ?? 1
    this.direction = 1
    this.options = options

    return this
  }

  /**
   * Pause the current animation.
   */
  pause(): this {
    this.paused = true
    return this
  }

  /**
   * Resume a paused animation.
   */
  resume(): this {
    this.paused = false
    return this
  }

  /**
   * Stop the current animation.
   */
  stop(): this {
    this.playing = false
    this.paused = false
    this.current = null
    this.frameIndex = 0
    this.elapsed = 0
    return this
  }

  /**
   * Go to a specific frame.
   */
  gotoFrame(index: number): this {
    if (this.current && index >= 0 && index < this.current.frames.length) {
      this.frameIndex = index
      this.elapsed = 0
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
    if (!this.current || !this.playing || this.paused) {
      return
    }

    const animation = this.current
    const frames = animation.frames
    const fps = animation.fps ?? 12
    const loop = this.options.loop ?? animation.loop ?? true
    const pingPong = animation.pingPong ?? false
    const maxLoops = animation.loopCount ?? -1

    // Calculate frame duration
    const currentAnimFrame = frames[this.frameIndex]
    const frameDuration = currentAnimFrame?.duration ?? 1000 / fps

    // Accumulate time
    this.elapsed += deltaMs * this.speed

    // Check if we need to advance frames
    while (this.elapsed >= frameDuration && this.playing) {
      this.elapsed -= frameDuration

      // Determine next frame
      let nextFrame = this.frameIndex + this.direction

      // Handle ping-pong
      if (pingPong) {
        if (nextFrame >= frames.length) {
          this.direction = -1
          nextFrame = frames.length - 2
        } else if (nextFrame < 0) {
          this.direction = 1
          nextFrame = 1
          this.handleLoopComplete(loop, maxLoops)
        }
      } else {
        // Handle normal loop/end
        if (nextFrame >= frames.length) {
          if (this.handleLoopComplete(loop, maxLoops)) {
            nextFrame = 0
          } else {
            // Animation complete
            nextFrame = frames.length - 1
            this.playing = false
            this.options.onComplete?.()
          }
        }
      }

      // Apply frame change
      if (nextFrame !== this.frameIndex && this.playing) {
        this.frameIndex = nextFrame

        const newFrame = frames[this.frameIndex]
        if (newFrame) {
          // Fire frame callback
          onFrame?.(newFrame.frame)
          this.options.onFrame?.(this.frameIndex, newFrame)

          // Fire event if present
          if (newFrame.event) {
            onEvent?.(newFrame.event, this.frameIndex)
            this.options.onEvent?.(newFrame.event, this.frameIndex)
          }
        }
      }
    }
  }

  /**
   * Handle loop completion.
   * @returns true if should continue looping
   */
  private handleLoopComplete(loop: boolean, maxLoops: number): boolean {
    if (!loop) {
      return false
    }

    this.loopCount++
    this.options.onLoop?.(this.loopCount)

    if (maxLoops !== -1 && this.loopCount >= maxLoops) {
      return false
    }

    return true
  }

  /**
   * Get current frame.
   */
  getCurrentFrame(): SpriteFrame | null {
    if (!this.current || this.frameIndex >= this.current.frames.length) {
      return null
    }
    return this.current.frames[this.frameIndex]?.frame ?? null
  }

  /**
   * Get current animation state.
   */
  getState(): AnimationState {
    return {
      animation: this.current?.name ?? null,
      frameIndex: this.frameIndex,
      elapsed: this.elapsed,
      playing: this.playing,
      paused: this.paused,
      loopCount: this.loopCount,
      speed: this.speed,
    }
  }

  /**
   * Check if an animation is playing.
   */
  isPlaying(name?: string): boolean {
    if (name) {
      return this.playing && !this.paused && this.current?.name === name
    }
    return this.playing && !this.paused
  }

  /**
   * Get current animation name.
   */
  get currentAnimation(): string | null {
    return this.current?.name ?? null
  }

  /**
   * Get playback speed.
   */
  getSpeed(): number {
    return this.speed
  }

  /**
   * Set playback speed.
   */
  setSpeed(speed: number): this {
    this.speed = speed
    return this
  }

  /**
   * Get animation duration in milliseconds.
   */
  getAnimationDuration(name: string): number {
    const animation = this.animations.get(name)
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
    this.current = null
    this.options = {}
  }
}
