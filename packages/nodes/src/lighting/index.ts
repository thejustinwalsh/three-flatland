// Normal map generation
export { normalFromHeight, normalFromHeightSmooth } from './normalFromHeight'
export { normalFromSprite, normalFromSpriteRounded } from './normalFromSprite'

// Light types
export { pointLight2D, spotLight2D, directionalLight2D, ambientLight2D } from './lights'
export type { Light2DResult } from './lights'

// Lighting calculations
export { litDiffuse, litSpecular, litRim, litCelShaded, litSprite, litSpriteMulti } from './lit'
export type { LitSpriteOptions } from './lit'

// Shadows
export { shadowDrop, shadowDropSoft, shadow2D, shadowSoft2D } from './shadows'
