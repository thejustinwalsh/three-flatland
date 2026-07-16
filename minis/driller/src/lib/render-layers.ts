/**
 * Explicit inter-batch draw order for the game scene.
 *
 * Sprite2D batches are grouped by material, so JSX order cannot guarantee
 * which material batch draws last. Keep these as sortLayer values (instead
 * of renderOrder) so every sprite remains batched.
 */
export const RENDER_LAYERS = {
  terrain: 1,
  fallingTerrain: 2,
  pickups: 3,
  actors: 4,
  effects: 5,
  interaction: 6,
  uiBackground: 7,
  ui: 8,
} as const
