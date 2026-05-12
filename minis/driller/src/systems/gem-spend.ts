import type { World } from 'koota'
import { GameState, GemSpendPopup } from '../traits'
import { GEM_SPEND_POPUP_STACK_WINDOW, GEM_SPEND_POPUP_TTL_TICKS } from '../constants'

/**
 * Deduct gems AND spawn (or stack) a floating "-N + gem" popup at the
 * given cell. Every gem-spend site in the codebase should route
 * through this so the player sees every cost.
 *
 * Stacking rule: if a popup already exists at (col, row) within the
 * last GEM_SPEND_POPUP_STACK_WINDOW ticks, increment its amount and
 * reset its startTick (so the existing visual restarts). Otherwise
 * spawn a fresh popup entity. Without this, a held paint drag would
 * spawn one popup per tick — visual confetti, unreadable.
 */
export function spendGems(world: World, amount: number, col: number, row: number): boolean {
  if (amount <= 0) return false
  const gs = world.get(GameState)
  if (!gs) return false
  if (gs.gems < amount) return false
  world.set(GameState, { gems: gs.gems - amount })

  let stacked = false
  world.query(GemSpendPopup).forEach((entity) => {
    if (stacked) return
    const p = entity.get(GemSpendPopup)!
    if (gs.tick - p.startTick > GEM_SPEND_POPUP_STACK_WINDOW) return
    if (p.col !== col || p.row !== row) return
    entity.set(GemSpendPopup, { amount: p.amount + amount, startTick: gs.tick })
    stacked = true
  })
  if (!stacked) {
    world.spawn(GemSpendPopup({ col, row, amount, startTick: gs.tick }))
  }
  return true
}

/**
 * Destroy popups past their TTL. Runs unconditionally each tick.
 */
export function gemSpendPopupSystem(world: World): void {
  const gs = world.get(GameState)
  if (!gs) return
  world.query(GemSpendPopup).forEach((entity) => {
    const p = entity.get(GemSpendPopup)!
    if (gs.tick - p.startTick >= GEM_SPEND_POPUP_TTL_TICKS) entity.destroy()
  })
}
