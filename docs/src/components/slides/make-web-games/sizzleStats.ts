// Live stats bridge: the in-canvas sizzle writes here each frame; the DOM HUD on
// the slide polls it. Plain module state (no React notify) to avoid per-frame renders.
export type SizzleStats = { spriteCount: number; fps: number }

let stats: SizzleStats = { spriteCount: 0, fps: 0 }

export function setSizzleStats(next: SizzleStats): void {
  stats = next
}

export function getSizzleStats(): SizzleStats {
  return stats
}
