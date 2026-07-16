import type { World } from 'koota'
import { GameState, Gem } from '../traits'

/**
 * Gem fade lifecycle. Once a gem is "exposed" by a row mutation (drill
 * or paint), `Gem.expireAtTick` is armed in `completeDrill` / `doPaint`.
 * This system destroys the gem when the timer hits zero, applying
 * fade-out time pressure to the player's collection window.
 *
 * Visual fade is handled by the renderer — it reads `expireAtTick -
 * gs.tick` against `GEM_FADE_TICKS` to compute the ease-in-grow then
 * elastic-snap-shrink-and-fade animation. This system just enforces
 * the hard cutoff at expireAtTick.
 *
 * Void-band / scattered gems are NOT touched: their lifecycle is
 * managed by gem-gravity (drift off-screen) and death-respawn.
 * `expireAtTick === 0` means "not armed" and short-circuits here.
 */
export function gemExpirySystem(world: World): void {
  const gs = world.get(GameState)
  if (!gs) return
  world.query(Gem).forEach((entity) => {
    const g = entity.get(Gem)!
    if (g.expireAtTick === 0) return
    if (g.collected) return
    if (gs.tick >= g.expireAtTick) entity.destroy()
  })
}
