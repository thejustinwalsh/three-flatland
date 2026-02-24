import { Not, type World } from 'koota'
import { Position, PrevPosition, Velocity, Bounds, Ball, Paddle, Block, GameState, PaddleState, Dissolving, BallFlash } from '../traits'
import {
  WORLD_LEFT,
  WORLD_RIGHT,
  WORLD_TOP,
  BALL_SPEED_INCREASE,
  BALL_LOST_Y,
  POINTS_PER_BLOCK,
  STREAK_INTERVAL,
} from './constants'
import type { SoundPlayer } from './sounds'


/**
 * Line segment vs AABB intersection using the slab method.
 * Returns the entry time t in [0,1] and which axis was hit, or null if no hit.
 * The AABB should already be expanded by the ball's half-extents (Minkowski sum).
 */
function sweepLineAABB(
  x0: number, y0: number,
  x1: number, y1: number,
  minX: number, minY: number,
  maxX: number, maxY: number,
): { t: number; axis: 'x' | 'y' } | null {
  const dx = x1 - x0
  const dy = y1 - y0

  let tMin = 0
  let tMax = 1
  let hitAxis: 'x' | 'y' = 'x'

  // X slab
  if (Math.abs(dx) < 1e-8) {
    if (x0 < minX || x0 > maxX) return null
  } else {
    let t1 = (minX - x0) / dx
    let t2 = (maxX - x0) / dx
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp }
    if (t1 > tMin) { tMin = t1; hitAxis = 'x' }
    if (t2 < tMax) tMax = t2
    if (tMin > tMax) return null
  }

  // Y slab
  if (Math.abs(dy) < 1e-8) {
    if (y0 < minY || y0 > maxY) return null
  } else {
    let t1 = (minY - y0) / dy
    let t2 = (maxY - y0) / dy
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp }
    if (t1 > tMin) { tMin = t1; hitAxis = 'y' }
    if (t2 < tMax) tMax = t2
    if (tMin > tMax) return null
  }

  if (tMin > 1 || tMax < 0) return null
  return { t: Math.max(0, tMin), axis: hitAxis }
}

/**
 * Trigger ball flash effect (shared by all collision types)
 */
function triggerBallFlash(ball: ReturnType<World['query']>[number], intensity: number = 1.0) {
  if (ball.has(BallFlash)) {
    ball.set(BallFlash, { amount: intensity, decaySpeed: 8.0 })
  } else {
    ball.add(BallFlash({ amount: intensity, decaySpeed: 8.0 }))
  }
}

/**
 * Handle ball collision with walls
 */
export function wallCollision(world: World, sounds: SoundPlayer | null) {
  for (const entity of world.query(Ball, Position, Velocity, Bounds)) {
    const pos = entity.get(Position)!
    const vel = entity.get(Velocity)!
    const bounds = entity.get(Bounds)!
    const halfW = bounds.width / 2

    const prev = entity.has(PrevPosition) ? entity.get(PrevPosition)! : null
    const startX = prev?.x ?? pos.x
    const startY = prev?.y ?? pos.y
    const dx = pos.x - startX
    const dy = pos.y - startY

    let bounced = false

    // Left wall — find exact contact time along travel path
    if (pos.x - halfW <= WORLD_LEFT && vel.x < 0) {
      const boundary = WORLD_LEFT + halfW
      const t = Math.abs(dx) > 1e-8 ? (boundary - startX) / dx : 0
      const contactY = startY + dy * Math.max(0, Math.min(1, t))
      entity.set(Velocity, { x: -vel.x, y: vel.y })
      entity.set(Position, { x: boundary, y: contactY })
      sounds?.wallHit()
      bounced = true
    }

    // Right wall
    if (pos.x + halfW >= WORLD_RIGHT && vel.x > 0) {
      const boundary = WORLD_RIGHT - halfW
      const t = Math.abs(dx) > 1e-8 ? (boundary - startX) / dx : 0
      const contactY = startY + dy * Math.max(0, Math.min(1, t))
      entity.set(Velocity, { x: -vel.x, y: vel.y })
      entity.set(Position, { x: boundary, y: contactY })
      sounds?.wallHit()
      bounced = true
    }

    // Top wall
    if (pos.y + halfW >= WORLD_TOP && vel.y > 0) {
      const boundary = WORLD_TOP - halfW
      const t = Math.abs(dy) > 1e-8 ? (boundary - startY) / dy : 0
      const contactX = startX + dx * Math.max(0, Math.min(1, t))
      entity.set(Velocity, { x: vel.x, y: -vel.y })
      entity.set(Position, { x: contactX, y: boundary })
      sounds?.wallHit()
      bounced = true
    }

    // Flash on any wall bounce (subtle)
    if (bounced) {
      triggerBallFlash(entity, 0.5)
    }
  }
}

/**
 * Handle ball collision with paddle
 */
export function paddleCollision(world: World, sounds: SoundPlayer | null) {
  const paddle = world.query(Paddle, Position, Bounds, PaddleState)[0]
  if (!paddle) return
  const paddlePos = paddle.get(Position)!
  const paddleBounds = paddle.get(Bounds)!

  for (const ball of world.query(Ball, Position, Velocity, Bounds)) {
    const ballPos = ball.get(Position)!
    const ballVel = ball.get(Velocity)!
    const ballBounds = ball.get(Bounds)!
    const ballHalfW = ballBounds.width / 2
    const ballHalfH = ballBounds.height / 2

    // Only check collision if ball is moving downward
    if (ballVel.y >= 0) continue

    // Swept collision: test line from pre-move position to current position
    const prev = ball.has(PrevPosition) ? ball.get(PrevPosition)! : null
    const startX = prev?.x ?? ballPos.x
    const startY = prev?.y ?? ballPos.y

    // Expand paddle AABB by ball half-extents (Minkowski sum)
    const minX = paddlePos.x - paddleBounds.width / 2 - ballHalfW
    const maxX = paddlePos.x + paddleBounds.width / 2 + ballHalfW
    const minY = paddlePos.y - paddleBounds.height / 2 - ballHalfH
    const maxY = paddlePos.y + paddleBounds.height / 2 + ballHalfH

    const hit = sweepLineAABB(startX, startY, ballPos.x, ballPos.y, minX, minY, maxX, maxY)
    if (hit) {
      // Contact point along the sweep
      const contactX = startX + (ballPos.x - startX) * hit.t

      // Calculate bounce angle based on where ball hit paddle
      const hitOffset = (contactX - paddlePos.x) / (paddleBounds.width / 2)
      const angle = hitOffset * (Math.PI / 3) // Max 60 degree angle

      // Get current speed
      const speed = Math.sqrt(ballVel.x * ballVel.x + ballVel.y * ballVel.y)

      // Set new velocity with angle
      ball.set(Velocity, {
        x: Math.sin(angle) * speed,
        y: Math.abs(Math.cos(angle) * speed), // Always bounce up
      })

      // Move ball above paddle
      ball.set(Position, {
        x: contactX,
        y: paddlePos.y + paddleBounds.height / 2 + ballHalfH,
      })

      // Flash on paddle hit
      triggerBallFlash(ball, 0.7)

      sounds?.paddleHit()
    }
  }
}

/**
 * Handle ball collision with blocks using swept line-segment test.
 * Tests the ball's travel path (prevPos → currentPos) against Minkowski-expanded
 * block AABBs to prevent tunneling at high speeds.
 */
export function blockCollision(
  world: World,
  sounds: SoundPlayer | null,
  onBlockDestroyed: () => void,
) {
  // Only collide with blocks that aren't already dissolving
  const blocks = world.query(Block, Position, Bounds, Not(Dissolving))

  for (const ball of world.query(Ball, Position, Velocity, Bounds)) {
    const ballPos = ball.get(Position)!
    const ballVel = ball.get(Velocity)!
    const ballBounds = ball.get(Bounds)!
    const ballHalfW = ballBounds.width / 2
    const ballHalfH = ballBounds.height / 2

    // Swept collision: test line from pre-move position to current position
    const prev = ball.has(PrevPosition) ? ball.get(PrevPosition)! : null
    const startX = prev?.x ?? ballPos.x
    const startY = prev?.y ?? ballPos.y

    // Find the closest block hit along the ball's travel path
    let closestT = Infinity
    let closestAxis: 'x' | 'y' = 'x'
    let hitBlock: (typeof blocks)[number] | null = null

    for (const block of blocks) {
      const blockPos = block.get(Position)!
      const blockBounds = block.get(Bounds)!

      // Expand block AABB by ball half-extents (Minkowski sum)
      // This lets us treat the ball center as a point
      const minX = blockPos.x - blockBounds.width / 2 - ballHalfW
      const maxX = blockPos.x + blockBounds.width / 2 + ballHalfW
      const minY = blockPos.y - blockBounds.height / 2 - ballHalfH
      const maxY = blockPos.y + blockBounds.height / 2 + ballHalfH

      const hit = sweepLineAABB(startX, startY, ballPos.x, ballPos.y, minX, minY, maxX, maxY)
      if (hit && hit.t < closestT) {
        closestT = hit.t
        closestAxis = hit.axis
        hitBlock = block
      }
    }

    if (hitBlock) {
      // Place ball at the contact point along the sweep
      ball.set(Position, {
        x: startX + (ballPos.x - startX) * closestT,
        y: startY + (ballPos.y - startY) * closestT,
      })

      // Reflect velocity based on which face was hit
      if (closestAxis === 'x') {
        ball.set(Velocity, { x: -ballVel.x, y: ballVel.y })
      } else {
        ball.set(Velocity, { x: ballVel.x, y: -ballVel.y })
      }

      // Increase ball speed slightly
      const speed = Math.sqrt(ballVel.x * ballVel.x + ballVel.y * ballVel.y)
      const newSpeed = speed + BALL_SPEED_INCREASE
      const currentVel = ball.get(Velocity)!
      const currentSpeed = Math.sqrt(currentVel.x * currentVel.x + currentVel.y * currentVel.y)
      if (currentSpeed > 0) {
        ball.set(Velocity, {
          x: (currentVel.x / currentSpeed) * newSpeed,
          y: (currentVel.y / currentSpeed) * newSpeed,
        })
      }

      // Update streak, multiplier, and score (only in playing mode)
      if (world.has(GameState)) {
        const state = world.get(GameState)!
        if (state.mode === 'playing') {
          const newStreak = state.streak + 1
          // Inverse curve: each tier requires more blocks than the last.
          // Gaps double by STREAK_INTERVAL: 8, 16, 24, 32, ...
          // x2 at 8, x3 at 24, x4 at 48, x5 at 80, x6 at 120...
          const s = newStreak / (STREAK_INTERVAL / 2)
          const newMultiplier = 1 + Math.floor((-1 + Math.sqrt(1 + 4 * s)) / 2)
          world.set(GameState, {
            score: state.score + POINTS_PER_BLOCK * newMultiplier,
            streak: newStreak,
            multiplier: newMultiplier,
          })
        }
      }

      // Start dissolve animation instead of immediate destroy
      hitBlock.add(Dissolving({ progress: 0, speed: 3.0 }))

      // Trigger ball flash effect (full intensity on block hit)
      triggerBallFlash(ball, 1.0)

      sounds?.blockBreak()
      onBlockDestroyed()
    }
  }
}

/**
 * Update dissolving blocks and destroy them when fully dissolved
 */
export function updateDissolving(world: World, dt: number) {
  for (const block of world.query(Block, Dissolving)) {
    const dissolving = block.get(Dissolving)!
    const newProgress = dissolving.progress + dissolving.speed * dt

    if (newProgress >= 1.2) {
      // Destroy after the shader has fully discarded all pixels (progress > 1.0).
      // React unmount is async so we can't rely on it for visual removal —
      // the dissolve shader handles hiding via discard, entity cleanup is deferred.
      block.destroy()
    } else {
      block.set(Dissolving, { progress: newProgress })
    }
  }
}

/**
 * Update ball flash effect (decay over time)
 */
export function updateBallFlash(world: World, dt: number) {
  for (const ball of world.query(Ball, BallFlash)) {
    const flash = ball.get(BallFlash)!
    const newAmount = Math.max(0, flash.amount - flash.decaySpeed * dt)

    if (newAmount <= 0) {
      // Flash complete - remove trait
      ball.remove(BallFlash)
    } else {
      ball.set(BallFlash, { amount: newAmount })
    }
  }
}

/**
 * Check if ball fell below paddle (game over condition)
 */
export function checkBallLost(world: World): boolean {
  for (const ball of world.query(Ball, Position, Bounds)) {
    const pos = ball.get(Position)!
    const bounds = ball.get(Bounds)!

    // Ball is lost if it's below the bottom of the screen
    if (pos.y + bounds.height / 2 < BALL_LOST_Y) {
      return true
    }
  }
  return false
}
