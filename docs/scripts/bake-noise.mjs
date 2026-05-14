#!/usr/bin/env node
/**
 * Bake the body noise overlay to tileable PNGs.
 *
 * Replaces the runtime `<feTurbulence>` SVG filter previously inlined as
 * a data-URL in `body { background-image: ... }`. Safari rasterizes
 * feTurbulence on CPU and pairs it badly with `background-attachment:
 * fixed` + `background-blend-mode: screen` — every overlay paint
 * (notably the 60fps example iframe) re-blends the noise underneath.
 * A pre-rendered raster PNG composites on GPU like any other image.
 *
 * Output: two 200×200 PNGs in `src/assets/`:
 *   - noise-dark.png  — white grain at ~4% alpha for dark-mode `screen` blend
 *   - noise-light.png — black grain at ~2.5% alpha for light-mode `multiply` blend
 *
 * Re-run after editing this script:
 *   node docs/scripts/bake-noise.mjs
 *
 * Implementation: 2-octave value noise with seeded LCG RNG (so output
 * is byte-identical across re-runs) and `stitchTiles=stitch` equivalent
 * via toroidal grid indexing — the resulting raster tiles cleanly.
 */
import sharp from 'sharp'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
// Output co-located with `base.css` so the CSS references them via
// plain relative URL (no Astro asset pipeline, no base-URL plumbing).
const OUT_DIR = resolve(__dirname, '..', '..', 'packages', 'starlight-theme', 'styles')
const SIZE = 200

// Seeded LCG — deterministic per-run output, reproducible.
function makeRng(seed) {
    let s = seed >>> 0
    return () => {
        s = (s * 1664525 + 1013904223) >>> 0
        return s / 0xffffffff
    }
}

// Toroidal value noise: corner values come from a periodic grid so the
// output tiles seamlessly at any size that's a multiple of `freq`.
function makeNoise(freq, seed) {
    const rng = makeRng(seed)
    const grid = new Float32Array(freq * freq)
    for (let i = 0; i < grid.length; i++) grid[i] = rng()
    const smooth = (t) => t * t * (3 - 2 * t)
    return (u, v) => {
        const x = u * freq
        const y = v * freq
        const ix = Math.floor(x) % freq
        const iy = Math.floor(y) % freq
        const fx = x - Math.floor(x)
        const fy = y - Math.floor(y)
        const a = grid[iy * freq + ix]
        const b = grid[iy * freq + ((ix + 1) % freq)]
        const c = grid[((iy + 1) % freq) * freq + ix]
        const d = grid[((iy + 1) % freq) * freq + ((ix + 1) % freq)]
        const sx = smooth(fx)
        const sy = smooth(fy)
        const top = a + (b - a) * sx
        const bot = c + (d - c) * sx
        return top + (bot - top) * sy
    }
}

// Two octaves at coarse + fine grid — matches feTurbulence numOctaves=2.
const octave1 = makeNoise(40, 0xc0ffee)
const octave2 = makeNoise(80, 0xdeadbeef)
function sample(u, v) {
    return octave1(u, v) * 0.55 + octave2(u, v) * 0.45
}

async function bake({ colorHex, alpha, filename }) {
    const buf = Buffer.alloc(SIZE * SIZE * 4)
    const r = (colorHex >> 16) & 0xff
    const g = (colorHex >> 8) & 0xff
    const b = colorHex & 0xff
    for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
            const n = sample(x / SIZE, y / SIZE) // 0..1 noise value
            // Stretch contrast around 0.5 so we get a bell-ish distribution
            // of alpha values — concentrated near zero with a long tail.
            const dev = Math.abs(n - 0.5) * 2 // 0..1
            const a = Math.round(alpha * dev * 255)
            const i = (y * SIZE + x) * 4
            buf[i] = r
            buf[i + 1] = g
            buf[i + 2] = b
            buf[i + 3] = a
        }
    }
    const outPath = resolve(OUT_DIR, filename)
    await sharp(buf, { raw: { width: SIZE, height: SIZE, channels: 4 } })
        .png({ compressionLevel: 9, palette: false })
        .toFile(outPath)
    return outPath
}

const darkPath = await bake({ colorHex: 0xffffff, alpha: 0.18, filename: 'noise-dark.png' })
const lightPath = await bake({ colorHex: 0x000000, alpha: 0.12, filename: 'noise-light.png' })

console.log(`baked: ${darkPath}`)
console.log(`baked: ${lightPath}`)
