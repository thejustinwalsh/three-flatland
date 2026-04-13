/**
 * End-to-end smoke test for every example in the monorepo.
 *
 * For each example we verify:
 *
 *   - The page loads without any runtime errors.
 *   - A `<canvas>` was mounted.
 *   - Exactly ONE Tweakpane root view is attached — regression check for
 *     the StrictMode + Suspense pane-leak we used to see (up to 3 orphan
 *     panes in React).
 *   - The stats row was injected with all expected tooltips.
 *   - The FPS graph shows a non-zero value (proves `useStatsMonitor` /
 *     vanilla `stats.begin/end` wiring is actually firing).
 *   - Draw calls captured via `scene.onAfterRender` are non-zero (proves
 *     the auto-wiring path works against R3F v10's phase scheduler).
 *   - Pixel-art examples have `image-rendering: pixelated` on their
 *     canvas; `skia` (the only antialiased example) does not.
 *
 * Run: `pnpm test:smoke` (starts the dev server automatically).
 */

import { test, expect, type Page } from '@playwright/test'

// ── Example inventory ──────────────────────────────────────────────────

interface ExampleSpec {
  path: string
  /** True → canvas must have `image-rendering: pixelated`. */
  pixelated: boolean
  /** Minimum FPS after settle. Defaults to 1. */
  minFps?: number
  /** Minimum draw calls per frame. Defaults to 1. */
  minDraws?: number
}

const EXAMPLES: ExampleSpec[] = [
  // Three.js (vanilla)
  { path: 'three/basic-sprite', pixelated: true },
  { path: 'three/template', pixelated: true },
  { path: 'three/animation', pixelated: true },
  { path: 'three/tsl-nodes', pixelated: true },
  { path: 'three/pass-effects', pixelated: true },
  { path: 'three/tilemap', pixelated: true },
  { path: 'three/batch-demo', pixelated: true },
  { path: 'three/knightmark', pixelated: true },
  { path: 'three/skia', pixelated: false },

  // React Three Fiber
  { path: 'react/basic-sprite', pixelated: true },
  { path: 'react/template', pixelated: true },
  { path: 'react/animation', pixelated: true },
  { path: 'react/tsl-nodes', pixelated: true },
  { path: 'react/pass-effects', pixelated: true },
  { path: 'react/tilemap', pixelated: true },
  { path: 'react/batch-demo', pixelated: true },
  { path: 'react/knightmark', pixelated: true },
  { path: 'react/skia', pixelated: false },
]

const REQUIRED_STATS_TOOLTIPS = [
  'Draw Calls',
  'Triangles',
  'Geometries',
  'Textures',
  'Primitives (lines + points)',
]

// ── Page helpers ───────────────────────────────────────────────────────

interface StatsSnapshot {
  paneCount: number
  fps: number | null
  draws: number | null
  tris: number | null
  geoms: number | null
  textures: number | null
  prims: number | null
  imageRendering: string | null
  hasCanvas: boolean
  tooltips: string[]
}

async function collectStats(page: Page): Promise<StatsSnapshot> {
  return await page.evaluate(() => {
    const scaleSuffix = (s: string): number => {
      if (/K/i.test(s)) return 1000
      if (/M/i.test(s)) return 1_000_000
      if (/B/i.test(s)) return 1_000_000_000
      return 1
    }
    const parseStat = (s: string | null): number | null => {
      if (!s) return null
      const cleaned = s.replace(/\u00A0/g, '').trim()
      if (!cleaned) return null
      const numeric = cleaned.replace(/[^\d.-]/g, '')
      const base = Number(numeric)
      if (!Number.isFinite(base)) return null
      return base * scaleSuffix(cleaned)
    }

    const fpsRaw = document.querySelector('.tp-fpsv_v')?.textContent ?? null

    const cells = Array.from(
      document.querySelectorAll('.tp-flatland-statsrow-cell'),
    ) as HTMLElement[]
    const valueByTitle: Record<string, string | null> = {}
    const tooltips: string[] = []
    for (const cell of cells) {
      const title = cell.title ?? ''
      tooltips.push(title)
      valueByTitle[title] = cell.querySelector('span:last-child')?.textContent ?? null
    }

    const canvas = document.querySelector('canvas')

    return {
      paneCount: document.querySelectorAll('.tp-rotv').length,
      fps: parseStat(fpsRaw),
      draws: parseStat(valueByTitle['Draw Calls'] ?? null),
      tris: parseStat(valueByTitle['Triangles'] ?? null),
      geoms: parseStat(valueByTitle['Geometries'] ?? null),
      textures: parseStat(valueByTitle['Textures'] ?? null),
      prims: parseStat(valueByTitle['Primitives (lines + points)'] ?? null),
      imageRendering: canvas ? getComputedStyle(canvas).imageRendering : null,
      hasCanvas: !!canvas,
      tooltips,
    }
  })
}

/** Poll `collectStats` until the stats row + FPS are populated (or time out). */
async function waitForStats(
  page: Page,
  { timeoutMs = 8000, intervalMs = 250 } = {},
): Promise<StatsSnapshot> {
  const deadline = Date.now() + timeoutMs
  let last: StatsSnapshot | null = null
  while (Date.now() < deadline) {
    last = await collectStats(page)
    const ready =
      last.hasCanvas &&
      last.paneCount >= 1 &&
      last.fps !== null &&
      last.fps > 0 &&
      last.draws !== null &&
      last.draws > 0
    if (ready) return last
    await page.waitForTimeout(intervalMs)
  }
  return (
    last ?? {
      paneCount: 0,
      fps: null,
      draws: null,
      tris: null,
      geoms: null,
      textures: null,
      prims: null,
      imageRendering: null,
      hasCanvas: false,
      tooltips: [],
    }
  )
}

// ── Suite ───────────────────────────────────────────────────────────────

test.describe('examples smoke', () => {
  for (const spec of EXAMPLES) {
    test(spec.path, async ({ page }) => {
      const pageErrors: string[] = []
      page.on('pageerror', (e) => pageErrors.push(e.message))

      await page.goto(`/${spec.path}/`, { waitUntil: 'networkidle' })

      const snapshot = await waitForStats(page)

      // No runtime errors on the page.
      expect(
        pageErrors,
        `page errors in ${spec.path}:\n  ${pageErrors.join('\n  ')}`,
      ).toEqual([])

      // Core DOM presence.
      expect(snapshot.hasCanvas, 'canvas element').toBe(true)
      expect(
        snapshot.paneCount,
        'exactly 1 Tweakpane root (regression: usePane leak under StrictMode + Suspense)',
      ).toBe(1)

      // Stats row tooltips — all 5 cells must be present with their field names.
      for (const t of REQUIRED_STATS_TOOLTIPS) {
        expect(snapshot.tooltips, `stats row tooltip "${t}"`).toContain(t)
      }

      // FPS — the graph's begin/end wiring must be firing.
      expect(snapshot.fps, 'FPS rendered').not.toBeNull()
      expect(snapshot.fps!, 'FPS above threshold').toBeGreaterThanOrEqual(
        spec.minFps ?? 1,
      )

      // Draw calls — scene.onAfterRender / manual stats.update wiring works.
      expect(snapshot.draws, 'Draw Calls rendered').not.toBeNull()
      expect(
        snapshot.draws!,
        'Draw Calls above threshold',
      ).toBeGreaterThanOrEqual(spec.minDraws ?? 1)

      // Pixel-art contract.
      if (spec.pixelated) {
        expect(
          snapshot.imageRendering,
          `${spec.path} should have image-rendering: pixelated`,
        ).toBe('pixelated')
      } else {
        expect(
          snapshot.imageRendering,
          `${spec.path} should not be pixelated`,
        ).not.toBe('pixelated')
      }
    })
  }
})
