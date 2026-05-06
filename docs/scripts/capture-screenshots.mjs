#!/usr/bin/env node
// docs/scripts/capture-screenshots.mjs
//
// Captures the docs site's hero/comparison screenshots from running examples.
// Saves PNGs to docs/public/diagrams/ replacing the SVG placeholders.
//
// Usage:
//   1. Start the dev server in one shell:    pnpm dev
//   2. Run this script in another shell:     node docs/scripts/capture-screenshots.mjs
//
// Requires: playwright (npx playwright install chromium  on first run).
//
// Each capture pulls pixels off the largest <canvas> on the page (the scene
// canvas — not Tweakpane stats sparklines) and writes a PNG. Where a "before"
// state can't be reproduced via UI controls (e.g. the lighting example doesn't
// have a kill-lighting toggle), the corresponding placeholder SVG stays in place
// and the script logs a SKIP.
//
// Add new captures by appending to TARGETS. Each entry is { url, file, name,
// setup?: async (page) => void }.

import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { mkdirSync } from 'node:fs'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = resolve(HERE, '../public/diagrams')
mkdirSync(OUT_DIR, { recursive: true })

const ORIGIN = process.env.DOCS_DEV_ORIGIN ?? 'http://localhost:5173'

/**
 * Wait for the example to render at least one non-blank frame, then return
 * the largest canvas on the page (the scene canvas).
 */
async function findSceneCanvas(page) {
  await page.waitForFunction(() => {
    const c = Array.from(document.querySelectorAll('canvas'))
    if (!c.length) return false
    const main = c.reduce((a, b) => (a.width * a.height >= b.width * b.height ? a : b))
    return main.width > 200 && main.height > 200
  }, { timeout: 15_000 })
  return page.evaluateHandle(() => {
    const c = Array.from(document.querySelectorAll('canvas'))
    return c.reduce((a, b) => (a.width * a.height >= b.width * b.height ? a : b))
  })
}

/** Pull canvas pixels via toDataURL and return a Buffer. */
async function captureCanvas(page) {
  const handle = await findSceneCanvas(page)
  // Give the demo a few frames to settle.
  await page.waitForTimeout(800)
  const dataUrl = await handle.evaluate((c) => c.toDataURL('image/png'))
  const base64 = dataUrl.split(',')[1]
  return Buffer.from(base64, 'base64')
}

/**
 * Set a Tweakpane slider value by label. Tweakpane v4 wires labels to a
 * sibling input. Returns true if the slider was found and updated.
 */
async function setTweakpaneValue(page, label, value) {
  return page.evaluate(
    ([label, value]) => {
      const labels = Array.from(document.querySelectorAll('.tp-lblv_l'))
      for (const el of labels) {
        if (el.textContent?.trim().toLowerCase() === label.toLowerCase()) {
          const row = el.closest('.tp-lblv')
          const input = row?.querySelector('input.tp-txtv_i')
          if (input) {
            input.value = String(value)
            input.dispatchEvent(new Event('change', { bubbles: true }))
            return true
          }
        }
      }
      return false
    },
    [label, value],
  )
}

const TARGETS = [
  {
    name: 'lighting hero',
    url: `${ORIGIN}/three/lighting/`,
    file: 'lighting-on.png',
    setup: async () => {},
  },
  {
    name: 'shadows on (strength=1)',
    url: `${ORIGIN}/three/lighting/`,
    file: 'shadows-on.png',
    setup: async (page) => {
      await setTweakpaneValue(page, 'strength', 1)
      await page.waitForTimeout(400)
    },
  },
  {
    name: 'shadows off (strength=0)',
    url: `${ORIGIN}/three/lighting/`,
    file: 'shadows-off.png',
    setup: async (page) => {
      await setTweakpaneValue(page, 'strength', 0)
      await page.waitForTimeout(400)
    },
  },
  {
    name: 'cel bands on (4)',
    url: `${ORIGIN}/three/lighting/`,
    file: 'cel-on.png',
    setup: async (page) => {
      await setTweakpaneValue(page, 'bands', 4)
      await page.waitForTimeout(400)
    },
  },
  {
    name: 'cel bands off (0)',
    url: `${ORIGIN}/three/lighting/`,
    file: 'cel-off.png',
    setup: async (page) => {
      await setTweakpaneValue(page, 'bands', 0)
      await page.waitForTimeout(400)
    },
  },
  {
    name: 'pass-effects on',
    url: `${ORIGIN}/three/pass-effects/`,
    file: 'passfx-on.png',
    setup: async () => {},
  },
  {
    name: 'tilemap atlas',
    url: `${ORIGIN}/three/tilemap/`,
    file: 'tilemap-atlas-grid.png',
    setup: async () => {},
  },
  // Devtools dashboard is HTML, not canvas. Capture it via page.screenshot
  // when the dashboard URL is loaded with a Flatland scene as provider.
  {
    name: 'devtools dashboard',
    url: `${ORIGIN}/three-flatland/`, // adjust to actual /.devtools URL once known
    file: 'devtools-dashboard.png',
    htmlScreenshot: true,
    setup: async () => {
      // Caller must arrange a scene to be running with devtools enabled.
    },
  },
]

async function main() {
  const browser = await chromium.launch({
    headless: true,
    args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan'],
  })
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } })
  const page = await context.newPage()

  let ok = 0
  let skipped = 0
  for (const t of TARGETS) {
    try {
      console.log(`▶ ${t.name}`)
      await page.goto(t.url, { waitUntil: 'networkidle', timeout: 15_000 })
      if (t.setup) await t.setup(page)
      let buffer
      if (t.htmlScreenshot) {
        buffer = await page.screenshot({ fullPage: false })
      } else {
        buffer = await captureCanvas(page)
      }
      const out = resolve(OUT_DIR, t.file)
      const fs = await import('node:fs/promises')
      await fs.writeFile(out, buffer)
      console.log(`  ✓ ${t.file} (${buffer.length} bytes)`)
      ok++
    } catch (err) {
      console.log(`  ⊘ skipped — ${err.message}`)
      skipped++
    }
  }

  await browser.close()
  console.log(`\nDone. ${ok} captured, ${skipped} skipped.`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
