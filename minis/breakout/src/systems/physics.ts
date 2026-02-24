import { Not, type World } from 'koota'
import { Position, PrevPosition, Velocity, Ball, Paddle, Block, PaddleState, GameState, Input, Bounds, Dissolving } from '../traits'
import {
  PADDLE_BUMP_FORCE,
  PADDLE_BUMP_DECAY,
  PADDLE_MAX_BUMP,
  PADDLE_Y,
  WORLD_LEFT,
  WORLD_RIGHT,
  WORLD_TOP,
  PADDLE_WIDTH,
  BALL_SIZE,
} from './constants'
import type { SoundPlayer } from './sounds'

// Paddle movement speed (units per second) — shared by player and AI
const PADDLE_LERP_SPEED = 12

/**
 * Update ball position based on velocity
 */
export function moveBall(world: World, delta: number) {
  for (const entity of world.query(Ball, Position, Velocity)) {
    const pos = entity.get(Position)!
    const vel = entity.get(Velocity)!

    // Store pre-move position for swept collision detection
    if (entity.has(PrevPosition)) {
      entity.set(PrevPosition, { x: pos.x, y: pos.y })
    } else {
      entity.add(PrevPosition({ x: pos.x, y: pos.y }))
    }

    entity.set(Position, {
      x: pos.x + vel.x * delta,
      y: pos.y + vel.y * delta,
    })
  }
}

/**
 * Update paddle position based on Input trait.
 * Used by both player (real mouse) and AI (virtual mouse).
 */
export function updatePaddle(world: World, delta: number, sounds: SoundPlayer | null) {
  const paddles = [...world.query(Paddle, Position, PaddleState)]
  if (paddles.length === 0) return

  const paddle = paddles[0]!

  if (!world.has(Input) || !world.has(GameState)) return

  const input = world.get(Input)!
  const gameState = world.get(GameState)!
  const paddleState = paddle.get(PaddleState)!
  const pos = paddle.get(Position)!

  // Handle double-tap bump in playing mode
  if (gameState.mode === 'playing' && input.doubleTap) {
    paddle.set(PaddleState, {
      bumpVelocity: PADDLE_BUMP_FORCE,
      velocityX: paddleState.velocityX,
    })
    world.set(Input, {
      ...input,
      doubleTap: false,
    })
    sounds?.paddleHit()
  }

  // Lerp paddle X toward pointer position
  let newX = pos.x
  const inputActive = input.mouseActive || input.touchActive
  if (inputActive) {
    const targetX = input.pointerX
    const diff = targetX - pos.x
    const maxMove = PADDLE_LERP_SPEED * delta

    if (Math.abs(diff) < maxMove) {
      newX = targetX
    } else {
      newX = pos.x + Math.sign(diff) * maxMove
    }

    // Clamp to world bounds
    const halfWidth = PADDLE_WIDTH / 2
    const minX = WORLD_LEFT + halfWidth
    const maxX = WORLD_RIGHT - halfWidth
    newX = Math.max(minX, Math.min(maxX, newX))
  }

  // Apply bump velocity and decay (Y axis)
  let newY = pos.y
  let newBumpVel = paddleState.bumpVelocity

  if (newBumpVel > 0) {
    newY += newBumpVel * delta
    newBumpVel -= PADDLE_BUMP_DECAY * delta

    const maxY = PADDLE_Y + PADDLE_MAX_BUMP
    if (newY > maxY) {
      newY = maxY
      newBumpVel = 0
    }

    if (newBumpVel < 0) newBumpVel = 0
  } else {
    const returnSpeed = 4
    if (newY > PADDLE_Y) {
      newY -= returnSpeed * delta
      if (newY < PADDLE_Y) newY = PADDLE_Y
    }
  }

  const velX = delta > 0 ? (newX - pos.x) / delta : 0
  paddle.set(PaddleState, { bumpVelocity: newBumpVel, velocityX: velX })
  paddle.set(Position, { x: newX, y: newY })
}

// --- Attract mode AI ---
// Three layers of smoothing, just like a human:
// 1. aiGoalX: the AI's mental model of where the ball will land (lerps toward prediction)
// 2. aiMouseX: where the virtual mouse is (lerps toward aiGoalX, like a hand moving a mouse)
// 3. updatePaddle: the paddle lerps toward the mouse (same as player)

let aiGoalX = 0 // Smoothed prediction target — the AI's "intent"
let aiMouseX = 0 // Virtual mouse position — what gets written to Input

// Slow-drifting bias for subtle imperfection
let aiOffset = 0
let aiOffsetTarget = 0
let aiOffsetTimer = 0

/**
 * Reset AI state (call when entering attract mode)
 */
export function resetAttractAI() {
  aiGoalX = 0
  aiMouseX = 0
  aiOffset = 0
  aiOffsetTarget = 0
  aiOffsetTimer = 0
}

/**
 * Predict where the ball will intersect the paddle Y plane,
 * accounting for wall bounces. Returns the predicted X position.
 */
function predictBallLanding(ballX: number, ballY: number, velX: number, velY: number): number {
  if (velY >= 0) {
    // Ball heading up — predict where it will be after bouncing back down
    // Estimate time to hit top wall and return to paddle
    const timeToTop = (WORLD_TOP - BALL_SIZE / 2 - ballY) / velY
    const timeDown = (WORLD_TOP - BALL_SIZE / 2 - PADDLE_Y) / Math.abs(velY)
    const totalTime = timeToTop + timeDown

    // Simulate X position over that time with wall bounces
    return simulateXPosition(ballX, velX, totalTime)
  }

  // Ball heading down — predict landing X
  if (velY === 0) return ballX
  const timeToLand = (ballY - PADDLE_Y) / Math.abs(velY)
  return simulateXPosition(ballX, velX, timeToLand)
}

/**
 * Simulate ball X position over time, bouncing off left/right walls.
 */
function simulateXPosition(startX: number, velX: number, time: number): number {
  const halfBall = BALL_SIZE / 2
  const minX = WORLD_LEFT + halfBall
  const maxX = WORLD_RIGHT - halfBall
  const width = maxX - minX

  if (width <= 0 || time <= 0) return startX

  // Project raw X position
  let x = startX + velX * time

  // Bounce off walls (fold the position back into bounds)
  x = x - minX // shift to 0-based
  const period = width * 2
  x = ((x % period) + period) % period // modulo into one full bounce cycle
  if (x > width) x = period - x // fold back
  x = x + minX // shift back

  return x
}

/**
 * Find the X position of the nearest block column that still has live blocks.
 * Used to bias the AI toward aiming the ball at remaining blocks.
 */
function findNearestBlockX(world: World, fromX: number): number | null {
  let nearestX: number | null = null
  let nearestDist = Infinity

  for (const block of world.query(Block, Position, Not(Dissolving))) {
    const pos = block.get(Position)!
    const dist = Math.abs(pos.x - fromX)
    if (dist < nearestDist) {
      nearestDist = dist
      nearestX = pos.x
    }
  }

  return nearestX
}

// How fast the AI's mental model converges toward the raw prediction (per second)
// Lower = more human-like lag in reading the ball trajectory
const AI_GOAL_LERP = 3.0

// How fast the virtual mouse tracks toward the goal (per second)
// This is like hand speed — how fast a human can move a mouse
const AI_MOUSE_LERP = 5.0

/**
 * Attract mode AI: predicts ball landing, smoothly forms an intent,
 * smoothly moves a virtual mouse toward it. Three layers of smoothing
 * prevent any jitter or sudden changes — looks like a human playing.
 *
 * Writes to Input trait so updatePaddle handles actual paddle movement.
 */
export function updateAttractAI(world: World, delta: number) {
  if (!world.has(Input)) return

  const input = world.get(Input)!

  // Find ball state
  let ballX = 0, ballY = 0, velX = 0, velY = 0
  let hasBall = false
  for (const ball of world.query(Ball, Position, Velocity)) {
    const pos = ball.get(Position)!
    const vel = ball.get(Velocity)!
    ballX = pos.x
    ballY = pos.y
    velX = vel.x
    velY = vel.y
    hasBall = true
  }

  if (!hasBall) return

  // Raw prediction of where ball will land
  let rawTarget = predictBallLanding(ballX, ballY, velX, velY)

  // Bias toward nearest block column
  const nearestBlockX = findNearestBlockX(world, rawTarget)
  if (nearestBlockX !== null) {
    const blockDir = nearestBlockX - rawTarget
    rawTarget -= blockDir * 0.15
  }

  // Slow-drifting imperfection bias
  aiOffsetTimer -= delta
  if (aiOffsetTimer <= 0) {
    aiOffsetTarget = (Math.random() - 0.5) * 0.4
    aiOffsetTimer = 4.0 + Math.random() * 4.0
  }
  aiOffset += (aiOffsetTarget - aiOffset) * 0.3 * delta
  rawTarget += aiOffset

  // Layer 1: Smoothly update the AI's goal (mental model of where to be)
  // This prevents the target from jumping when the prediction changes
  aiGoalX += (rawTarget - aiGoalX) * Math.min(1, AI_GOAL_LERP * delta)

  // Layer 2: Smoothly move the virtual mouse toward the goal
  // This simulates the physical speed of moving a mouse
  aiMouseX += (aiGoalX - aiMouseX) * Math.min(1, AI_MOUSE_LERP * delta)

  // Write virtual mouse to Input trait — updatePaddle handles the rest (layer 3)
  world.set(Input, {
    ...input,
    pointerX: aiMouseX,
    mouseActive: true,
  })
}
