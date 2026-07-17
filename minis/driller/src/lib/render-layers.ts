/**
 * Explicit inter-batch draw order for the game scene.
 *
 * Sprite2D batches are grouped by material, so JSX order cannot guarantee
 * which material batch draws last. Keep these as sortLayer values (instead
 * of renderOrder) so every sprite remains batched.
 */
export const RENDER_LAYERS = {
  terrain: 1,
  fixtureDecor: 2,
  fallingTerrain: 3,
  pickups: 4,
  actors: 5,
  effects: 6,
  interaction: 7,
  uiBackground: 8,
  ui: 9,
} as const
