import type { Color, Vector2 } from 'three'
import { Sprite2D } from './Sprite2D'
import { AnimationController } from '../animation/AnimationController'
import type { SpriteSheet } from './types'
import type { Animation, AnimationSetDefinition, PlayOptions } from '../animation/types'

/**
 * Options for creating an AnimatedSprite2D.
 */
export interface AnimatedSprite2DOptions {
  /** SpriteSheet containing animation frames */
  spriteSheet: SpriteSheet
  /** Animation definitions */
  animations?: Animation[]
  /** Animation set definition (alternative to animations array) */
  animationSet?: AnimationSetDefinition
  /** Initial animation to play */
  animation?: string
  /** Auto-play on creation (default: true) */
  autoPlay?: boolean
  /** Anchor/pivot point (0-1), default [0.5, 0.5] (center) */
  anchor?: Vector2 | [number, number]
  /** Tint color, default white */
  tint?: Color | string | number
  /** Opacity 0-1, default 1 */
  alpha?: number
  /** Flip horizontally */
  flipX?: boolean
  /** Flip vertically */
  flipY?: boolean
  /** Render layer (for Renderer2D) */
  layer?: number
  /** Z-index within layer */
  zIndex?: number
  /** Pixel-perfect rendering (snap to pixels) */
  pixelPerfect?: boolean
}

/**
 * A 2D sprite with animation support.
 *
 * @example
 * ```typescript
 * const player = new AnimatedSprite2D({
 *   spriteSheet: sheet,
 *   animationSet: {
 *     animations: {
 *       idle: { frames: ['player_idle_0', 'player_idle_1'], fps: 8 },
 *       walk: { frames: ['player_walk_0', 'player_walk_1', 'player_walk_2'], fps: 12 },
 *     }
 *   },
 *   animation: 'idle',
 * });
 *
 * // In update loop
 * player.update(deltaMs);
 *
 * // Change animation
 * player.play('walk');
 * ```
 */
export class AnimatedSprite2D extends Sprite2D {
  /** Animation controller */
  readonly controller: AnimationController

  /** Source spritesheet */
  private _spriteSheet: SpriteSheet | null = null

  /**
   * Create a new AnimatedSprite2D.
   * Can be called with no arguments for R3F compatibility - set spriteSheet via property.
   */
  constructor(options?: AnimatedSprite2DOptions) {
    // Get initial frame from spritesheet if available
    const firstFrame = options?.spriteSheet?.frames.values().next().value

    super({
      texture: options?.spriteSheet?.texture,
      frame: firstFrame,
      anchor: options?.anchor,
      tint: options?.tint,
      alpha: options?.alpha,
      flipX: options?.flipX,
      flipY: options?.flipY,
      layer: options?.layer,
      zIndex: options?.zIndex,
      pixelPerfect: options?.pixelPerfect,
    })

    this.controller = new AnimationController()
    this.name = 'AnimatedSprite2D'

    // If no options, we're being created by R3F - properties will be set via setters
    if (!options) {
      return
    }

    this._spriteSheet = options.spriteSheet

    // Add animations
    if (options.animations) {
      this.controller.addAnimations(options.animations)
    }

    if (options.animationSet) {
      this.loadAnimationSet(options.animationSet)
    }

    // Play initial animation
    if (options.animation) {
      this.play(options.animation)
    } else if (options.autoPlay !== false) {
      // Auto-play first animation if available
      const names = this.controller.getAnimationNames()
      if (names.length > 0) {
        this.play(names[0]!)
      }
    }
  }

  /**
   * Get the spritesheet.
   */
  get spriteSheet(): SpriteSheet | null {
    return this._spriteSheet
  }

  /**
   * Set a new spritesheet.
   */
  set spriteSheet(value: SpriteSheet | null) {
    this._spriteSheet = value
    if (value) {
      this.texture = value.texture
      // Set initial frame from spritesheet
      const firstFrame = value.frames.values().next().value
      if (firstFrame && !this.frame) {
        this.setFrame(firstFrame)
      }
    }
  }

  /**
   * Set animation set definition (R3F compatible).
   * Loads animations from the definition.
   */
  set animationSet(value: AnimationSetDefinition | null) {
    if (value) {
      this.loadAnimationSet(value)
    }
  }

  /**
   * Set the current animation by name (R3F compatible).
   * Plays the animation if found.
   */
  set animation(value: string | null) {
    if (value && this.controller.getAnimationNames().includes(value)) {
      this.play(value)
    }
  }

  /**
   * Load animations from an animation set definition.
   */
  loadAnimationSet(definition: AnimationSetDefinition): this {
    if (!this._spriteSheet) {
      console.warn('Cannot load animation set without a spritesheet')
      return this
    }

    const defaultFps = definition.fps ?? 12

    for (const [name, animDef] of Object.entries(definition.animations)) {
      const frames = animDef.frames
        .map((frameName, index) => {
          const spriteFrame = this._spriteSheet!.frames.get(frameName)
          if (!spriteFrame) {
            console.warn(`Frame not found in spritesheet: ${frameName}`)
            return null
          }

          return {
            frame: spriteFrame,
            duration: animDef.durations?.[index],
            event: animDef.events?.[index],
          }
        })
        .filter((f): f is NonNullable<typeof f> => f !== null)

      this.controller.addAnimation({
        name,
        frames,
        fps: animDef.fps ?? defaultFps,
        loop: animDef.loop ?? true,
        pingPong: animDef.pingPong ?? false,
      })
    }

    return this
  }

  /**
   * Add an animation.
   */
  addAnimation(animation: Animation): this {
    this.controller.addAnimation(animation)
    return this
  }

  /**
   * Add animation from frame names.
   */
  addAnimationFromFrames(
    name: string,
    frameNames: string[],
    options: { fps?: number; loop?: boolean; pingPong?: boolean } = {}
  ): this {
    if (!this._spriteSheet) {
      throw new Error('Cannot add animation from frames without a spritesheet')
    }

    const frames = frameNames.map((frameName) => {
      const frame = this._spriteSheet!.frames.get(frameName)
      if (!frame) {
        throw new Error(`Frame not found: ${frameName}`)
      }
      return { frame }
    })

    this.controller.addAnimation({
      name,
      frames,
      fps: options.fps ?? 12,
      loop: options.loop ?? true,
      pingPong: options.pingPong ?? false,
    })

    return this
  }

  /**
   * Play an animation.
   */
  play(name: string, options?: PlayOptions): this {
    this.controller.play(name, options)

    // Set initial frame
    const frame = this.controller.getCurrentFrame()
    if (frame) {
      this.setFrame(frame)
    }

    return this
  }

  /**
   * Pause the current animation.
   */
  pause(): this {
    this.controller.pause()
    return this
  }

  /**
   * Resume a paused animation.
   */
  resume(): this {
    this.controller.resume()
    return this
  }

  /**
   * Stop the current animation.
   */
  stop(): this {
    this.controller.stop()
    return this
  }

  /**
   * Go to a specific frame.
   */
  gotoFrame(index: number): this {
    this.controller.gotoFrame(index)
    const frame = this.controller.getCurrentFrame()
    if (frame) {
      this.setFrame(frame)
    }
    return this
  }

  /**
   * Update animation (call in render loop).
   * @param deltaMs Time since last frame in milliseconds
   */
  update(deltaMs: number): void {
    this.controller.update(
      deltaMs,
      (frame) => this.setFrame(frame),
      (event, frameIndex) => this.onAnimationEvent(event, frameIndex)
    )
  }

  /**
   * Override to handle animation events.
   */
  protected onAnimationEvent(_event: string, _frameIndex: number): void {
    // Override in subclass or use PlayOptions.onEvent
  }

  /**
   * Check if an animation is playing.
   */
  isPlaying(name?: string): boolean {
    return this.controller.isPlaying(name)
  }

  /**
   * Get current animation name.
   */
  get currentAnimation(): string | null {
    return this.controller.currentAnimation
  }

  /**
   * Get playback speed.
   */
  get speed(): number {
    return this.controller.getSpeed()
  }

  /**
   * Set playback speed.
   */
  set speed(value: number) {
    this.controller.setSpeed(value)
  }

  /**
   * Get animation duration.
   */
  getAnimationDuration(name?: string): number {
    const animName = name ?? this.currentAnimation
    if (!animName) return 0
    return this.controller.getAnimationDuration(animName)
  }

  /**
   * Clone the animated sprite.
   */
  override clone(recursive?: boolean): this {
    // Ignore recursive parameter - we create a fresh sprite
    void recursive

    if (!this._spriteSheet) {
      throw new Error('Cannot clone AnimatedSprite2D without a spritesheet')
    }

    // Get current animations
    const animations: Animation[] = []
    for (const name of this.controller.getAnimationNames()) {
      const anim = this.controller.getAnimation(name)
      if (anim) animations.push(anim)
    }

    const cloned = new AnimatedSprite2D({
      spriteSheet: this._spriteSheet,
      animations,
      animation: this.currentAnimation ?? undefined,
      anchor: this.anchor,
      tint: this.tint,
      alpha: this.alpha,
      flipX: this.flipX,
      flipY: this.flipY,
      layer: this.layer,
      zIndex: this.zIndex,
      pixelPerfect: this.pixelPerfect,
    })

    cloned.position.copy(this.position)
    cloned.rotation.copy(this.rotation)
    cloned.scale.copy(this.scale)

    // Clone effect instances from parent
    for (const effect of this._effects) {
      const EffectClass = (effect as any).constructor as { new (): any; _fields: any[]; effectName: string }
      const clonedEffect = new EffectClass()
      for (const field of EffectClass._fields) {
        const value = (effect as any)._defaults[field.name]
        if (typeof value === 'number') {
          clonedEffect._defaults[field.name] = value
        } else {
          clonedEffect._defaults[field.name] = [...value]
        }
      }
      cloned.addEffect(clonedEffect)
    }

    return cloned as this
  }

  /**
   * Dispose of resources.
   */
  override dispose(): void {
    this.controller.dispose()
    super.dispose()
  }
}
