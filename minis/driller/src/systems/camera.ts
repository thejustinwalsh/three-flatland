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

  // targetY is always a multiple of TILE_PX (drillerPxY = row * 16,
  // and the deadzone offsets 128/512 are multiples of 16). The lerp
  // converges to targetY pixel-by-pixel, so cam.y always LANDS on a
  // 16-multiple — full rows align to viewport edges at rest, while
  // the scroll remains smooth pixel-by-pixel between rows.
  //
  // Math.round(diff * 0.1) rounds to 0 when |diff| ≤ 5, so a plain
  // asymptotic lerp stalls before reaching target. Force a minimum
  // 1px step toward target whenever cam.y ≠ targetY — that way every
  // frame either lands ON the target or moves at least 1px closer.
  const diff = targetY - cam.y
  let step = Math.round(diff * 0.1)
  if (step === 0 && diff !== 0) step = Math.sign(diff)
  const newY = cam.y + step
  world.set(Camera, { y: newY, targetY })
}
