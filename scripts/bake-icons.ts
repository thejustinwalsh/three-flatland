/**
 * bake-icons — render glyphs (emoji / digits / letters) into a padded
 * pixel-art sprite sheet for in-game HUD use.
 *
 * Renders each glyph in a headless Chromium canvas at high resolution,
 * box-average downsamples to the target sprite size, packs into a
 * single PNG, and emits a TypeScript regions file alongside.
 *
 * Usage:
 *   pnpm bake-icons \
 *     --size 8 --padding 1 --font "Apple Color Emoji" \
 *     --out minis/driller/src/generated/icons \
 *     drag=🫳 paint=🖌️ gem=💎
 *
 * Why Playwright over node-canvas: avoids native deps; emoji rendering
 * matches what the user sees in a real browser; we already ship
 * @playwright/test as a devDep.
 */
import { chromium } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, basename } from 'node:path'

interface BakeArgs {
  size: number
  padding: number
  renderSize: number
  font: string
  outBase: string
  glyphs: { name: string; glyph: string }[]
}

function parseArgs(argv: string[]): BakeArgs {
  let size = 8
  let padding = 1
  let renderSize = 64
  let font = 'Apple Color Emoji'
  let outBase = ''
  const glyphs: { name: string; glyph: string }[] = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!
    if (a === '--size') size = Number(argv[++i])
    else if (a === '--padding') padding = Number(argv[++i])
    else if (a === '--render-size') renderSize = Number(argv[++i])
    else if (a === '--font') font = argv[++i]!
    else if (a === '--out') outBase = argv[++i]!
    else if (a.includes('=')) {
      const eq = a.indexOf('=')
      const name = a.slice(0, eq)
      const glyph = a.slice(eq + 1)
      if (!name || !glyph) throw new Error(`Bad arg: ${a}`)
      glyphs.push({ name, glyph })
    } else throw new Error(`Unknown arg: ${a}`)
  }
  if (!outBase) throw new Error('Missing --out <basename>')
  if (glyphs.length === 0) throw new Error('No name=glyph pairs supplied')
  return { size, padding, renderSize, font, outBase, glyphs }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const { size, padding, renderSize, font, outBase, glyphs } = args
  const cellStride = size + padding * 2
  // Sheet: lay out cells in a single row, width = ceil to power of two.
  const totalWidth = glyphs.length * cellStride
  const sheetW = nextPow2(totalWidth)
  const sheetH = nextPow2(cellStride)

  console.log(
    `[bake-icons] font="${font}" size=${size}px pad=${padding}px render=${renderSize}px ` +
      `glyphs=${glyphs.length} sheet=${sheetW}×${sheetH}`,
  )

  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1024, height: 1024 } })

  // Render the sheet entirely in browser-side canvas: each glyph
  // rasterized at renderSize, box-average downsampled to size, blit
  // into the sheet at the right offset. The whole sheet is then
  // toDataURL'd back to Node for writing.
  const pngBase64 = await page.evaluate(
    async ({ glyphs, size, padding, renderSize, font, cellStride, sheetW, sheetH }) => {
      const sheet = document.createElement('canvas')
      sheet.width = sheetW
      sheet.height = sheetH
      const sctx = sheet.getContext('2d')!
      sctx.clearRect(0, 0, sheetW, sheetH)

      const src = document.createElement('canvas')
      src.width = renderSize
      src.height = renderSize
      const srcCtx = src.getContext('2d')!

      // Per-glyph render → downsample → blit.
      for (let i = 0; i < glyphs.length; i++) {
        const { glyph } = glyphs[i]!
        srcCtx.clearRect(0, 0, renderSize, renderSize)
        srcCtx.font = `${Math.floor(renderSize * 0.875)}px "${font}"`
        srcCtx.textAlign = 'center'
        srcCtx.textBaseline = 'middle'
        srcCtx.fillStyle = '#ffffff'
        srcCtx.fillText(glyph, renderSize / 2, renderSize / 2)

        const srcData = srcCtx.getImageData(0, 0, renderSize, renderSize).data
        const block = renderSize / size
        const cellX = i * cellStride + padding
        const cellY = padding
        const dst = sctx.createImageData(size, size)
        for (let py = 0; py < size; py++) {
          for (let px = 0; px < size; px++) {
            // Box-average the (block × block) source pixels.
            let r = 0, g = 0, b = 0, a = 0, n = 0
            const sx0 = Math.floor(px * block)
            const sy0 = Math.floor(py * block)
            const sx1 = Math.floor((px + 1) * block)
            const sy1 = Math.floor((py + 1) * block)
            for (let sy = sy0; sy < sy1; sy++) {
              for (let sx = sx0; sx < sx1; sx++) {
                const off = (sy * renderSize + sx) * 4
                r += srcData[off]!
                g += srcData[off + 1]!
                b += srcData[off + 2]!
                a += srcData[off + 3]!
                n++
              }
            }
            const di = (py * size + px) * 4
            dst.data[di] = Math.round(r / n)
            dst.data[di + 1] = Math.round(g / n)
            dst.data[di + 2] = Math.round(b / n)
            dst.data[di + 3] = Math.round(a / n)
          }
        }
        sctx.putImageData(dst, cellX, cellY)
      }

      return sheet.toDataURL('image/png').split(',')[1]!
    },
    { glyphs, size, padding, renderSize, font, cellStride, sheetW, sheetH },
  )

  await browser.close()

  const pngBuf = Buffer.from(pngBase64, 'base64')
  await mkdir(dirname(outBase), { recursive: true })
  const pngPath = `${outBase}.png`
  const tsPath = `${outBase}.ts`
  await writeFile(pngPath, pngBuf)

  // Regions TS — keyed by glyph name. Imports the PNG via Vite's
  // default asset handling (no `?inline`): Vite returns a URL string,
  // the bundler emits the PNG to dist/, and StackBlitz / similar
  // sandboxes can substitute the URL to point back to the source
  // repo's raw asset URL. Matches the standard public-asset workflow.
  const sheetName = basename(outBase)
  const regions = glyphs
    .map(
      (g, i) =>
        `  ${JSON.stringify(g.name)}: { x: ${i * cellStride + padding}, y: ${padding}, w: ${size}, h: ${size} },`,
    )
    .join('\n')
  const ts =
    `// GENERATED by scripts/bake-icons.ts — do not edit by hand.\n` +
    `// Re-run \`pnpm bake-icons\` to update.\n` +
    `import sheetUrl from './${sheetName}.png'\n` +
    `export const SHEET_URL: string = sheetUrl\n` +
    `export const SHEET_W = ${sheetW}\n` +
    `export const SHEET_H = ${sheetH}\n` +
    `export const REGIONS = {\n${regions}\n} as const\n` +
    `export type IconName = keyof typeof REGIONS\n`
  await writeFile(tsPath, ts)

  console.log(`[bake-icons] wrote ${pngPath} + ${tsPath}`)
}

function nextPow2(n: number): number {
  let p = 1
  while (p < n) p *= 2
  return p
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
