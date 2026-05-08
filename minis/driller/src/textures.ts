/**
 * Tileset PNG inlined as a base64 data URL via Vite's `?inline`.
 *
 * Source of truth: `planning/superpowers/specs/2026-05-07-driller-mini-tileset.png`,
 * copied to `src/assets/tileset.png` for bundling. Per the mini-game-skill
 * rule, library mode requires assets to be inlined (no external paths).
 */
import tilesetUrl from './assets/tileset.png?inline'

/** 1536 × 1024, 8-bit RGB. See spec §11.0 for region layout. */
export const TILESET_URL: string = tilesetUrl

/** Source PNG dimensions — used for UV math. */
export const TILESET_W = 1536
export const TILESET_H = 1024
