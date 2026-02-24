import { createWorld, type World } from 'koota'
import { initWorld, getBlockCount, subscribeHighScore } from './systems/game'
import { GameState } from './traits'

// Use global to survive HMR, only on client
declare global {
  // eslint-disable-next-line no-var
  var __breakoutWorld: World | undefined
}

/** Get or create the world (lazy, client-only) */
export function getWorld(): World {
  // Skip on server
  if (typeof window === 'undefined') {
    throw new Error('World can only be accessed on the client')
  }

  // Reuse from globalThis if available and valid (has GameState trait)
  if (globalThis.__breakoutWorld && globalThis.__breakoutWorld.has(GameState)) {
    return globalThis.__breakoutWorld
  }

  // Create new world
  const world = createWorld()
  initWorld(world)
  subscribeHighScore(world)
  globalThis.__breakoutWorld = world

  console.log('World created, blocks:', getBlockCount(world))

  return world
}
