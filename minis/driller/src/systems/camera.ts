import type { World } from 'koota'
import { Camera, Driller } from '../traits'
import { TILE_PX } from '../constants'

/**
 * Deadzone-tracking camera follow.
 *
 * Mutations go through `world.set(Camera, partial)` because Koota's
 * `world.get(Camera)` returns a snapshot — direct property assignment
 * doesn't persist. (See decisions log: koota-0.6 trait write semantics.)
 */
export function cameraSystem(world: World): void {
  const cam = world.get(Camera)
  if (!cam) return
  const drillerEntity = world.queryFirst(Driller)
  if (!drillerEntity) return
  const d = drillerEntity.get(Driller)
  if (!d) return

  const visiblePxH = cam.rows * TILE_PX
  const drillerPxY = d.row * TILE_PX

  const deadzoneTop = cam.y + visiblePxH * 0.2
  const deadzoneBottom = cam.y + visiblePxH * 0.8

  let targetY = cam.targetY
  if (drillerPxY < deadzoneTop) targetY = drillerPxY - visiblePxH * 0.2
  else if (drillerPxY > deadzoneBottom) targetY = drillerPxY - visiblePxH * 0.8

  const newY = Math.round(cam.y + (targetY - cam.y) * 0.1)
  world.set(Camera, { y: newY, targetY })
}
