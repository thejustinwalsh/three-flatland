import { expect, test, type Page } from '@playwright/test'

/**
 * End-to-end smoke test — the dev server is started by `playwright.config.ts`.
 *
 * Two claims, and only two:
 *
 *   1. The scene actually paints. A WebGPU/WebGL canvas cannot be read back with
 *      `toDataURL` (the drawing buffer is not preserved), so the only honest way
 *      to inspect a frame is `page.screenshot()`, which composites it correctly.
 *      "Painted" means tonal spread, not a golden image — a solid clear colour
 *      has a channel standard deviation near zero, a real frame does not.
 *
 *   2. Pointer events reach the sprite. Hovering tints it (`#47cca9`), so the
 *      red:green ratio of the frame drops. That is a causal signal: the sprite
 *      spins continuously, so "the pixels changed" alone would prove nothing.
 *      This is the coupling most likely to break silently — R3F's raycaster and
 *      Flatland's camera must agree about where the sprite is, and a static
 *      render check stays green while hit testing is stone dead.
 */

const HOVER_TINT_DROP = 0.9 // hovering must pull red:green to under 90% of idle

test('renders the sprite and responds to the pointer', async ({ page }) => {
  const consoleErrors: string[] = []
  page.on('pageerror', (e) => consoleErrors.push(String(e)))
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text())
  })

  await page.goto('/')

  // The canvas only mounts once <Suspense> resolves the texture, so its
  // presence is the app's own "ready" signal — no sleep-and-hope needed.
  const canvas = page.locator('canvas').first()
  await expect(canvas).toBeVisible()

  await settle(page)
  const idle = await sampleSprite(page)
  expect(idle.stdDev, 'the frame is a flat fill — nothing was drawn').toBeGreaterThan(8)

  const box = await canvas.boundingBox()
  expect(box).not.toBeNull()
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)
  await settle(page)
  const hovered = await sampleSprite(page)

  expect(
    hovered.redToGreen,
    'hovering did not tint the sprite — pointer events are not reaching it'
  ).toBeLessThan(idle.redToGreen * HOVER_TINT_DROP)

  expect(consoleErrors, `console/page errors:\n${consoleErrors.join('\n')}`).toEqual([])
})

/** Let the render loop run enough frames for the hover ease to land. */
async function settle(page: Page): Promise<void> {
  await page.waitForTimeout(900)
}

interface FrameSample {
  /** Largest per-channel standard deviation — the "was anything drawn" term. */
  stdDev: number
  /** Mean red over mean green. Tinting the sprite moves this; spinning it does not. */
  redToGreen: number
}

/**
 * Screenshot a square at the centre of the canvas — inside the sprite, so the
 * background does not dilute the measurement — and reduce it to two numbers.
 *
 * The PNG is decoded in the page under test: a screenshot is an ordinary image
 * that a 2D canvas will happily draw, which avoids adding an image-decoding
 * dependency just to read two statistics.
 */
async function sampleSprite(page: Page): Promise<FrameSample> {
  const box = await page.locator('canvas').first().boundingBox()
  if (!box) throw new Error('canvas has no layout box')
  const size = Math.min(200, box.width, box.height)
  const shot = await page.screenshot({
    type: 'png',
    clip: {
      x: box.x + (box.width - size) / 2,
      y: box.y + (box.height - size) / 2,
      width: size,
      height: size,
    },
  })

  return page.evaluate(async (b64: string) => {
    const img = new Image()
    img.src = `data:image/png;base64,${b64}`
    await img.decode()
    const c = document.createElement('canvas')
    c.width = img.naturalWidth
    c.height = img.naturalHeight
    const ctx = c.getContext('2d')
    if (!ctx) throw new Error('no 2d context for decoding the screenshot')
    ctx.drawImage(img, 0, 0)
    const { data } = ctx.getImageData(0, 0, c.width, c.height)

    const n = data.length / 4
    const sum = [0, 0, 0]
    const sumSq = [0, 0, 0]
    for (let i = 0; i < data.length; i += 4) {
      for (let ch = 0; ch < 3; ch++) {
        const v = data[i + ch] ?? 0
        sum[ch] = (sum[ch] ?? 0) + v
        sumSq[ch] = (sumSq[ch] ?? 0) + v * v
      }
    }
    const mean = sum.map((s) => s / n)
    const stdDev = Math.max(
      ...mean.map((m, ch) => Math.sqrt(Math.max(0, (sumSq[ch] ?? 0) / n - m * m)))
    )
    return {
      stdDev,
      // Guard the divisor: a fully unlit frame would otherwise divide by zero.
      redToGreen: (mean[0] ?? 0) / Math.max(1, mean[1] ?? 0),
    }
  }, shot.toString('base64'))
}
