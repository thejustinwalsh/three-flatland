import { trait } from 'koota'
import type { GameMode } from '../types'

// Position trait - stores x, y coordinates
export const Position = trait({ x: 0, y: 0 })

// Velocity trait - for moving entities
export const Velocity = trait({ x: 0, y: 0 })

// Bounds trait - for collision boxes
export const Bounds = trait({ width: 1, height: 1 })

// Game state - world trait singleton
export const GameState = trait({
  mode: 'attract' as GameMode,
  score: 0,
  lives: 3,
  elapsed: 0,
  highScore: 0,
  highScoreLevel: 0, // Level reached during the high score run
  level: 1, // Current level (increments on level clear)
  countdown: 0, // Seconds remaining in ready phase (3-2-1 before launch)
  streak: 0, // Consecutive blocks hit this ball (resets on ball loss)
  multiplier: 1, // Score multiplier — increases every STREAK_INTERVAL blocks on a curve
  carriedBallSpeed: 0, // Ball speed carried across level clears (reset on ball loss)
})

// Input state - world trait singleton
export const Input = trait({
  pointerX: 0, // Target X position in world coordinates
  mouseActive: false, // Mouse is over the game area
  touchActive: false, // Touch is currently down
  lastTapTime: 0, // Timestamp of last tap (for double-tap detection)
  doubleTap: false, // Flag set when double-tap detected
})

// Entity type tags
export const Ball = trait()
export const Paddle = trait()
export const Block = trait()

// Paddle-specific state
export const PaddleState = trait({
  bumpVelocity: 0, // Current bump velocity (decays over time)
  velocityX: 0, // Horizontal velocity (units/sec, for ball launch english)
})

// Block-specific state
export const BlockState = trait({
  row: 0,
  col: 0,
  color: () => [1, 1, 1] as [number, number, number], // RGB tint color (0-1)
})

// Block dissolving state (added when hit, removed when fully dissolved)
export const Dissolving = trait({
  progress: 0, // 0 = solid, 1 = fully dissolved
  speed: 3.0, // Dissolve speed (progress per second)
})

// Previous position for swept collision detection (set by moveBall before integration)
export const PrevPosition = trait({ x: 0, y: 0 })

// Ball flash state (for hit feedback)
export const BallFlash = trait({
  amount: 0, // 0 = no flash, 1 = full white flash
  decaySpeed: 8.0, // How fast the flash fades (per second)
})

// Attract mode AI state — world trait singleton
export const AttractAI = trait({
  goalX: 0, // Smoothed prediction target — the AI's "intent"
  mouseX: 0, // Virtual mouse position — what gets written to Input
  offset: 0, // Slow-drifting bias for subtle imperfection
  offsetTarget: 0,
  offsetTimer: 0,
})
