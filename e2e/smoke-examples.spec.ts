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
 *    Pixel-art vs antialiased rendering is not asserted — that contract
 *    is too easy to forget to maintain when adding non-pixel-art
 *    examples, and the resulting test failures aren't worth the silent-
 *    drift risk of an opt-out list.
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

/** Slugs that live in `examples/{three,react}/<slug>/` by design WITHOUT
 *  a corresponding `docs/src/content/docs/examples/<slug>.mdx`. These
 *  examples are not shipped to docs visitors — they're internal tools
 *  (e.g. `template/` is scaffolding for creating new examples). The
 *  bidirectional discovery check below would otherwise fail on them. */
const SOURCE_ONLY = new Set(['template'])

/** Slugs that live in `docs/src/content/docs/examples/<slug>.mdx` by
 *  design WITHOUT corresponding `examples/{three,react}/<slug>/` source
 *  (e.g. `test.mdx` is a dev StackBlitz scratch page that embeds an
 *  existing example by name rather than shipping its own). */
const DOCS_ONLY = new Set(['test'])

interface ExampleSpec {
  /** "<type>/<slug>" — used as the test name and URL segment. */
  path: string
  type: 'three' | 'react'
  slug: string
  /** Minimum FPS after settle. Defaults to 1. */
  minFps?: number
  /** Minimum draw calls per frame. Defaults to 1. */
  minDraws?: number
}

/** Capture file extensions every shipped example must have in
 *  `docs/public/captures/<slug>.<ext>`. The gallery tile at `/examples/`
 *  uses the poster image, swaps in the webm on hover. Missing files
 *  render as broken images in the gallery. `pnpm capture:examples`
 *  produces all three formats for every example. */
const CAPTURE_EXTS = ['png', 'webp', 'webm'] as const

/** Bidirectional discovery + validation:
 *
 *  1. Every `examples/three/<slug>/` must have a paired
 *     `examples/react/<slug>/` (AGENTS.md: "examples always exist in
 *     pairs"), unless allow-listed in SOURCE_ONLY.
 *  2. Every `examples/react/<slug>/` must have a paired
 *     `examples/three/<slug>/`, same exception.
 *  3. Every source slug must have a `<slug>.mdx` detail page, unless in
 *     SOURCE_ONLY.
 *  4. Every `<slug>.mdx` detail page must have source on both sides,
 *     unless in DOCS_ONLY.
 *  5. Every shipped slug (passes 1-4) must have all three capture files
 *     in `docs/public/captures/`. Failure → `pnpm capture:examples`.
 *
 *  Any mismatch throws with a precise diagnostic naming what's missing
 *  and which allow-list to add it to if the asymmetry is intentional.
 *  This catches silent-drop bugs where someone adds an example without
 *  a docs page (or vice versa) and the smoke quietly loses coverage. */
function discoverAndValidate(): { slugs: string[]; specs: ExampleSpec[] } {
  const threeDir = resolve(ROOT, 'examples/three')
  const reactDir = resolve(ROOT, 'examples/react')
  const docsExamplesDir = resolve(ROOT, 'docs/src/content/docs/examples')
  const capturesDir = resolve(ROOT, 'docs/public/captures')

  const threeSlugs = new Set(
    readdirSync(threeDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
  )
  const reactSlugs = new Set(
    readdirSync(reactDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
  )
  const docsSlugs = new Set(
    readdirSync(docsExamplesDir, { withFileTypes: true })
      .filter((d) => d.isFile() && d.name.endsWith('.mdx') && d.name !== 'index.mdx')
      .map((d) => d.name.slice(0, -'.mdx'.length))
  )

  const errors: string[] = []

  // (1) three has react pair
  for (const slug of threeSlugs) {
    if (reactSlugs.has(slug)) continue
    if (SOURCE_ONLY.has(slug)) continue
    errors.push(
      `examples/three/${slug}/ has no paired examples/react/${slug}/. ` +
        `Either create the React pair or add '${slug}' to SOURCE_ONLY.`
    )
  }

  // (2) react has three pair
  for (const slug of reactSlugs) {
    if (threeSlugs.has(slug)) continue
    if (SOURCE_ONLY.has(slug)) continue
    errors.push(
      `examples/react/${slug}/ has no paired examples/three/${slug}/. ` +
        `Either create the Three.js pair or add '${slug}' to SOURCE_ONLY.`
    )
  }

  // (3) source has docs detail page
  const sourceSlugs = new Set([...threeSlugs, ...reactSlugs])
  for (const slug of sourceSlugs) {
    if (docsSlugs.has(slug)) continue
    if (SOURCE_ONLY.has(slug)) continue
    errors.push(
      `examples/{three,react}/${slug}/ has no docs/src/content/docs/examples/${slug}.mdx. ` +
        `Either create the detail page or add '${slug}' to SOURCE_ONLY.`
    )
  }

  // (4) docs has source pair
  for (const slug of docsSlugs) {
    if (threeSlugs.has(slug) && reactSlugs.has(slug)) continue
    if (DOCS_ONLY.has(slug)) continue
    const missing: string[] = []
    if (!threeSlugs.has(slug)) missing.push(`examples/three/${slug}/`)
    if (!reactSlugs.has(slug)) missing.push(`examples/react/${slug}/`)
    errors.push(
      `docs/src/content/docs/examples/${slug}.mdx exists but missing source: ${missing.join(', ')}. ` +
        `Either create the example pair or add '${slug}' to DOCS_ONLY.`
    )
  }

  // (5) shipped slug has all required capture files
  for (const slug of docsSlugs) {
    if (!threeSlugs.has(slug) || !reactSlugs.has(slug)) continue
    if (DOCS_ONLY.has(slug)) continue
    const missing = CAPTURE_EXTS.filter((ext) => !existsSync(resolve(capturesDir, `${slug}.${ext}`)))
    if (missing.length > 0) {
      errors.push(
        `docs/public/captures/${slug}.{${missing.join(',')}} missing. ` +
          `Run \`pnpm capture:examples\` to regenerate the gallery assets.`
      )
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `smoke-examples: example/docs inventory is inconsistent (${errors.length} issue${errors.length === 1 ? '' : 's'}):\n` +
        errors.map((e) => `  - ${e}`).join('\n')
    )
  }

  // Build the test inventory from validated slugs — three + react +
  // docs all present, no allow-list exceptions among them.
  const slugs: string[] = []
  const specs: ExampleSpec[] = []
  for (const slug of [...docsSlugs].sort()) {
    if (!threeSlugs.has(slug) || !reactSlugs.has(slug)) continue
    slugs.push(slug)
    specs.push({ path: `three/${slug}`, type: 'three', slug })
    specs.push({ path: `react/${slug}`, type: 'react', slug })
  }
  return { slugs, specs }
}

const { slugs: SLUGS, specs: EXAMPLES } = discoverAndValidate()

if (EXAMPLES.length === 0) {
  throw new Error(
    'smoke-examples: no examples discovered after bidirectional validation — filesystem walk found no slugs with three + react + docs all present'
  )
}

const REQUIRED_STATS_TOOLTIPS = ['Draw Calls', 'Triangles', 'Geometries', 'Textures', 'Primitives (lines + points)']

// ── Page helpers ───────────────────────────────────────────────────────

interface StatsSnapshot {
  paneCount: number
  fps: number | null
  draws: number | null
  tris: number | null
  geoms: number | null
  textures: number | null
  prims: number | null
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

    const cells = Array.from(document.querySelectorAll('.tp-flatland-statsrow-cell')) as HTMLElement[]
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
      hasCanvas: !!canvas,
      tooltips,
    }
  })
}

/** Poll `collectStats` until the stats row + FPS are populated (or time out). */
async function waitForStats(page: Page, { timeoutMs = 8000, intervalMs = 250 } = {}): Promise<StatsSnapshot> {
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
      hasCanvas: false,
      tooltips: [],
    }
  )
}

// ── Tier 1: build artifacts (HTTP) ─────────────────────────────────────

test.describe('build artifacts', () => {
  for (const spec of EXAMPLES) {
    test(spec.path, async ({ request }) => {
      // Relative URL (no leading slash) so it composes against
      // baseURL's `/three-flatland/` path segment. A leading `/`
      // would resolve to host root and bypass the base, 404'ing.
      const url = `examples/${spec.path}/`
      const response = await request.get(url)
      expect(
        response.status(),
        `${url} returned ${response.status()} — likely missing from docs/dist/examples/${spec.path}/. ` +
          `Check that example-${spec.type}-${spec.slug}#build is in turbo.json's docs#build.dependsOn.`
      ).toBe(200)
      const html = await response.text()
      // Vite's prod build emits `<script type="module" crossorigin
      // src="./assets/index-<hash>.js">` as the entry tag — present in
      // both Three.js examples (empty body, JS creates the canvas) and
      // React examples (root div + JS hydrates). Matching this proves
      // the artifact came out of `vite build`, not the Astro 404 page.
      expect(
        html,
        `${url} HTML missing the bundled entry script (no <script ... src="./assets/...">) — likely served Astro 404 or an unbuilt placeholder`
      ).toMatch(/<script[^>]+src=["']\.\/assets\//)
    })
  }
})

// ── Tier 2: direct navigation per example ──────────────────────────────

test.describe('examples', () => {
  for (const spec of EXAMPLES) {
    test(spec.path, async ({ page }) => {
      const pageErrors: string[] = []
      page.on('pageerror', (e) => pageErrors.push(e.message))

      await page.goto(`examples/${spec.path}/`, { waitUntil: 'networkidle' })

      const snapshot = await waitForStats(page)

      // No runtime errors on the page.
      expect(pageErrors, `page errors in ${spec.path}:\n  ${pageErrors.join('\n  ')}`).toEqual([])

      // Core DOM presence.
      expect(snapshot.hasCanvas, 'canvas element').toBe(true)
      expect(
        snapshot.paneCount,
        'exactly 1 Tweakpane root (regression: usePane leak under StrictMode + Suspense)'
      ).toBe(1)

      // Stats row tooltips — all 5 cells must be present with their field names.
      for (const t of REQUIRED_STATS_TOOLTIPS) {
        expect(snapshot.tooltips, `stats row tooltip "${t}"`).toContain(t)
      }

      // FPS — the graph's begin/end wiring must be firing.
      expect(snapshot.fps, 'FPS rendered').not.toBeNull()
      expect(snapshot.fps!, 'FPS above threshold').toBeGreaterThanOrEqual(spec.minFps ?? 1)

      // Draw calls — scene.onAfterRender / manual stats.update wiring works.
      expect(snapshot.draws, 'Draw Calls rendered').not.toBeNull()
      expect(snapshot.draws!, 'Draw Calls above threshold').toBeGreaterThanOrEqual(spec.minDraws ?? 1)
    })
  }
})

// ── Tier 3: docs detail page iframe ────────────────────────────────────

/**
 * For each slug, probe three URL shapes of the docs detail page:
 *
 * - **bare link** (`/examples/<slug>/`) — exercises the default-variant
 *   path that most users hit when they click through from the gallery.
 *   Iframe should resolve to the three side via `restoreVariant()`'s
 *   sessionStorage-or-default branch.
 *
 * - **`?pkg=three`** — exercises the URL param branch resolving to the
 *   same three side as the bare link. Confirms the param parser handles
 *   the explicit case (not just `react`).
 *
 * - **`?pkg=react`** — exercises the URL param branch resolving to the
 *   React side. The only path that confirms React-side iframe wiring
 *   works end-to-end through the detail page.
 *
 * Each test asserts the iframe's resolved src matches the expected
 * variant and that a canvas mounts inside its contentFrame.
 */
const DETAIL_URL_SHAPES = [
  { query: '', expected: 'three' as const, label: 'bare' },
  { query: '?pkg=three', expected: 'three' as const, label: '?pkg=three' },
  { query: '?pkg=react', expected: 'react' as const, label: '?pkg=react' },
]

test.describe('docs detail page iframe', () => {
  for (const slug of SLUGS) {
    for (const shape of DETAIL_URL_SHAPES) {
      test(`${slug} (${shape.label})`, async ({ page }) => {
        const pageErrors: string[] = []
        page.on('pageerror', (e) => pageErrors.push(e.message))

        const url = `examples/${slug}/${shape.query}`
        // `domcontentloaded`, NOT `networkidle`: the detail page hosts a
        // live-rendering example iframe (continuous rAF) plus the docs
        // chrome (syntax-highlight, fonts, capture preloads), so the
        // network never goes quiet for 500 ms and `networkidle` times
        // out even though the page is fully functional. Playwright
        // discourages `networkidle` for exactly this reason. The
        // deterministic web-assertions below (iframe visible, resolved
        // src, canvas attached) are the real readiness gates.
        await page.goto(url, { waitUntil: 'domcontentloaded' })

        const iframe = page.locator('iframe').first()
        await expect(iframe, 'no iframe found on detail page').toBeVisible()

        // The iframe's resolved src tells us which variant the page
        // actually loaded. Guards against the URL param being ignored
        // and against the default-variant branch regressing.
        const src = await iframe.getAttribute('src')
        expect(src, `iframe src for ${shape.label} did not point at /examples/${shape.expected}/${slug}/`).toContain(
          `/examples/${shape.expected}/${slug}/`
        )

        // If the artifact 404s, the iframe loads Astro's 404 page —
        // no canvas mounts. Same failure mode the user-visible page
        // hits in production. The toBeAttached check below is the
        // real guard; contentFrame() is sync and never returns null.
        const frame = iframe.contentFrame()
        const canvas = frame.locator('canvas').first()
        await expect(
          canvas,
          `iframe for ${slug} (${shape.label}) did not mount a canvas — likely 404 or runtime error in the iframe`
        ).toBeAttached({ timeout: 15_000 })

        // Error check runs last: the canvas-attached wait above gives
        // the iframe + parent page time to surface any runtime errors
        // through the `pageerror` listener before we assert on them.
        expect(pageErrors, `docs detail page ${url} had runtime errors:\n  ${pageErrors.join('\n  ')}`).toEqual([])
      })
    }
  }
})

// ── Tier 4: gallery captures (HTTP) ────────────────────────────────────

/**
 * Per-slug HTTP probe of each gallery asset. Discovery already verified
 * the files exist on disk; this confirms they're served correctly
 * through the preview path with a content type that won't render as a
 * broken image / video. Catches the case where the file ships but the
 * deploy pipeline strips or mis-routes `public/captures/`.
 */
const CAPTURE_CONTENT_TYPES = {
  png: 'image/',
  webp: 'image/',
  webm: 'video/',
} as const

test.describe('gallery captures', () => {
  for (const slug of SLUGS) {
    for (const ext of CAPTURE_EXTS) {
      test(`${slug}.${ext}`, async ({ request }) => {
        const url = `captures/${slug}.${ext}`
        const response = await request.get(url)
        expect(
          response.status(),
          `${url} returned ${response.status()} — gallery tile for ${slug} will render broken. ` +
            `Run \`pnpm capture:examples\` and confirm the file lands in docs/public/captures/.`
        ).toBe(200)
        const contentType = response.headers()['content-type'] ?? ''
        expect(
          contentType,
          `${url} content-type was "${contentType}", expected to start with "${CAPTURE_CONTENT_TYPES[ext]}"`
        ).toMatch(new RegExp(`^${CAPTURE_CONTENT_TYPES[ext]}`))
      })
    }
  }
})
