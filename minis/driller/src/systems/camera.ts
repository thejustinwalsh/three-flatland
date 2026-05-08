import type { World } from 'koota'
import { Camera, Driller } from '../traits'
import { TILE_PX } from '../constants'

/**
 * Deadzone-tracking camera follow.
 *
 * The camera moves only when the driller leaves the central 60% vertical
 * band of the visible viewport, then eases toward target. Output is in
 * world-space pixel coordinates (Y increases downward in cell space, so
 * the camera Y here grows as we descend).
 *
 * Mutates `Camera.targetY` and `Camera.y` on the world singleton.
 */
export function cameraSystem(world: World): void {
  const cam = world.get(Camera)
  if (!cam) return
  const driller = world.queryFirst(Driller)
  if (!driller) return
  const d = driller.get(Driller)
  if (!d) return

  const visiblePxH = cam.rows * TILE_PX
  const drillerPxY = d.row * TILE_PX

  const deadzoneTop = cam.y + visiblePxH * 0.2
  const deadzoneBottom = cam.y + visiblePxH * 0.8

  if (drillerPxY < deadzoneTop) {
    cam.targetY = drillerPxY - visiblePxH * 0.2
  } else if (drillerPxY > deadzoneBottom) {
    cam.targetY = drillerPxY - visiblePxH * 0.8
  }

  cam.y += (cam.targetY - cam.y) * 0.1
  cam.y = Math.round(cam.y)
}
