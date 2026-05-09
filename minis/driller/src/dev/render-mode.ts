/**
 * Dev-only rendering mode toggle. Lets the debug panel flip the
 * TileRenderer between normal and "anchor heatmap" mode at runtime.
 *
 * Same packaging story as `render-instrument.ts`: every export is
 * gated on `import.meta.env.DEV`. Vite dev keeps the toggle live;
 * tsup/vite production builds replace the gate with `false` and
 * tree-shake the whole module.
 */

export type RenderMode = 'normal' | 'anchor-heatmap'

/**
 * Read the current render mode. Returns `'normal'` outside of dev.
 * The renderer should branch on this once per frame.
 */
export function getRenderMode(): RenderMode {
  if (!import.meta.env.DEV) return 'normal'
  if (typeof window === 'undefined') return 'normal'
  return (window as unknown as { __drillerRenderMode?: RenderMode })
    .__drillerRenderMode ?? 'normal'
}

/**
 * Flip render mode. Called by the dev panel's heatmap toggle button.
 */
export function setRenderMode(mode: RenderMode): void {
  if (!import.meta.env.DEV) return
  if (typeof window === 'undefined') return
  ;(window as unknown as { __drillerRenderMode?: RenderMode })
    .__drillerRenderMode = mode
}

/**
 * Pick a placeholder heatmap tint based on the cell's
 * distance-to-nearest-anchor. The legend (in the dev panel) maps
 * roughly to:
 *
 *   d == 0           BLACK     anchor itself (STONE / FIXTURE / wall)
 *   d == -1 (AIR)    SKIP      caller renders AIR normally
 *   d in [1, 3]      cool      very stable
 *   d in [4, 7]      yellow    stable
 *   d in [8, MAX-1]  orange    near edge
 *   d == MAX_REACH   red-orange (right at the threshold)
 *   d > MAX_REACH    red       will fall
 *   d == -1 (SOIL)   magenta   unreachable (anomalous)
 *
 * Tints are a flat color (no biome modulation). The mode is for
 * stepping through the cantilever rule, not for game-feel polish.
 */
export function heatmapTint(
  distance: number,
  maxReach: number,
): readonly [number, number, number] | null {
  if (distance === -1) return [0.85, 0.0, 0.85] // unreachable SOIL — anomaly
  if (distance === 0) return [0, 0, 0] // anchor → black
  if (distance <= 3) return [0.2, 0.55, 0.45]
  if (distance <= 7) return [0.65, 0.85, 0.35]
  if (distance < maxReach) return [0.95, 0.6, 0.2]
  if (distance === maxReach) return [0.95, 0.4, 0.1]
  return [0.95, 0.18, 0.18] // > maxReach: will fall
}
