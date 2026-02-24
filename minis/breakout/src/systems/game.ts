import { Not, type World } from 'koota'
import {
  GameState,
  Input,
  Ball,
  Paddle,
  Block,
  Position,
  Velocity,
  Bounds,
  PaddleState,
  BlockState,
  Dissolving,
  BallFlash,
} from '../traits'
import {
  PADDLE_WIDTH,
  PADDLE_HEIGHT,
  PADDLE_Y,
  BALL_SIZE,
  BALL_SPEED,
  ATTRACT_BALL_SPEED,
  BLOCK_ROWS,
  BLOCK_COLS,
  BLOCK_WIDTH,
  BLOCK_HEIGHT,
  BLOCK_GAP,
  BLOCK_START_Y,
  WORLD_LEFT,
  GAME_OVER_DURATION,
  READY_DURATION,
} from './constants'
import { resetAttractAI } from './physics'
import type { SoundPlayer } from './sounds'

const STORAGE_KEY = 'mini-breakout-highscore'

function loadHighScore(): { highScore: number; highScoreLevel: number } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const data = JSON.parse(raw)
      return { highScore: data.score ?? 0, highScoreLevel: data.level ?? 0 }
    }
  } catch { /* localStorage unavailable or corrupt */ }
  return { highScore: 0, highScoreLevel: 0 }
}

export function saveHighScore(score: number, level: number) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ score, level }))
  } catch { /* localStorage unavailable */ }
}

/**
 * Initialize game world with world traits and entities
 */
export function initWorld(world: World) {
  // Reset AI state for attract mode
  resetAttractAI()

  // Load persisted high score
  const saved = loadHighScore()

  // Add world trait singletons
  world.add(GameState({
    mode: 'attract',
    score: 0,
    lives: 3,
    elapsed: 0,
    highScore: saved.highScore,
    highScoreLevel: saved.highScoreLevel,
    level: 1,
    countdown: 0,
    streak: 0,
    multiplier: 1,
  }))

  world.add(Input({
    pointerX: 0,
    mouseActive: false,
    touchActive: false,
    lastTapTime: 0,
    doubleTap: false,
  }))

  // Create paddle entity
  world.spawn(
    Paddle,
    Position({ x: 0, y: PADDLE_Y }),
    Bounds({ width: PADDLE_WIDTH, height: PADDLE_HEIGHT }),
    PaddleState({ bumpVelocity: 0 }),
  )

  // Create ball
  spawnBall(world, true)

  // Create blocks
  spawnBlocks(world)
}

/**
 * Spawn a ball entity.
 * Attract mode: spawns at center with immediate velocity.
 * Playing mode: spawns on paddle with zero velocity (launched after ready countdown).
 */
export function spawnBall(world: World, attractMode: boolean) {
  if (attractMode) {
    const speed = ATTRACT_BALL_SPEED
    const angle = (Math.random() * 0.67 + 0.17) * Math.PI
    world.spawn(
      Ball,
      Position({ x: 0, y: 0 }),
      Velocity({ x: Math.cos(angle) * speed, y: Math.sin(angle) * speed }),
      Bounds({ width: BALL_SIZE, height: BALL_SIZE }),
    )
  } else {
    // Spawn on paddle, stationary until ready countdown completes
    const ballY = PADDLE_Y + PADDLE_HEIGHT / 2 + BALL_SIZE / 2
    world.spawn(
      Ball,
      Position({ x: 0, y: ballY }),
      Velocity({ x: 0, y: 0 }),
      Bounds({ width: BALL_SIZE, height: BALL_SIZE }),
    )
  }
}

// Ball speed carried across level clears (reset to base on ball loss)
let carriedBallSpeed = 0

// Launch cone half-width in radians (~15 degrees each side of center)
const LAUNCH_CONE_HALF = Math.PI / 12
// How much paddle velocity tilts the cone center (radians per unit/sec of paddle speed)
const LAUNCH_ENGLISH = 0.06
// Absolute min/max launch angle from horizontal — prevents near-horizontal launches
const LAUNCH_MIN_ANGLE = Math.PI / 6 // 30 degrees
const LAUNCH_MAX_ANGLE = (5 * Math.PI) / 6 // 150 degrees

/**
 * Launch the ball upward with english from paddle movement.
 * Paddle velocity tilts the launch cone, a random spread is applied within the cone,
 * and the final angle is clamped to sane bounds.
 */
function launchBall(world: World) {
  // Get paddle velocity for english
  let paddleVelX = 0
  for (const paddle of world.query(Paddle, PaddleState)) {
    paddleVelX = paddle.get(PaddleState)!.velocityX
  }

  // Use carried speed from level clear, or base speed for new ball
  const speed = carriedBallSpeed > 0 ? carriedBallSpeed : BALL_SPEED
  carriedBallSpeed = 0

  // Base angle is straight up (π/2), tilted by paddle velocity
  const tilt = -paddleVelX * LAUNCH_ENGLISH
  const coneCenter = Math.PI / 2 + tilt
  // Random spread within the cone
  const spread = (Math.random() * 2 - 1) * LAUNCH_CONE_HALF
  // Clamp to prevent crazy horizontal launches
  const angle = Math.max(LAUNCH_MIN_ANGLE, Math.min(LAUNCH_MAX_ANGLE, coneCenter + spread))

  for (const ball of world.query(Ball, Velocity)) {
    ball.set(Velocity, {
      x: Math.cos(angle) * speed,
      y: Math.sin(angle) * speed,
    })
  }
}

// Row colors for classic breakout look (from top to bottom)
const ROW_COLORS: [number, number, number][] = [
  [1.0, 0.4, 0.4], // Red
  [1.0, 0.6, 0.3], // Orange
  [1.0, 0.9, 0.3], // Yellow
  [0.4, 1.0, 0.4], // Green
  [0.4, 0.7, 1.0], // Blue
]

/**
 * Spawn block grid
 */
export function spawnBlocks(world: World) {
  const totalWidth = BLOCK_COLS * (BLOCK_WIDTH + BLOCK_GAP) - BLOCK_GAP
  const startX = WORLD_LEFT + (6 - totalWidth) / 2 + BLOCK_WIDTH / 2

  for (let row = 0; row < BLOCK_ROWS; row++) {
    for (let col = 0; col < BLOCK_COLS; col++) {
      const x = startX + col * (BLOCK_WIDTH + BLOCK_GAP)
      const y = BLOCK_START_Y - row * (BLOCK_HEIGHT + BLOCK_GAP)

      // Get color for this row (cycle through if more rows than colors)
      const color = ROW_COLORS[row % ROW_COLORS.length]!

      world.spawn(
        Block,
        Position({ x, y }),
        Bounds({ width: BLOCK_WIDTH, height: BLOCK_HEIGHT }),
        BlockState({ row, col, color }),
      )
    }
  }
}

/**
 * Start a new game
 */
export function startGame(world: World, sounds: SoundPlayer | null) {
  if (!world.has(GameState)) return

  const state = world.get(GameState)!

  // Enter ready mode with countdown before ball launches
  world.set(GameState, {
    ...state,
    mode: 'ready',
    score: 0,
    lives: 3,
    elapsed: 0,
    level: 1,
    countdown: READY_DURATION,
    streak: 0,
    multiplier: 1,
  })

  // Reset paddle position
  for (const paddle of world.query(Paddle, Position, PaddleState)) {
    paddle.set(Position, { x: 0, y: PADDLE_Y })
    paddle.set(PaddleState, { bumpVelocity: 0, velocityX: 0 })
  }

  // Destroy existing ball and spawn new one (stationary on paddle)
  for (const ball of world.query(Ball)) {
    ball.destroy()
  }
  spawnBall(world, false)

  // Destroy all existing blocks (including dissolving ones) and respawn fresh
  for (const block of world.query(Block)) {
    block.destroy()
  }
  spawnBlocks(world)

  sounds?.gameStart()
}

/**
 * Handle game over
 */
export function gameOver(world: World, sounds: SoundPlayer | null) {
  if (!world.has(GameState)) return

  const state = world.get(GameState)!

  world.set(GameState, {
    ...state,
    mode: 'gameover',
    elapsed: 0,
    score: Math.floor(state.score),
  })

  sounds?.gameOver()
}

/**
 * Return to attract mode
 */
export function returnToAttract(world: World) {
  if (!world.has(GameState)) return

  const state = world.get(GameState)!

  world.set(GameState, {
    ...state,
    mode: 'attract',
    elapsed: 0,
  })

  // Reset AI tracking state
  resetAttractAI()

  // Reset paddle
  for (const paddle of world.query(Paddle, Position, PaddleState)) {
    paddle.set(Position, { x: 0, y: PADDLE_Y })
    paddle.set(PaddleState, { bumpVelocity: 0, velocityX: 0 })
  }

  // Reset ball to attract mode speed
  for (const ball of world.query(Ball)) {
    ball.destroy()
  }
  spawnBall(world, true)

  // Respawn blocks
  for (const block of world.query(Block)) {
    block.destroy()
  }
  spawnBlocks(world)
}

/**
 * Reset ball after losing a life
 */
export function resetBall(world: World, sounds: SoundPlayer | null) {
  if (!world.has(GameState)) return

  const state = world.get(GameState)!

  // Enter ready mode — streak/multiplier/speed reset on ball loss
  world.set(GameState, {
    ...state,
    mode: 'ready',
    elapsed: 0,
    countdown: READY_DURATION,
    streak: 0,
    multiplier: 1,
  })

  // Destroy existing ball
  for (const ball of world.query(Ball)) {
    ball.destroy()
  }

  // Spawn new ball (stationary on paddle, base speed)
  spawnBall(world, false)

  // Reset paddle
  for (const paddle of world.query(Paddle, Position, PaddleState)) {
    paddle.set(Position, { x: 0, y: PADDLE_Y })
    paddle.set(PaddleState, { bumpVelocity: 0, velocityX: 0 })
  }
}

/**
 * Handle level clear (all blocks destroyed)
 */
export function levelClear(world: World, sounds: SoundPlayer | null) {
  if (!world.has(GameState)) return

  const state = world.get(GameState)!

  // Capture current ball speed before destroying it — carry into next level
  let ballSpeed = BALL_SPEED
  for (const ball of world.query(Ball, Velocity)) {
    const vel = ball.get(Velocity)!
    ballSpeed = Math.sqrt(vel.x * vel.x + vel.y * vel.y)
  }

  // Enter ready mode — preserve streak/multiplier across levels, bump level
  world.set(GameState, {
    ...state,
    mode: 'ready',
    elapsed: 0,
    countdown: READY_DURATION,
    level: state.level + 1,
  })

  // Destroy any remaining dissolving blocks before respawning
  for (const block of world.query(Block)) {
    block.destroy()
  }
  spawnBlocks(world)

  // Reset ball position (stationary on paddle), will launch at preserved speed
  for (const ball of world.query(Ball)) {
    ball.destroy()
  }
  spawnBall(world, false)

  // Store the carried speed so launchBall can use it
  carriedBallSpeed = ballSpeed

  sounds?.levelClear()
}

/**
 * Subscribe to GameState changes and sync high score when score exceeds it.
 * Uses Koota's onChange for world traits — only fires when GameState is set.
 */
export function subscribeHighScore(world: World) {
  return world.onChange(GameState, () => {
    const state = world.get(GameState)!
    if (state.mode !== 'attract' && state.score > state.highScore) {
      const newHigh = Math.floor(state.score)
      saveHighScore(newHigh, state.level)
      world.set(GameState, {
        ...state,
        highScore: newHigh,
        highScoreLevel: state.level,
      })
    }
  })
}

/**
 * Update game state timer
 */
export function updateElapsed(world: World, delta: number) {
  if (!world.has(GameState)) return

  const state = world.get(GameState)!
  world.set(GameState, {
    ...state,
    elapsed: state.elapsed + delta,
  })
}

/**
 * Update ready countdown — 3 evenly spaced flash+tick pulses, ball launches on the 3rd.
 * Ball tracks paddle X during countdown so the player can aim.
 */
const READY_TICKS = 3
export function updateReady(world: World, dt: number, sounds: SoundPlayer | null) {
  if (!world.has(GameState)) return

  const state = world.get(GameState)!
  if (state.mode !== 'ready') return

  const prevElapsed = READY_DURATION - state.countdown
  const newCountdown = state.countdown - dt
  const newElapsed = READY_DURATION - newCountdown
  const tickInterval = READY_DURATION / READY_TICKS

  // Flash + tick at each evenly spaced interval
  const prevTick = Math.floor(prevElapsed / tickInterval)
  const newTick = Math.min(READY_TICKS, Math.floor(newElapsed / tickInterval))
  if (newTick > prevTick) {
    for (const ball of world.query(Ball)) {
      if (ball.has(BallFlash)) {
        ball.set(BallFlash, { amount: 0.8, decaySpeed: 4.0 })
      } else {
        ball.add(BallFlash({ amount: 0.8, decaySpeed: 4.0 }))
      }
    }
    // 3rd tick is the launch — use launch sound instead of tick
    if (newTick >= READY_TICKS) {
      sounds?.ballLaunch()
    } else {
      sounds?.countdownTick()
    }
  }

  // Ball tracks paddle X position during countdown
  const ballY = PADDLE_Y + PADDLE_HEIGHT / 2 + BALL_SIZE / 2
  for (const paddle of world.query(Paddle, Position)) {
    const paddlePos = paddle.get(Position)!
    for (const ball of world.query(Ball, Position)) {
      ball.set(Position, { x: paddlePos.x, y: ballY })
    }
  }

  if (newTick >= READY_TICKS) {
    // 3rd tick — launch!
    world.set(GameState, {
      ...state,
      mode: 'playing',
      elapsed: 0,
      countdown: 0,
    })
    launchBall(world)
  } else {
    world.set(GameState, {
      ...state,
      countdown: newCountdown,
    })
  }
}

/**
 * Check if game over timer has expired
 */
export function shouldReturnToAttract(world: World): boolean {
  if (!world.has(GameState)) return false

  const state = world.get(GameState)!
  return state.mode === 'gameover' && state.elapsed >= GAME_OVER_DURATION
}

/**
 * Handle mouse enter - start tracking mouse position
 */
export function handleMouseEnter(world: World) {
  if (!world.has(Input)) return

  const input = world.get(Input)!
  world.set(Input, {
    ...input,
    mouseActive: true,
  })
}

/**
 * Handle mouse leave - stop tracking mouse position
 */
export function handleMouseLeave(world: World) {
  if (!world.has(Input)) return

  const input = world.get(Input)!
  world.set(Input, {
    ...input,
    mouseActive: false,
  })
}

/**
 * Handle mouse move - always update position when mouse is over game
 */
export function handleMouseMove(world: World, pointerX: number) {
  if (!world.has(Input)) return

  const input = world.get(Input)!
  if (input.mouseActive) {
    world.set(Input, {
      ...input,
      pointerX,
    })
  }
}

/**
 * Handle mouse click - start game or trigger double-tap bump
 */
export function handleMouseClick(world: World, pointerX: number, sounds: SoundPlayer | null) {
  if (!world.has(GameState) || !world.has(Input)) return

  const state = world.get(GameState)!
  const input = world.get(Input)!
  const now = performance.now()

  // Check for double-click (within 300ms)
  const isDoubleClick = now - input.lastTapTime < 300

  if (state.mode === 'attract' || state.mode === 'gameover') {
    startGame(world, sounds)
  }

  world.set(Input, {
    ...input,
    pointerX,
    lastTapTime: now,
    doubleTap: isDoubleClick && state.mode === 'playing',
  })
}

/**
 * Handle touch start - start game or begin tracking
 */
export function handleTouchStart(world: World, pointerX: number, sounds: SoundPlayer | null) {
  if (!world.has(GameState) || !world.has(Input)) return

  const state = world.get(GameState)!
  const input = world.get(Input)!
  const now = performance.now()

  // Check for double-tap (within 300ms)
  const isDoubleTap = now - input.lastTapTime < 300

  if (state.mode === 'attract' || state.mode === 'gameover') {
    startGame(world, sounds)
  }

  world.set(Input, {
    ...input,
    pointerX,
    touchActive: true,
    lastTapTime: now,
    doubleTap: isDoubleTap && state.mode === 'playing',
  })
}

/**
 * Handle touch move - update position while touching
 */
export function handleTouchMove(world: World, pointerX: number) {
  if (!world.has(Input)) return

  const input = world.get(Input)!
  if (input.touchActive) {
    world.set(Input, {
      ...input,
      pointerX,
    })
  }
}

/**
 * Handle touch end - stop tracking
 */
export function handleTouchEnd(world: World) {
  if (!world.has(Input)) return

  const input = world.get(Input)!
  world.set(Input, {
    ...input,
    touchActive: false,
  })
}

/**
 * Get remaining block count (non-dissolving blocks only)
 */
export function getBlockCount(world: World): number {
  return [...world.query(Block, Not(Dissolving))].length
}

/**
 * Lose a life
 */
export function loseLife(world: World, sounds: SoundPlayer | null) {
  if (!world.has(GameState)) return

  const state = world.get(GameState)!

  if (state.lives <= 1) {
    gameOver(world, sounds)
  } else {
    world.set(GameState, {
      ...state,
      lives: state.lives - 1,
    })
    sounds?.miss()
    resetBall(world, sounds)
  }
}

/**
 * Attract mode: reset ball without sound (infinite loop)
 */
export function attractResetBall(world: World) {
  for (const ball of world.query(Ball)) {
    ball.destroy()
  }
  spawnBall(world, true)

  // Reset paddle position
  for (const paddle of world.query(Paddle, Position, PaddleState)) {
    paddle.set(Position, { x: 0, y: PADDLE_Y })
    paddle.set(PaddleState, { bumpVelocity: 0, velocityX: 0 })
  }
}

/**
 * Attract mode: respawn blocks when all are cleared
 */
export function attractLevelClear(world: World) {
  // Destroy any remaining dissolving blocks before respawning
  for (const block of world.query(Block)) {
    block.destroy()
  }
  spawnBlocks(world)
  for (const ball of world.query(Ball)) {
    ball.destroy()
  }
  spawnBall(world, true)
}
