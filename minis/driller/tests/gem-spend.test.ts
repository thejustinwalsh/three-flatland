import { describe, it, expect } from 'vitest'
import { gemSpendPopupSystem, spendGems } from '../src/systems/gem-spend'
import { GameState, GemSpendPopup } from '../src/traits'
import { GEM_SPEND_POPUP_STACK_WINDOW, GEM_SPEND_POPUP_TTL_TICKS } from '../src/constants'
import { makeWorldFromGrid, tickWorld } from './_world-helper'

function setup() {
  const world = makeWorldFromGrid(['..........', '##########'])
  return world
}

describe('spendGems', () => {
  it('deducts gems and spawns a popup at the given cell', () => {
    const world = setup()
    world.set(GameState, { gems: 5, tick: 10 })
    const ok = spendGems(world, 2, 4, 3)
    expect(ok).toBe(true)
    expect(world.get(GameState)!.gems).toBe(3)
    const popups: { col: number; row: number; amount: number; startTick: number }[] = []
    world.query(GemSpendPopup).forEach((e) => popups.push(e.get(GemSpendPopup)!))
    expect(popups.length).toBe(1)
    expect(popups[0]).toEqual({ col: 4, row: 3, amount: 2, startTick: 10 })
  })

  it('refuses when player cannot afford the spend (no deduct, no popup)', () => {
    const world = setup()
    world.set(GameState, { gems: 1, tick: 0 })
    const ok = spendGems(world, 5, 0, 0)
    expect(ok).toBe(false)
    expect(world.get(GameState)!.gems).toBe(1)
    let popups = 0
    world.query(GemSpendPopup).forEach(() => popups++)
    expect(popups).toBe(0)
  })

  it('stacks consecutive spends at the same cell within the stack window', () => {
    const world = setup()
    world.set(GameState, { gems: 10, tick: 0 })
    spendGems(world, 1, 5, 5)
    world.set(GameState, { tick: GEM_SPEND_POPUP_STACK_WINDOW })
    spendGems(world, 2, 5, 5)
    const popups: { amount: number; startTick: number }[] = []
    world.query(GemSpendPopup).forEach((e) => popups.push(e.get(GemSpendPopup)!))
    expect(popups.length).toBe(1)
    expect(popups[0]!.amount).toBe(3)
    expect(popups[0]!.startTick).toBe(GEM_SPEND_POPUP_STACK_WINDOW) // refreshed
  })

  it('does NOT stack across cells', () => {
    const world = setup()
    world.set(GameState, { gems: 10, tick: 0 })
    spendGems(world, 1, 5, 5)
    spendGems(world, 1, 6, 5) // different col
    let count = 0
    world.query(GemSpendPopup).forEach(() => count++)
    expect(count).toBe(2)
  })

  it('does NOT stack past the stack window', () => {
    const world = setup()
    world.set(GameState, { gems: 10, tick: 0 })
    spendGems(world, 1, 5, 5)
    world.set(GameState, { tick: GEM_SPEND_POPUP_STACK_WINDOW + 1 })
    spendGems(world, 1, 5, 5)
    let count = 0
    world.query(GemSpendPopup).forEach(() => count++)
    expect(count).toBe(2)
  })
})

describe('gemSpendPopupSystem', () => {
  it('destroys a popup when its TTL elapses', () => {
    const world = setup()
    world.set(GameState, { gems: 5, tick: 0 })
    spendGems(world, 1, 0, 0)
    for (let i = 0; i < GEM_SPEND_POPUP_TTL_TICKS; i++) {
      tickWorld(world, 1)
      gemSpendPopupSystem(world)
    }
    let count = 0
    world.query(GemSpendPopup).forEach(() => count++)
    expect(count).toBe(0)
  })

  it('keeps a popup alive before TTL', () => {
    const world = setup()
    world.set(GameState, { gems: 5, tick: 0 })
    spendGems(world, 1, 0, 0)
    for (let i = 0; i < GEM_SPEND_POPUP_TTL_TICKS - 1; i++) {
      tickWorld(world, 1)
      gemSpendPopupSystem(world)
    }
    let count = 0
    world.query(GemSpendPopup).forEach(() => count++)
    expect(count).toBe(1)
  })
})
