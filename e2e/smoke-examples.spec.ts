/**
 * End-to-end smoke tests for the production docs build.
 *
 * Probes the built `docs/dist/` via `astro preview` on
 * `http://localhost:4321/three-flatland`. Three tiers of coverage per
 * example:
 *
 * 1. **Artifact (HTTP)** — `request.get` on each example's static URL,
 *    asserts 200 plus a render-surface marker. Catches the case where
 *    an example is missing from `turbo.json`'s `docs#build.dependsOn`,
 *    turbo silently skips it, `copy-examples` skips the missing `dist/`,
 *    and the deployed iframe URL 404s. Failure message names the exact
 *    `example-{type}-<slug>#build` entry to add.
 *
 * 2. **Direct navigation** — Playwright loads the example URL directly
 *    and verifies the live render surface: `<canvas>` mounted, exactly
 *    one Tweakpane root (regression check for StrictMode + Suspense
 *    pane leak), all 5 stats cells injected, FPS > 0 (proves stats
 *    monitor wiring is firing), draw calls > 0 (proves
 *    `scene.onAfterRender` works under R3F v10's phase scheduler), and
 *    the pixel-art contract (`image-rendering: pixelated` for pixel-art
 *    examples; antialiased for `skia` and `slug-text`).
 *
 * 3. **Docs detail page iframe** — navigates the docs example detail
 *    page (`/examples/<slug>/`), locates the iframe, waits for its
 *    contentFrame, asserts a canvas mounts inside. Catches docs-side
 *    iframe-wiring regressions and confirms the user-visible page
 *    actually renders the embedded example.
 *
 * Discovery is filesystem-driven: walks `examples/{three,react}/*` and
 * intersects with `docs/src/content/docs/examples/<slug>.mdx`. Adding a
 * new example wires it into the smoke automatically — no manual
 * inventory list to keep in sync with `turbo.json`.
 *
 * Prereq: `pnpm build` has been run so `docs/dist/` exists. CI's `smoke`
 * job builds before this step (see `.github/workflows/ci.yml`).
 *
 * Run: `pnpm test:smoke` (starts the preview server automatically).
 */

import { test, expect, type Page } from '@playwright/test'
import { readdirSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const ROOT = resolve(__dirname, '..')

// ── Discovery ──────────────────────────────────────────────────────────

/** Slugs whose materials are antialiased — opt-out of the pixel-art
 *  `image-rendering: pixelated` assertion. Everything else defaults to
 *  pixel-art. Keep this list small; only add when a new example ships
 *  with an explicitly non-pixel-art material. */
const NON_PIXELATED = new Set(['skia', 'slug-text'])

interface ExampleSpec {
  /** "<type>/<slug>" — used as the test name and URL segment. */
  path: string
  type: 'three' | 'react'
  slug: string
  /** True → canvas must have `image-rendering: pixelated`. */
  pixelated: boolean
  /** Minimum FPS after settle. Defaults to 1. */
  minFps?: number
  /** Minimum draw calls per frame. Defaults to 1. */
  minDraws?: number
}

/** Discover examples by walking `examples/{three,react}/*` and
 *  intersecting with `docs/src/content/docs/examples/<slug>.mdx`. Both
 *  sides have to exist for a slug to ship to docs; the intersection
 *  drops:
 *  - `template/` (source exists, no detail page — scaffolding only)
 *  - `test.mdx` (detail page exists, no source — dev StackBlitz scratch)
 *  - any future slug present on only one side. */
function discoverExamples(): { slugs: string[]; specs: ExampleSpec[] } {
  const threeDir = resolve(ROOT, 'examples/three')
  const reactDir = resolve(ROOT, 'examples/react')
  const docsExamplesDir = resolve(ROOT, 'docs/src/content/docs/examples')

  const threeSlugs = new Set(
    readdirSync(threeDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name),
  )
  const reactSlugs = new Set(
    readdirSync(reactDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name),
  )

  const slugs: string[] = []
  const specs: ExampleSpec[] = []
  const allSlugs = [...new Set([...threeSlugs, ...reactSlugs])].sort()
  for (const slug of allSlugs) {
    const detailPage = resolve(docsExamplesDir, `${slug}.mdx`)
    if (!existsSync(detailPage)) continue
    // Both sides ship in the standard examples-in-pairs model, but be
    // defensive — emit specs for whichever sides exist on disk.
    slugs.push(slug)
    const pixelated = !NON_PIXELATED.has(slug)
    if (threeSlugs.has(slug)) {
      specs.push({ path: `three/${slug}`, type: 'three', slug, pixelated })
    }
    if (reactSlugs.has(slug)) {
      specs.push({ path: `react/${slug}`, type: 'react', slug, pixelated })
    }
  }
  return { slugs, specs }
}

const { slugs: SLUGS, specs: EXAMPLES } = discoverExamples()

if (EXAMPLES.length === 0) {
  throw new Error(
    'smoke-examples: no examples discovered — filesystem walk found nothing under examples/{three,react} with a matching docs/src/content/docs/examples/<slug>.mdx',
  )
}

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
      const cleaned = s.replace(/ /g, '').trim()
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

// ── Tier 1: build artifacts (HTTP) ─────────────────────────────────────

test.describe('build artifacts', () => {
  for (const spec of EXAMPLES) {
    test(spec.path, async ({ request }) => {
      const url = `/examples/${spec.path}/`
      const response = await request.get(url)
      expect(
        response.status(),
        `${url} returned ${response.status()} — likely missing from docs/dist/examples/${spec.path}/. ` +
          `Check that example-${spec.type}-${spec.slug}#build is in turbo.json's docs#build.dependsOn.`,
      ).toBe(200)
      const html = await response.text()
      // Three.js examples ship the canvas in the HTML; React examples
      // mount at runtime into a root div. Either marker means the
      // artifact was built and copied to docs/dist/.
      expect(
        html,
        `${url} HTML missing expected mount point (no <canvas> or root div)`,
      ).toMatch(/<canvas|<div[^>]+id=["'](?:root|app)["']/)
    })
  }
})

// ── Tier 2: direct navigation per example ──────────────────────────────

test.describe('examples', () => {
  for (const spec of EXAMPLES) {
    test(spec.path, async ({ page }) => {
      const pageErrors: string[] = []
      page.on('pageerror', (e) => pageErrors.push(e.message))

      await page.goto(`/examples/${spec.path}/`, { waitUntil: 'networkidle' })

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

// ── Tier 3: docs detail page iframe ────────────────────────────────────

test.describe('docs detail page iframe', () => {
  for (const slug of SLUGS) {
    test(slug, async ({ page }) => {
      const pageErrors: string[] = []
      page.on('pageerror', (e) => pageErrors.push(e.message))

      await page.goto(`/examples/${slug}/`, { waitUntil: 'networkidle' })

      expect(
        pageErrors,
        `docs detail page /examples/${slug}/ had runtime errors:\n  ${pageErrors.join('\n  ')}`,
      ).toEqual([])

      // ExampleSplitView component renders an iframe pointing at the
      // built example artifact at the same URL Tier 1 probes. If the
      // artifact 404s, the iframe loads Astro's 404 page (no canvas).
      const iframe = page.locator('iframe').first()
      await expect(iframe, 'no iframe found on detail page').toBeVisible()

      const frame = await iframe.contentFrame()
      expect(frame, 'iframe contentFrame unreachable').not.toBeNull()

      // Canvas presence inside the iframe is proof the example loaded
      // and the docs-side iframe wiring is correct.
      const canvas = frame!.locator('canvas').first()
      await expect(
        canvas,
        `iframe for ${slug} did not mount a canvas — likely 404 or runtime error in the iframe`,
      ).toBeAttached({ timeout: 15_000 })
    })
  }
})
