import type { World } from 'koota'
import { isFreeFall } from '../biomes'
import { FREE_FALL_VACUUM_DURATION_MS, FREE_FALL_VACUUM_RADIUS_PX, TILE_PX } from '../constants'
import { Driller, Gem } from '../traits'
import { completeGemCollection } from './input'

export interface WorldPoint {
  x: number
  y: number
}

function pointSegmentDistanceSquared(
  point: WorldPoint,
  start: WorldPoint,
  end: WorldPoint
): number {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared === 0) {
    const px = point.x - start.x
    const py = point.y - start.y
    return px * px + py * py
  }
  const projection = Math.max(
    0,
    Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared)
  )
  const nearestX = start.x + dx * projection
  const nearestY = start.y + dy * projection
  const px = point.x - nearestX
  const py = point.y - nearestY
  return px * px + py * py
}

/**
 * Catch every free-fall gem within a small radius of a pointer segment.
 * Segment distance keeps fast mouse/touch swipes continuous even when the
 * browser coalesces movement events. Caught gems stop gravity immediately and
 * enter a short pull tween; value is credited when that tween completes.
 */
export function vacuumFreeFallGemSweep(world: World, start: WorldPoint, end: WorldPoint): number {
  const driller = world.queryFirst(Driller)?.get(Driller)
  if (!driller || !isFreeFall(driller.row)) return 0

  const radiusSquared = FREE_FALL_VACUUM_RADIUS_PX * FREE_FALL_VACUUM_RADIUS_PX
  let caught = 0
  world.query(Gem).forEach((entity) => {
    const gem = entity.get(Gem)
    if (!gem || gem.collected) return
    const source = {
      x: gem.px || gem.col * TILE_PX + TILE_PX / 2,
      y: gem.py || gem.row * TILE_PX + TILE_PX / 2,
    }
    if (pointSegmentDistanceSquared(source, start, end) > radiusSquared) return
    entity.set(Gem, {
      collected: true,
      collectProgress: Number.EPSILON,
      vacuumStartPx: source.x,
      vacuumStartPy: source.y,
      vacuumTargetPx: end.x,
      vacuumTargetPy: end.y,
      px: source.x,
      py: source.y,
    })
    caught++
  })
  return caught
}

/** Advance caught gems through their pull-and-shrink animation. */
export function gemVacuumSystem(world: World, deltaMs: number): void {
  world.query(Gem).forEach((entity) => {
    const gem = entity.get(Gem)
    if (!gem || !gem.collected || gem.collectProgress <= 0) return
    const progress = Math.min(1, gem.collectProgress + deltaMs / FREE_FALL_VACUUM_DURATION_MS)
    const pull = 1 - (1 - progress) ** 3
    entity.set(Gem, {
      collectProgress: progress,
      px: gem.vacuumStartPx + (gem.vacuumTargetPx - gem.vacuumStartPx) * pull,
      py: gem.vacuumStartPy + (gem.vacuumTargetPy - gem.vacuumStartPy) * pull,
    })
    if (progress >= 1) completeGemCollection(world, entity)
  })
}
