import type { Color, Vector2 } from 'three'
import { Sprite2D } from './Sprite2D'
import { AnimationController } from '../animation/AnimationController'
import type { Sprite2DMaterial } from '../materials/Sprite2DMaterial'
import type { MaterialEffect } from '../materials/MaterialEffect'
import type { SpriteSheet, SpriteAnimation } from './types'
import type { Animation, AnimationSetDefinition, PlayOptions } from '../animation/types'
import { DeferredProps, deferredProps } from '../mixins/DeferredProps'

/**
 * Options for creating an AnimatedSprite2D.
 */
export interface AnimatedSprite2DOptions {
  /** SpriteSheet containing animation frames */
  spriteSheet: SpriteSheet
  /** Custom material (sprites with same material instance batch together) */
  material?: Sprite2DMaterial
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
  /** Render layer (for SpriteGroup) */
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
export class AnimatedSprite2D extends DeferredProps(Sprite2D) {
  /** Animation controller */
  readonly controller: AnimationController

  /**
   * Reactive props installed by the `DeferredProps` mixin's
   * `deferredProps()` call below. `declare` keeps these in the type
   * system without emitting class fields that would shadow the
   * runtime accessors. R3F's `ThreeElement<typeof AnimatedSprite2D>`
   * picks them up for JSX prop typing — `<animatedSprite2D
   * spriteSheet={sheet} animation="idle" />` typechecks against
   * these declarations.
   */
  declare spriteSheet:  SpriteSheet | null
  declare animationSet: AnimationSetDefinition | null
  declare animation:    string | null

  /**
   * Create a new AnimatedSprite2D.
   * Can be called with no arguments for R3F compatibility — properties
   * will be set via the mixin's reactive setters during reconciliation.
   */
  constructor(options?: AnimatedSprite2DOptions) {
    // Initial frame seeded from the spritesheet if available; otherwise
    // the deferred action picks the first frame on the first run.
    const firstFrame = options?.spriteSheet?.frames.values().next().value

    super({
      texture: options?.spriteSheet?.texture,
      material: options?.material,
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

    // Track which sheet/animationSet pair has already been loaded
    // into the controller so changing only `animation` (e.g. swapping
    // from 'idle' to 'run') doesn't re-build the controller's
    // animation table on every prop tick.
    let loadedSheet: SpriteSheet | null = null
    let loadedSet: AnimationSetDefinition | null = null
    const autoPlay = options?.autoPlay !== false

    // Atomic group: `spriteSheet` + `animationSet` + `animation`.
    // `deferredProps` installs reactive accessors on `this` for each
    // key (so R3F's prop walk fires the action) and returns a typed
    // proxy (`this._anim.foo` is equivalent to `this.foo` —
    // both route through the same group state). The action fires
    // eagerly on each setter call; the `DeferredProps` mixin's
    // `updateMatrix` override forces a deferred-default settle pass
    // on first frame for cases where no setter ever fires it.
    this._anim = deferredProps(
      this,
      {
        spriteSheet:  null as SpriteSheet | null,
        animationSet: null as AnimationSetDefinition | null,
        animation:    null as string | null,
      },
      (props, prev) => {
        // 1. Sheet swap → swap texture and seed the initial frame.
        if (props.spriteSheet !== prev?.spriteSheet) {
          if (props.spriteSheet) {
            this.texture = props.spriteSheet.texture
            if (!this.frame) {
              const first = props.spriteSheet.frames.values().next().value
              if (first) this.setFrame(first)
            }
          }
        }

        // 2. Sheet OR animationSet change → re-load the controller.
        //    `animationSet ?? sheet.animations` lets a caller pass an
        //    explicit set OR rely on whatever the sheet ships with.
        const sheet = props.spriteSheet
        const setChanged =
          sheet != null &&
          (sheet !== loadedSheet || props.animationSet !== loadedSet)
        if (setChanged) {
          // Synthetic sheets (test fixtures, hand-built) may omit
          // `animations` — guarded so the fallback stays safe.
          const def =
            props.animationSet ??
            (sheet.animations && sheet.animations.size > 0
              ? sheetAnimationsToDefinition(sheet.animations)
              : null)
          if (def) {
            // Drop existing animations so a sheet swap can't leave
            // stale entries from the previous source. `addAnimation`
            // is a Map.set so same-name overwrites would be fine for
            // a partial overlap, but a sheet with FEWER animations
            // than the previous one would otherwise leave orphans.
            for (const name of this.controller.getAnimationNames()) {
              this.controller.removeAnimation(name)
            }
            this._loadAnimationSetInternal(sheet, def)
            loadedSheet = sheet
            loadedSet = props.animationSet
          }

          // Auto-play the first animation if no explicit `animation`
          // prop has arrived yet — preserves the previous constructor
          // behavior for `autoPlay !== false`.
          if (autoPlay && !props.animation) {
            const names = this.controller.getAnimationNames()
            if (names.length > 0 && this.controller.currentAnimation == null) {
              this.play(names[0]!)
            }
          }
        }

        // 3. Animation prop change → play that animation. Defensive:
        //    only `play()` if the name is already registered, so this
        //    is no-op when the controller hasn't loaded yet (the next
        //    cycle, after sheet/set arrive, will retry).
        if (props.animation && props.animation !== prev?.animation) {
          if (this.controller.getAnimationNames().includes(props.animation)) {
            this.play(props.animation)
          }
        }
      },
    )

    // Apply constructor options. Each assignment flows through the
    // factory-installed reactive setter, which fires the action with
    // the new values. Non-reactive options (animations[]) are
    // applied separately.
    if (options) {
      if (options.animations) {
        this.controller.addAnimations(options.animations)
      }
      if (options.spriteSheet  !== undefined) this.spriteSheet  = options.spriteSheet
      if (options.animationSet !== undefined) this.animationSet = options.animationSet
      if (options.animation    !== undefined) this.animation    = options.animation
    }
  }

  /**
   * Typed proxy for the spriteSheet/animationSet/animation group.
   * Internal class code can read/write through here for
   * organizational clarity (`this._anim.spriteSheet = sheet` reads as
   * "the animation group's sheet"). Equivalent to the auto-installed
   * accessors on `this` — both paths route through the same group
   * state.
   */
  private _anim: {
    spriteSheet:  SpriteSheet | null
    animationSet: AnimationSetDefinition | null
    animation:    string | null
  }

  /**
   * Load an `AnimationSetDefinition` into the controller using the
   * given sheet. Internal helper used by the deferred action; the
   * public path is `this.spriteSheet = sheet; this.animationSet = set`.
   */
  private _loadAnimationSetInternal(sheet: SpriteSheet, definition: AnimationSetDefinition): void {
    const defaultFps = definition.fps ?? 12
    for (const [name, animDef] of Object.entries(definition.animations)) {
      const frames = animDef.frames
        .map((frameName, index) => {
          const spriteFrame = sheet.frames.get(frameName)
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
  }

  /**
   * Imperative variant of the prop-driven path: load animations from
   * an explicit definition. Useful when the caller wants to layer
   * animations on top of what the sheet ships with, or replace them
   * after construction. Requires `spriteSheet` to be set.
   */
  loadAnimationSet(definition: AnimationSetDefinition): this {
    if (!this.spriteSheet) {
      console.warn('Cannot load animation set without a spritesheet')
      return this
    }
    this._loadAnimationSetInternal(this.spriteSheet, definition)
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
    const sheet = this.spriteSheet
    if (!sheet) {
      throw new Error('Cannot add animation from frames without a spritesheet')
    }

    const frames = frameNames.map((frameName) => {
      const frame = sheet.frames.get(frameName)
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

    const sheet = this.spriteSheet
    if (!sheet) {
      throw new Error('Cannot clone AnimatedSprite2D without a spritesheet')
    }

    // Get current animations
    const animations: Animation[] = []
    for (const name of this.controller.getAnimationNames()) {
      const anim = this.controller.getAnimation(name)
      if (anim) animations.push(anim)
    }

    const cloned = new AnimatedSprite2D({
      spriteSheet: sheet,
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
      const EffectClass = effect.constructor as { new (): MaterialEffect; _fields: typeof MaterialEffect._fields }
      const clonedEffect = new EffectClass()
      for (const field of EffectClass._fields) {
        const value = effect._defaults[field.name]!
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
   *
   * Chain: AnimatedSprite2D.dispose() → DeferredProps mixin's dispose
   * (clears the reactive registration so the captured action closure
   * is GC-eligible) → Sprite2D.dispose() (geometry/material teardown).
   */
  override dispose(): void {
    this.controller.dispose()
    super.dispose()
  }
}

/**
 * Convert the runtime `SpriteSheet.animations` map into the
 * `AnimationSetDefinition` shape the controller expects. Used by the
 * deferred action's "no animationSet → fall back to sheet" branch.
 */
function sheetAnimationsToDefinition(
  animations: ReadonlyMap<string, SpriteAnimation>,
): AnimationSetDefinition {
  const out: AnimationSetDefinition['animations'] = {}
  for (const [name, anim] of animations) {
    out[name] = {
      frames: [...anim.frames],
      fps: anim.fps,
      loop: anim.loop,
      pingPong: anim.pingPong,
      ...(anim.events ? { events: stringKeysToNumberKeys(anim.events) } : {}),
    }
  }
  return { animations: out }
}

/**
 * `SpriteAnimation.events` is keyed by stringified frame index
 * (matching the JSON schema), but `AnimationSetDefinition` keys
 * events by number. Convert at the boundary.
 */
function stringKeysToNumberKeys(events: Record<string, string>): Record<number, string> {
  const out: Record<number, string> = {}
  for (const [k, v] of Object.entries(events)) {
    const n = Number(k)
    if (Number.isFinite(n)) out[n] = v
  }
  return out
}
