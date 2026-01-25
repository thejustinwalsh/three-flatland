# M2: Animation System

## Milestone Overview

| Field | Value |
|-------|-------|
| **Duration** | 2 weeks |
| **Dependencies** | M1 (Core Sprites) |
| **Outputs** | AnimatedSprite2D, AnimationController, Animation definitions |
| **Risk Level** | Low |

---

## Objectives

1. Implement `AnimatedSprite2D` class extending Sprite2D
2. Create `AnimationController` for managing animation state
3. Support frame-based animations with timing control
4. Implement animation events (onComplete, onLoop, onFrame)
5. Support animation blending and transitions
6. Create animation definition format

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       ANIMATION SYSTEM ARCHITECTURE                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   AnimatedSprite2D (extends Sprite2D)                                       │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  • controller: AnimationController                                  │   │
│   │  • spriteSheet: SpriteSheet                                         │   │
│   │  • currentAnimation: string                                         │   │
│   │  • update(deltaMs): void                                            │   │
│   │  • play(name, options?): void                                       │   │
│   │  • pause(): void                                                    │   │
│   │  • stop(): void                                                     │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    │ uses                                   │
│                                    ▼                                        │
│   AnimationController                                                       │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  • animations: Map<string, Animation>                               │   │
│   │  • currentAnimation: Animation | null                               │   │
│   │  • currentFrame: number                                             │   │
│   │  • elapsed: number                                                  │   │
│   │  • speed: number                                                    │   │
│   │  • paused: boolean                                                  │   │
│   │  • Events: onComplete, onLoop, onFrame                              │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    │ contains                               │
│                                    ▼                                        │
│   Animation                                                                 │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  • name: string                                                     │   │
│   │  • frames: AnimationFrame[]                                         │   │
│   │  • loop: boolean                                                    │   │
│   │  • fps: number                                                      │   │
│   │  • duration: number (computed)                                      │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Detailed Implementation

### 1. Type Definitions

**packages/core/src/animation/types.ts:**

```typescript
import type { SpriteFrame } from '../sprites/types';

/**
 * A single frame in an animation sequence.
 */
export interface AnimationFrame {
  /** Reference to the sprite frame */
  frame: SpriteFrame;
  /** Duration of this frame in milliseconds (overrides animation fps) */
  duration?: number;
  /** Event to fire when this frame is reached */
  event?: string;
  /** Custom data attached to this frame */
  data?: Record<string, unknown>;
}

/**
 * Animation definition.
 */
export interface Animation {
  /** Animation name */
  name: string;
  /** Sequence of frames */
  frames: AnimationFrame[];
  /** Frames per second (default: 12) */
  fps?: number;
  /** Whether to loop (default: true) */
  loop?: boolean;
  /** Ping-pong animation (play forward then backward) */
  pingPong?: boolean;
  /** Number of times to loop (-1 for infinite, default) */
  loopCount?: number;
}

/**
 * Options for playing an animation.
 */
export interface PlayOptions {
  /** Start from a specific frame */
  startFrame?: number;
  /** Override loop setting */
  loop?: boolean;
  /** Override speed multiplier */
  speed?: number;
  /** Callback when animation completes (non-looping) */
  onComplete?: () => void;
  /** Callback on each loop */
  onLoop?: (loopCount: number) => void;
  /** Callback on frame change */
  onFrame?: (frameIndex: number, frame: AnimationFrame) => void;
  /** Callback on frame event */
  onEvent?: (event: string, frameIndex: number) => void;
}

/**
 * Animation controller state.
 */
export interface AnimationState {
  /** Current animation name */
  animation: string | null;
  /** Current frame index */
  frameIndex: number;
  /** Time elapsed in current frame (ms) */
  elapsed: number;
  /** Is animation playing */
  playing: boolean;
  /** Is animation paused */
  paused: boolean;
  /** Current loop count */
  loopCount: number;
  /** Speed multiplier */
  speed: number;
}

/**
 * Animation set definition (for loading from JSON).
 */
export interface AnimationSetDefinition {
  /** Default FPS for all animations */
  fps?: number;
  /** Animation definitions */
  animations: {
    [name: string]: {
      /** Frame names (from spritesheet) */
      frames: string[];
      /** Override FPS */
      fps?: number;
      /** Loop setting */
      loop?: boolean;
      /** Ping-pong */
      pingPong?: boolean;
      /** Per-frame durations (ms) */
      durations?: number[];
      /** Per-frame events */
      events?: { [frameIndex: number]: string };
    };
  };
}
```

---

### 2. AnimationController

**packages/core/src/animation/AnimationController.ts:**

```typescript
import type { Animation, AnimationFrame, AnimationState, PlayOptions } from './types';
import type { SpriteFrame } from '../sprites/types';

type FrameCallback = (frame: SpriteFrame) => void;
type EventCallback = (event: string, frameIndex: number) => void;

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
  private animations: Map<string, Animation> = new Map();
  private current: Animation | null = null;
  private frameIndex: number = 0;
  private elapsed: number = 0;
  private playing: boolean = false;
  private paused: boolean = false;
  private loopCount: number = 0;
  private speed: number = 1;
  private direction: 1 | -1 = 1; // For ping-pong

  // Current play options
  private options: PlayOptions = {};

  /**
   * Add an animation definition.
   */
  addAnimation(animation: Animation): this {
    this.animations.set(animation.name, animation);
    return this;
  }

  /**
   * Add multiple animations.
   */
  addAnimations(animations: Animation[]): this {
    for (const anim of animations) {
      this.addAnimation(anim);
    }
    return this;
  }

  /**
   * Remove an animation.
   */
  removeAnimation(name: string): this {
    this.animations.delete(name);
    if (this.current?.name === name) {
      this.stop();
    }
    return this;
  }

  /**
   * Get an animation by name.
   */
  getAnimation(name: string): Animation | undefined {
    return this.animations.get(name);
  }

  /**
   * Get all animation names.
   */
  getAnimationNames(): string[] {
    return Array.from(this.animations.keys());
  }

  /**
   * Play an animation.
   */
  play(name: string, options: PlayOptions = {}): this {
    const animation = this.animations.get(name);
    if (!animation) {
      console.warn(`Animation not found: ${name}`);
      return this;
    }

    // If same animation and already playing, optionally restart
    if (this.current?.name === name && this.playing && !this.paused) {
      if (options.startFrame === undefined) {
        return this; // Continue playing
      }
    }

    this.current = animation;
    this.frameIndex = options.startFrame ?? 0;
    this.elapsed = 0;
    this.playing = true;
    this.paused = false;
    this.loopCount = 0;
    this.speed = options.speed ?? 1;
    this.direction = 1;
    this.options = options;

    return this;
  }

  /**
   * Pause the current animation.
   */
  pause(): this {
    this.paused = true;
    return this;
  }

  /**
   * Resume a paused animation.
   */
  resume(): this {
    this.paused = false;
    return this;
  }

  /**
   * Stop the current animation.
   */
  stop(): this {
    this.playing = false;
    this.paused = false;
    this.current = null;
    this.frameIndex = 0;
    this.elapsed = 0;
    return this;
  }

  /**
   * Go to a specific frame.
   */
  gotoFrame(index: number): this {
    if (this.current && index >= 0 && index < this.current.frames.length) {
      this.frameIndex = index;
      this.elapsed = 0;
    }
    return this;
  }

  /**
   * Update animation state.
   * @param deltaMs Time since last update in milliseconds
   * @param onFrame Callback when frame changes
   * @param onEvent Callback when frame event fires
   */
  update(deltaMs: number, onFrame?: FrameCallback, onEvent?: EventCallback): void {
    if (!this.current || !this.playing || this.paused) {
      return;
    }

    const animation = this.current;
    const frames = animation.frames;
    const fps = animation.fps ?? 12;
    const loop = this.options.loop ?? animation.loop ?? true;
    const pingPong = animation.pingPong ?? false;
    const maxLoops = animation.loopCount ?? -1;

    // Calculate frame duration
    const currentAnimFrame = frames[this.frameIndex];
    const frameDuration = currentAnimFrame?.duration ?? (1000 / fps);

    // Accumulate time
    this.elapsed += deltaMs * this.speed;

    // Check if we need to advance frames
    while (this.elapsed >= frameDuration && this.playing) {
      this.elapsed -= frameDuration;

      // Determine next frame
      let nextFrame = this.frameIndex + this.direction;

      // Handle ping-pong
      if (pingPong) {
        if (nextFrame >= frames.length) {
          this.direction = -1;
          nextFrame = frames.length - 2;
        } else if (nextFrame < 0) {
          this.direction = 1;
          nextFrame = 1;
          this.handleLoopComplete(loop, maxLoops);
        }
      } else {
        // Handle normal loop/end
        if (nextFrame >= frames.length) {
          if (this.handleLoopComplete(loop, maxLoops)) {
            nextFrame = 0;
          } else {
            // Animation complete
            nextFrame = frames.length - 1;
            this.playing = false;
            this.options.onComplete?.();
          }
        }
      }

      // Apply frame change
      if (nextFrame !== this.frameIndex && this.playing) {
        this.frameIndex = nextFrame;

        const newFrame = frames[this.frameIndex];
        if (newFrame) {
          // Fire frame callback
          onFrame?.(newFrame.frame);
          this.options.onFrame?.(this.frameIndex, newFrame);

          // Fire event if present
          if (newFrame.event) {
            onEvent?.(newFrame.event, this.frameIndex);
            this.options.onEvent?.(newFrame.event, this.frameIndex);
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
      return false;
    }

    this.loopCount++;
    this.options.onLoop?.(this.loopCount);

    if (maxLoops !== -1 && this.loopCount >= maxLoops) {
      return false;
    }

    return true;
  }

  /**
   * Get current frame.
   */
  getCurrentFrame(): SpriteFrame | null {
    if (!this.current || this.frameIndex >= this.current.frames.length) {
      return null;
    }
    return this.current.frames[this.frameIndex]?.frame ?? null;
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
    };
  }

  /**
   * Check if an animation is playing.
   */
  isPlaying(name?: string): boolean {
    if (name) {
      return this.playing && !this.paused && this.current?.name === name;
    }
    return this.playing && !this.paused;
  }

  /**
   * Get current animation name.
   */
  get currentAnimation(): string | null {
    return this.current?.name ?? null;
  }

  /**
   * Get/set playback speed.
   */
  getSpeed(): number {
    return this.speed;
  }

  setSpeed(speed: number): this {
    this.speed = speed;
    return this;
  }

  /**
   * Get animation duration in milliseconds.
   */
  getAnimationDuration(name: string): number {
    const animation = this.animations.get(name);
    if (!animation) return 0;

    const fps = animation.fps ?? 12;
    const defaultDuration = 1000 / fps;

    return animation.frames.reduce((total, frame) => {
      return total + (frame.duration ?? defaultDuration);
    }, 0);
  }

  /**
   * Dispose of resources.
   */
  dispose(): void {
    this.animations.clear();
    this.current = null;
    this.options = {};
  }
}
```

---

### 3. AnimatedSprite2D

**packages/core/src/sprites/AnimatedSprite2D.ts:**

```typescript
import { Sprite2D } from './Sprite2D';
import { AnimationController } from '../animation/AnimationController';
import type { Sprite2DOptions, SpriteSheet, SpriteFrame } from './types';
import type { Animation, AnimationSetDefinition, PlayOptions } from '../animation/types';

export interface AnimatedSprite2DOptions extends Omit<Sprite2DOptions, 'frame'> {
  /** SpriteSheet containing animation frames */
  spriteSheet: SpriteSheet;
  /** Animation definitions */
  animations?: Animation[];
  /** Animation set definition (alternative to animations array) */
  animationSet?: AnimationSetDefinition;
  /** Initial animation to play */
  animation?: string;
  /** Auto-play on creation */
  autoPlay?: boolean;
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
  readonly controller: AnimationController;

  /** Source spritesheet */
  private _spriteSheet: SpriteSheet;

  constructor(options: AnimatedSprite2DOptions) {
    // Get initial frame
    const firstFrame = options.spriteSheet.frames.values().next().value;

    super({
      ...options,
      texture: options.spriteSheet.texture,
      frame: firstFrame,
    });

    this._spriteSheet = options.spriteSheet;
    this.controller = new AnimationController();

    // Add animations
    if (options.animations) {
      this.controller.addAnimations(options.animations);
    }

    if (options.animationSet) {
      this.loadAnimationSet(options.animationSet);
    }

    // Play initial animation
    if (options.animation) {
      this.play(options.animation);
    } else if (options.autoPlay !== false) {
      // Auto-play first animation if available
      const names = this.controller.getAnimationNames();
      if (names.length > 0) {
        this.play(names[0]!);
      }
    }

    this.name = 'AnimatedSprite2D';
  }

  /**
   * Get the spritesheet.
   */
  get spriteSheet(): SpriteSheet {
    return this._spriteSheet;
  }

  /**
   * Set a new spritesheet.
   */
  set spriteSheet(value: SpriteSheet) {
    this._spriteSheet = value;
    this.texture = value.texture;
  }

  /**
   * Load animations from an animation set definition.
   */
  loadAnimationSet(definition: AnimationSetDefinition): this {
    const defaultFps = definition.fps ?? 12;

    for (const [name, animDef] of Object.entries(definition.animations)) {
      const frames = animDef.frames.map((frameName, index) => {
        const spriteFrame = this._spriteSheet.frames.get(frameName);
        if (!spriteFrame) {
          console.warn(`Frame not found in spritesheet: ${frameName}`);
          return null;
        }

        return {
          frame: spriteFrame,
          duration: animDef.durations?.[index],
          event: animDef.events?.[index],
        };
      }).filter((f): f is NonNullable<typeof f> => f !== null);

      this.controller.addAnimation({
        name,
        frames,
        fps: animDef.fps ?? defaultFps,
        loop: animDef.loop ?? true,
        pingPong: animDef.pingPong ?? false,
      });
    }

    return this;
  }

  /**
   * Add an animation.
   */
  addAnimation(animation: Animation): this {
    this.controller.addAnimation(animation);
    return this;
  }

  /**
   * Add animation from frame names.
   */
  addAnimationFromFrames(
    name: string,
    frameNames: string[],
    options: { fps?: number; loop?: boolean; pingPong?: boolean } = {}
  ): this {
    const frames = frameNames.map((frameName) => {
      const frame = this._spriteSheet.frames.get(frameName);
      if (!frame) {
        throw new Error(`Frame not found: ${frameName}`);
      }
      return { frame };
    });

    this.controller.addAnimation({
      name,
      frames,
      fps: options.fps ?? 12,
      loop: options.loop ?? true,
      pingPong: options.pingPong ?? false,
    });

    return this;
  }

  /**
   * Play an animation.
   */
  play(name: string, options?: PlayOptions): this {
    this.controller.play(name, options);

    // Set initial frame
    const frame = this.controller.getCurrentFrame();
    if (frame) {
      this.setFrame(frame);
    }

    return this;
  }

  /**
   * Pause the current animation.
   */
  pause(): this {
    this.controller.pause();
    return this;
  }

  /**
   * Resume a paused animation.
   */
  resume(): this {
    this.controller.resume();
    return this;
  }

  /**
   * Stop the current animation.
   */
  stop(): this {
    this.controller.stop();
    return this;
  }

  /**
   * Go to a specific frame.
   */
  gotoFrame(index: number): this {
    this.controller.gotoFrame(index);
    const frame = this.controller.getCurrentFrame();
    if (frame) {
      this.setFrame(frame);
    }
    return this;
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
    );
  }

  /**
   * Override to handle animation events.
   */
  protected onAnimationEvent(event: string, frameIndex: number): void {
    // Override in subclass or attach listener
  }

  /**
   * Check if an animation is playing.
   */
  isPlaying(name?: string): boolean {
    return this.controller.isPlaying(name);
  }

  /**
   * Get current animation name.
   */
  get currentAnimation(): string | null {
    return this.controller.currentAnimation;
  }

  /**
   * Get/set playback speed.
   */
  get speed(): number {
    return this.controller.getSpeed();
  }

  set speed(value: number) {
    this.controller.setSpeed(value);
  }

  /**
   * Get animation duration.
   */
  getAnimationDuration(name?: string): number {
    const animName = name ?? this.currentAnimation;
    if (!animName) return 0;
    return this.controller.getAnimationDuration(animName);
  }

  /**
   * Clone the animated sprite.
   */
  clone(): AnimatedSprite2D {
    // Get current animations
    const animations: Animation[] = [];
    for (const name of this.controller.getAnimationNames()) {
      const anim = this.controller.getAnimation(name);
      if (anim) animations.push(anim);
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
    });

    cloned.position.copy(this.position);
    cloned.rotation.copy(this.rotation);
    cloned.scale.copy(this.scale);

    return cloned;
  }

  /**
   * Dispose of resources.
   */
  dispose(): void {
    this.controller.dispose();
    super.dispose();
  }
}
```

---

### 4. Animation Utilities

**packages/core/src/animation/utils.ts:**

```typescript
import type { SpriteSheet } from '../sprites/types';
import type { Animation, AnimationFrame } from './types';

/**
 * Create an animation from a frame name pattern.
 *
 * @example
 * ```typescript
 * // Creates animation from 'player_walk_0', 'player_walk_1', etc.
 * const walkAnim = createAnimationFromPattern(sheet, 'walk', 'player_walk_', 4);
 * ```
 */
export function createAnimationFromPattern(
  spriteSheet: SpriteSheet,
  name: string,
  prefix: string,
  count: number,
  options: {
    fps?: number;
    loop?: boolean;
    pingPong?: boolean;
    startIndex?: number;
    suffix?: string;
  } = {}
): Animation {
  const frames: AnimationFrame[] = [];
  const startIndex = options.startIndex ?? 0;
  const suffix = options.suffix ?? '';

  for (let i = 0; i < count; i++) {
    const frameName = `${prefix}${startIndex + i}${suffix}`;
    const frame = spriteSheet.frames.get(frameName);

    if (!frame) {
      console.warn(`Frame not found: ${frameName}`);
      continue;
    }

    frames.push({ frame });
  }

  return {
    name,
    frames,
    fps: options.fps ?? 12,
    loop: options.loop ?? true,
    pingPong: options.pingPong ?? false,
  };
}

/**
 * Create animations from a naming convention.
 * Assumes frames are named: `{prefix}_{animationName}_{frameIndex}`
 *
 * @example
 * ```typescript
 * // Auto-detect animations from frames like 'player_idle_0', 'player_walk_0', etc.
 * const animations = createAnimationsFromNaming(sheet, 'player');
 * ```
 */
export function createAnimationsFromNaming(
  spriteSheet: SpriteSheet,
  prefix: string,
  options: { fps?: number; loop?: boolean } = {}
): Animation[] {
  const animationFrames = new Map<string, AnimationFrame[]>();

  for (const [frameName, spriteFrame] of spriteSheet.frames) {
    // Match pattern: prefix_animName_frameIndex
    const pattern = new RegExp(`^${prefix}_([a-zA-Z]+)_(\\d+)$`);
    const match = frameName.match(pattern);

    if (match) {
      const [, animName, frameIndex] = match;
      if (!animationFrames.has(animName!)) {
        animationFrames.set(animName!, []);
      }
      // Store with index for sorting
      const frames = animationFrames.get(animName!)!;
      frames[parseInt(frameIndex!, 10)] = { frame: spriteFrame };
    }
  }

  return Array.from(animationFrames.entries()).map(([name, frames]) => ({
    name,
    frames: frames.filter(Boolean), // Remove empty slots
    fps: options.fps ?? 12,
    loop: options.loop ?? true,
  }));
}

/**
 * Create a simple animation from an array of frame names.
 */
export function createAnimation(
  spriteSheet: SpriteSheet,
  name: string,
  frameNames: string[],
  options: { fps?: number; loop?: boolean; pingPong?: boolean } = {}
): Animation {
  const frames: AnimationFrame[] = frameNames.map((frameName) => {
    const frame = spriteSheet.frames.get(frameName);
    if (!frame) {
      throw new Error(`Frame not found: ${frameName}`);
    }
    return { frame };
  });

  return {
    name,
    frames,
    fps: options.fps ?? 12,
    loop: options.loop ?? true,
    pingPong: options.pingPong ?? false,
  };
}

/**
 * Reverse an animation's frame order.
 */
export function reverseAnimation(animation: Animation, newName?: string): Animation {
  return {
    ...animation,
    name: newName ?? `${animation.name}_reverse`,
    frames: [...animation.frames].reverse(),
  };
}

/**
 * Concatenate multiple animations into one.
 */
export function concatAnimations(
  name: string,
  animations: Animation[],
  options: { fps?: number; loop?: boolean } = {}
): Animation {
  const frames = animations.flatMap((anim) => anim.frames);

  return {
    name,
    frames,
    fps: options.fps ?? animations[0]?.fps ?? 12,
    loop: options.loop ?? false,
  };
}
```

---

### 5. Exports

**packages/core/src/animation/index.ts:**

```typescript
export { AnimationController } from './AnimationController';
export {
  createAnimationFromPattern,
  createAnimationsFromNaming,
  createAnimation,
  reverseAnimation,
  concatAnimations,
} from './utils';
export type {
  Animation,
  AnimationFrame,
  AnimationState,
  AnimationSetDefinition,
  PlayOptions,
} from './types';
```

**packages/core/src/sprites/index.ts (updated):**

```typescript
export { Sprite2D } from './Sprite2D';
export { AnimatedSprite2D } from './AnimatedSprite2D';
export type {
  Sprite2DOptions,
  SpriteFrame,
  SpriteSheet,
  SpriteSheetJSONHash,
  SpriteSheetJSONArray,
} from './types';
export type { AnimatedSprite2DOptions } from './AnimatedSprite2D';
```

**packages/core/src/index.ts (updated):**

```typescript
export const VERSION = '0.2.0';

// Sprites
export * from './sprites';

// Animation
export * from './animation';

// Materials
export * from './materials';

// Loaders
export * from './loaders';

// Constants
export const Layers = {
  BACKGROUND: 0,
  GROUND: 1,
  SHADOWS: 2,
  ENTITIES: 3,
  EFFECTS: 4,
  FOREGROUND: 5,
  UI: 6,
} as const;

export type Layer = (typeof Layers)[keyof typeof Layers];
```

---

### 6. React Integration Updates

**packages/react/src/extend.ts (updated):**

```typescript
import { extend } from '@react-three/fiber';
import {
  Sprite2D,
  Sprite2DMaterial,
  AnimatedSprite2D,
} from '@three-flatland/core';

export function extendSprite2D() {
  extend({ Sprite2D });
}

export function extendAnimatedSprite2D() {
  extend({ AnimatedSprite2D });
}

export function extendSprite2DMaterial() {
  extend({ Sprite2DMaterial });
}

export function extendAll() {
  extend({
    Sprite2D,
    Sprite2DMaterial,
    AnimatedSprite2D,
  });
}
```

**packages/react/src/types.ts (updated):**

```typescript
import type { Object3DNode, MaterialNode } from '@react-three/fiber';
import type { Sprite2D, Sprite2DMaterial, AnimatedSprite2D } from '@three-flatland/core';

declare module '@react-three/fiber' {
  interface ThreeElements {
    sprite2D: Object3DNode<Sprite2D, typeof Sprite2D>;
    sprite2DMaterial: MaterialNode<Sprite2DMaterial, typeof Sprite2DMaterial>;
    animatedSprite2D: Object3DNode<AnimatedSprite2D, typeof AnimatedSprite2D>;
  }
}
```

---

### 7. Tests

**packages/core/src/animation/AnimationController.test.ts:**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AnimationController } from './AnimationController';
import type { Animation, AnimationFrame } from './types';

describe('AnimationController', () => {
  let controller: AnimationController;
  let mockFrames: AnimationFrame[];
  let animation: Animation;

  beforeEach(() => {
    controller = new AnimationController();
    mockFrames = [
      { frame: { name: 'frame0', x: 0, y: 0, width: 0.25, height: 0.25, sourceWidth: 32, sourceHeight: 32 } },
      { frame: { name: 'frame1', x: 0.25, y: 0, width: 0.25, height: 0.25, sourceWidth: 32, sourceHeight: 32 } },
      { frame: { name: 'frame2', x: 0.5, y: 0, width: 0.25, height: 0.25, sourceWidth: 32, sourceHeight: 32 } },
      { frame: { name: 'frame3', x: 0.75, y: 0, width: 0.25, height: 0.25, sourceWidth: 32, sourceHeight: 32 } },
    ];
    animation = {
      name: 'test',
      frames: mockFrames,
      fps: 10, // 100ms per frame
      loop: true,
    };
    controller.addAnimation(animation);
  });

  it('should add and retrieve animations', () => {
    expect(controller.getAnimation('test')).toBe(animation);
    expect(controller.getAnimationNames()).toContain('test');
  });

  it('should play an animation', () => {
    controller.play('test');
    expect(controller.isPlaying('test')).toBe(true);
    expect(controller.currentAnimation).toBe('test');
  });

  it('should advance frames over time', () => {
    const onFrame = vi.fn();
    controller.play('test');

    // Frame 0 -> 1 (after 100ms)
    controller.update(100, onFrame);
    expect(onFrame).toHaveBeenCalledTimes(1);
    expect(controller.getState().frameIndex).toBe(1);

    // Frame 1 -> 2 (after another 100ms)
    controller.update(100, onFrame);
    expect(onFrame).toHaveBeenCalledTimes(2);
    expect(controller.getState().frameIndex).toBe(2);
  });

  it('should loop correctly', () => {
    const onLoop = vi.fn();
    controller.play('test', { onLoop });

    // Advance through all 4 frames (400ms total at 10fps)
    controller.update(400);
    expect(controller.getState().frameIndex).toBe(0); // Looped back
    expect(onLoop).toHaveBeenCalledWith(1);
  });

  it('should stop at end when not looping', () => {
    const onComplete = vi.fn();
    const nonLooping: Animation = { ...animation, loop: false };
    controller.addAnimation(nonLooping);
    controller.play('test', { loop: false, onComplete });

    controller.update(400);
    expect(controller.isPlaying()).toBe(false);
    expect(onComplete).toHaveBeenCalled();
  });

  it('should pause and resume', () => {
    controller.play('test');
    controller.pause();
    expect(controller.getState().paused).toBe(true);

    controller.resume();
    expect(controller.getState().paused).toBe(false);
  });

  it('should handle speed multiplier', () => {
    const onFrame = vi.fn();
    controller.play('test', { speed: 2 });

    // At 2x speed, 50ms should advance a frame
    controller.update(50, onFrame);
    expect(onFrame).toHaveBeenCalledTimes(1);
  });

  it('should support ping-pong animation', () => {
    const pingPongAnim: Animation = {
      name: 'pingpong',
      frames: mockFrames,
      fps: 10,
      loop: true,
      pingPong: true,
    };
    controller.addAnimation(pingPongAnim);
    controller.play('pingpong');

    // Forward: 0 -> 1 -> 2 -> 3
    controller.update(300);
    expect(controller.getState().frameIndex).toBe(3);

    // Backward: 3 -> 2 -> 1
    controller.update(200);
    expect(controller.getState().frameIndex).toBe(1);
  });

  it('should fire frame events', () => {
    const onEvent = vi.fn();
    const eventAnim: Animation = {
      name: 'events',
      frames: [
        { frame: mockFrames[0]!.frame },
        { frame: mockFrames[1]!.frame, event: 'footstep' },
        { frame: mockFrames[2]!.frame },
      ],
      fps: 10,
      loop: false,
    };
    controller.addAnimation(eventAnim);
    controller.play('events', { onEvent });

    controller.update(100); // Frame 1 with event
    expect(onEvent).toHaveBeenCalledWith('footstep', 1);
  });
});
```

**packages/core/src/sprites/AnimatedSprite2D.test.ts:**

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Texture } from 'three';
import { AnimatedSprite2D } from './AnimatedSprite2D';
import type { SpriteSheet } from './types';

describe('AnimatedSprite2D', () => {
  let spriteSheet: SpriteSheet;

  beforeEach(() => {
    const texture = new Texture();
    texture.image = { width: 128, height: 128 };

    spriteSheet = {
      texture,
      frames: new Map([
        ['idle_0', { name: 'idle_0', x: 0, y: 0, width: 0.25, height: 0.25, sourceWidth: 32, sourceHeight: 32 }],
        ['idle_1', { name: 'idle_1', x: 0.25, y: 0, width: 0.25, height: 0.25, sourceWidth: 32, sourceHeight: 32 }],
        ['walk_0', { name: 'walk_0', x: 0, y: 0.25, width: 0.25, height: 0.25, sourceWidth: 32, sourceHeight: 32 }],
        ['walk_1', { name: 'walk_1', x: 0.25, y: 0.25, width: 0.25, height: 0.25, sourceWidth: 32, sourceHeight: 32 }],
      ]),
      width: 128,
      height: 128,
      getFrame(name) {
        const frame = this.frames.get(name);
        if (!frame) throw new Error(`Frame not found: ${name}`);
        return frame;
      },
      getFrameNames() {
        return Array.from(this.frames.keys());
      },
    };
  });

  it('should create with animation set', () => {
    const sprite = new AnimatedSprite2D({
      spriteSheet,
      animationSet: {
        animations: {
          idle: { frames: ['idle_0', 'idle_1'], fps: 8 },
          walk: { frames: ['walk_0', 'walk_1'], fps: 12 },
        },
      },
    });

    expect(sprite.controller.getAnimationNames()).toContain('idle');
    expect(sprite.controller.getAnimationNames()).toContain('walk');
  });

  it('should play animation', () => {
    const sprite = new AnimatedSprite2D({
      spriteSheet,
      animationSet: {
        animations: {
          idle: { frames: ['idle_0', 'idle_1'], fps: 8 },
        },
      },
    });

    sprite.play('idle');
    expect(sprite.isPlaying('idle')).toBe(true);
    expect(sprite.currentAnimation).toBe('idle');
  });

  it('should update frame on tick', () => {
    const sprite = new AnimatedSprite2D({
      spriteSheet,
      animationSet: {
        animations: {
          idle: { frames: ['idle_0', 'idle_1'], fps: 10 }, // 100ms per frame
        },
      },
      animation: 'idle',
    });

    const initialFrame = sprite.frame;
    sprite.update(150); // Should advance to frame 1
    expect(sprite.frame).not.toEqual(initialFrame);
  });

  it('should clone correctly', () => {
    const sprite = new AnimatedSprite2D({
      spriteSheet,
      animationSet: {
        animations: {
          idle: { frames: ['idle_0', 'idle_1'] },
        },
      },
      animation: 'idle',
    });

    const cloned = sprite.clone();
    expect(cloned.controller.getAnimationNames()).toContain('idle');
    expect(cloned.currentAnimation).toBe('idle');
  });
});
```

---

## Acceptance Criteria

- [x] `AnimatedSprite2D` plays animations correctly
- [x] Frame timing is accurate (fps-based and per-frame duration)
- [x] Loop, ping-pong, and single-play modes work
- [x] Animation events fire at correct frames
- [x] Speed multiplier affects playback
- [x] Pause/resume works correctly
- [x] Animation utilities create animations from patterns
- [x] R3F integration works (`<animatedSprite2D />`)
- [x] All tests pass (55 tests)
- [x] TypeScript types are correct and complete

---

## Example Usage

**Vanilla Three.js:**

```typescript
import * as THREE from 'three/webgpu';
import {
  AnimatedSprite2D,
  SpriteSheetLoader,
  Layers,
} from '@three-flatland/core';

const sheet = await SpriteSheetLoader.load('/sprites/player.json');

const player = new AnimatedSprite2D({
  spriteSheet: sheet,
  animationSet: {
    animations: {
      idle: { frames: ['player_idle_0', 'player_idle_1', 'player_idle_2'], fps: 8 },
      walk: { frames: ['player_walk_0', 'player_walk_1', 'player_walk_2', 'player_walk_3'], fps: 12 },
      attack: { frames: ['player_attack_0', 'player_attack_1', 'player_attack_2'], fps: 15, loop: false },
    },
  },
  animation: 'idle',
  layer: Layers.ENTITIES,
});

// Play with callback
player.play('attack', {
  onComplete: () => player.play('idle'),
  onEvent: (event) => {
    if (event === 'hit') dealDamage();
  },
});

// Update loop
function animate(time) {
  const delta = clock.getDelta() * 1000;
  player.update(delta);
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
```

**React Three Fiber:**

```tsx
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  extendAnimatedSprite2D,
  useResource,
  spriteSheet,
  Layers,
} from '@three-flatland/react';
import type { AnimatedSprite2D } from '@three-flatland/core';

extendAnimatedSprite2D();

const playerSheet = spriteSheet('/sprites/player.json');

function Player() {
  const ref = useRef<AnimatedSprite2D>(null);
  const sheet = useResource(playerSheet);

  useFrame((_, delta) => {
    ref.current?.update(delta * 1000);
  });

  return (
    <animatedSprite2D
      ref={ref}
      spriteSheet={sheet}
      animationSet={{
        animations: {
          idle: { frames: ['player_idle_0', 'player_idle_1'], fps: 8 },
          walk: { frames: ['player_walk_0', 'player_walk_1'], fps: 12 },
        },
      }}
      animation="idle"
      layer={Layers.ENTITIES}
      position={[400, 300, 0]}
    />
  );
}
```

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Frame timing drift | Low | Medium | Use accumulated time, not incremental |
| Performance with many sprites | Medium | Medium | Optimize controller update path |
| Complex animation state | Low | Low | Keep state machine simple |

---

## Dependencies for Next Milestone

M3 (2D Render Pipeline) requires:
- ✅ Sprite2D with layer/zIndex
- ✅ AnimatedSprite2D (for animated entities)

---

## Estimated Effort

| Task | Hours |
|------|-------|
| Type definitions | 2 |
| AnimationController | 6 |
| AnimatedSprite2D | 4 |
| Animation utilities | 3 |
| React integration | 2 |
| Tests | 4 |
| Examples | 2 |
| Documentation | 2 |
| **Total** | **25 hours** (~1.5 weeks) |

---

*End of M2: Animation System*
