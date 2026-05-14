#!/usr/bin/env node
/**
 * Bake the brand-mark SVG (`docs/src/assets/icon.svg`) to a small PNG
 * for the header logo. The source SVG is pixel-art with 1,864 `<rect>`
 * elements (~167 KB transferred); the header displays it at 32×32. A
 * pre-rasterized 64×64 PNG (2× retina) drops the transfer to a few
 * KB and lets the browser cache + paint it like any other image
 * instead of parsing nearly 2,000 SVG nodes per page load.
 *
 * Scoped to the HEADER ONLY — `BrandIcon.astro`, `BrandAsset.astro`,
 * and favicon references continue to read from the source SVG.
 *
 * Output: `docs/src/assets/icon.png`
 * Re-run after editing the SVG:
 *   node docs/scripts/bake-brand-icon.mjs
 */
import sharp from 'sharp'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SRC_SVG = resolve(__dirname, '..', 'src', 'assets', 'icon.svg')
const OUT_PNG = resolve(__dirname, '..', 'src', 'assets', 'icon.png')

const HEADER_SIZE = 32          // CSS render size in SiteTitle.astro `.logo`
const SCALE = 2                 // 2× for retina
const TARGET_SIZE = HEADER_SIZE * SCALE

const svg = readFileSync(SRC_SVG)

await sharp(svg, { density: 600 })
    .resize(TARGET_SIZE, TARGET_SIZE, {
        // Pixel-art mark — nearest-neighbor preserves crisp edges
        // and avoids the soft anti-aliased look of bilinear.
        kernel: 'nearest',
        fit: 'contain',
    })
    .png({ compressionLevel: 9, palette: true })
    .toFile(OUT_PNG)

console.log(`baked: ${OUT_PNG} (${TARGET_SIZE}×${TARGET_SIZE})`)
