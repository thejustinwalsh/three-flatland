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
 * Rock autotile placeholder atlas. 400 × 20 px = 20 frames × 20×20
 * slots. Frames 0..15 are the standard 4-bit (NSEW) base frames
 * indexed by the autotile mask from `lib/autotile.ts`. Frames 16..19
 * are corner-overlay frames (NW, NE, SW, SE) — alpha-only L-shaped
 * strokes that the renderer composites on top of a base frame to
 * draw inside-of-an-L corner strokes. Without these overlays,
 * connected rocks render as smooth blobs; with them, they read as
 * proper Tetris shapes with 2px black wrapping the concave joints.
 *
 * Each slot has a 16×16 content area centered inside 2px transparent
 * padding (bleed-room for sub-pixel UV math and any future filter
 * swap). White fill everywhere else so runtime tinting via
 * Sprite2DMaterial yields a uniform rock body color with a visible
 * darker outline.
 *
 * UV math at runtime (per frame N):
 *   src x: N * ROCK_AUTOTILE_SLOT + ROCK_AUTOTILE_PAD
 *        → src x + ROCK_AUTOTILE_TILE
 *   src y: ROCK_AUTOTILE_PAD
 *        → src y + ROCK_AUTOTILE_TILE
 *
 * RockCluster rendering uses this asset for the cluster outline.
 * Cross-cluster boundaries
 * render with strokes on both sides — the visible 1-cell air gap
 * that distinguishes touching-but-independent clusters.
 */
export const ROCK_AUTOTILE_URL: string = rockAutotileUrl
export const ROCK_AUTOTILE_W = 400
export const ROCK_AUTOTILE_H = 20
export const ROCK_AUTOTILE_FRAMES = 20
/** First base-frame index (0..15 are NSEW base frames). */
export const ROCK_AUTOTILE_BASE_COUNT = 16
/** Corner-overlay frame indices into ROCK_FRAMES. */
export const ROCK_CORNER_NW_FRAME = 16
export const ROCK_CORNER_NE_FRAME = 17
export const ROCK_CORNER_SW_FRAME = 18
export const ROCK_CORNER_SE_FRAME = 19
/** Padded slot stride — the per-frame width including bleed gutters. */
export const ROCK_AUTOTILE_SLOT = 20
/** Inner content size (the actual rendered tile within each slot). */
export const ROCK_AUTOTILE_TILE = 16
/** Transparent gutter on each side of the content area. */
export const ROCK_AUTOTILE_PAD = 2
