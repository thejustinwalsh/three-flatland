/**
 * Tileset PNG inlined as a base64 data URL via Vite's `?inline`.
 *
 * Source of truth: `planning/superpowers/specs/2026-05-07-driller-mini-tileset.png`,
 * copied to `src/assets/tileset.png` for bundling. Per the mini-game-skill
 * rule, library mode requires assets to be inlined (no external paths).
 */
import tilesetUrl from './assets/tileset.png?inline'
import rockAutotileUrl from './assets/rock-autotile.svg?inline'

/** 1536 × 1024, 8-bit RGB. See spec §11.0 for region layout. */
export const TILESET_URL: string = tilesetUrl

/** Source PNG dimensions — used for UV math. */
export const TILESET_W = 1536
export const TILESET_H = 1024

/**
 * Rock autotile placeholder atlas. 320 × 20 px = 16 frames × 20×20
 * slots, indexed by the 4-bit autotile mask (matches
 * `lib/autotile.ts`). Each slot has a 16×16 content area centered
 * inside 2px transparent padding (bleed-room for sub-pixel UV math
 * and any future filter swap). Frame N has 2px strokes on edges
 * where bit-N is unset (= no neighbor); frame 15 is the stroke-free
 * interior fill. White fill everywhere else so runtime tinting via
 * Sprite2DMaterial yields a uniform rock body color with a visible
 * darker outline.
 *
 * UV math at runtime (per frame N):
 *   src x: N * ROCK_AUTOTILE_SLOT + ROCK_AUTOTILE_PAD
 *        → src x + ROCK_AUTOTILE_TILE
 *   src y: ROCK_AUTOTILE_PAD
 *        → src y + ROCK_AUTOTILE_TILE
 *
 * When Phase 2 (H) wires rocks to RockCluster entities, this asset
 * is the source for the cluster outline. Cross-cluster boundaries
 * render with strokes on both sides — the visible 1-cell air gap
 * that distinguishes touching-but-independent clusters.
 */
export const ROCK_AUTOTILE_URL: string = rockAutotileUrl
export const ROCK_AUTOTILE_W = 320
export const ROCK_AUTOTILE_H = 20
export const ROCK_AUTOTILE_FRAMES = 16
/** Padded slot stride — the per-frame width including bleed gutters. */
export const ROCK_AUTOTILE_SLOT = 20
/** Inner content size (the actual rendered tile within each slot). */
export const ROCK_AUTOTILE_TILE = 16
/** Transparent gutter on each side of the content area. */
export const ROCK_AUTOTILE_PAD = 2
