import type { SpriteFrame } from '../sprites/types'

/**
 * A single frame in an animation sequence.
 */
export interface AnimationFrame {
  /** Reference to the sprite frame */
  frame: SpriteFrame
  /** Duration of this frame in milliseconds (overrides animation fps) */
  duration?: number
  /** Event to fire when this frame is reached */
  event?: string
  /** Custom data attached to this frame */
  data?: Record<string, unknown>
}

/**
 * Animation definition.
 */
export interface Animation {
  /** Animation name */
  name: string
  /** Sequence of frames */
  frames: AnimationFrame[]
  /** Frames per second (default: 12) */
  fps?: number
  /** Whether to loop (default: true) */
  loop?: boolean
  /** Ping-pong animation (play forward then backward) */
  pingPong?: boolean
  /** Number of times to loop (-1 for infinite, default) */
  loopCount?: number
}

/**
 * Options for playing an animation.
 */
export interface PlayOptions {
  /** Start from a specific frame */
  startFrame?: number
  /** Override loop setting */
  loop?: boolean
  /** Override speed multiplier */
  speed?: number
  /** Callback when animation completes (non-looping) */
  onComplete?: () => void
  /** Callback on each loop */
  onLoop?: (loopCount: number) => void
  /** Callback on frame change */
  onFrame?: (frameIndex: number, frame: AnimationFrame) => void
  /** Callback on frame event */
  onEvent?: (event: string, frameIndex: number) => void
}

/**
 * Animation controller state.
 */
export interface AnimationState {
  /** Current animation name */
  animation: string | null
  /** Current frame index */
  frameIndex: number
  /** Time elapsed in current frame (ms) */
  elapsed: number
  /** Is animation playing */
  playing: boolean
  /** Is animation paused */
  paused: boolean
  /** Current loop count */
  loopCount: number
  /** Speed multiplier */
  speed: number
}

/**
 * Animation set definition (for loading from JSON).
 */
export interface AnimationSetDefinition {
  /** Default FPS for all animations */
  fps?: number
  /** Animation definitions */
  animations: {
    [name: string]: {
      /** Frame names (from spritesheet) */
      frames: string[]
      /** Override FPS */
      fps?: number
      /** Loop setting */
      loop?: boolean
      /** Ping-pong */
      pingPong?: boolean
      /** Per-frame durations (ms) */
      durations?: number[]
      /** Per-frame events */
      events?: { [frameIndex: number]: string }
    }
  }
}
