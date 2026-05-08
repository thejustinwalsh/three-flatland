#!/usr/bin/env node
/**
 * One-shot optimizer for the social PNGs in `docs/public/social/`.
 * Run after `pnpm --filter=docs capture:brand` so the freshly-captured
 * full-color outputs get reduced to a palette where it doesn't hurt
 * fidelity. The BrandAsset compositions are mostly flat color regions
 * (near-black bg, a couple gem accents, monochrome icon, text), so
 * 256-color palette + max compression cuts file size 4-8x without
 * visible degradation.
 *
 * Usage:
 *   pnpm --filter=docs optimize:social
 */
import sharp from 'sharp'
import { readFile, writeFile, stat } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DIR = resolve(__dirname, '..', 'public', 'social')

const FILES = [
    'og-image.png',
    'x-card-image.png',
    'bk-banner-image.png',
    'repo-banner-image.png',
    'icon-512.png',
]

let totalBefore = 0
let totalAfter = 0

for (const f of FILES) {
    const p = resolve(DIR, f)
    const before = (await stat(p)).size
    const optimized = await sharp(p)
        .png({
            compressionLevel: 9,
            palette: true,
            quality: 92,
            effort: 10,
        })
        .toBuffer()
    const after = optimized.length
    if (after < before) {
        await writeFile(p, optimized)
        console.log(
            `${f.padEnd(28)} ${(before / 1024).toFixed(0).padStart(5)}k → ${(after / 1024).toFixed(0).padStart(5)}k  (-${((1 - after / before) * 100).toFixed(0)}%)`,
        )
        totalBefore += before
        totalAfter += after
    } else {
        console.log(
            `${f.padEnd(28)} ${(before / 1024).toFixed(0).padStart(5)}k        (no improvement, kept original)`,
        )
        totalBefore += before
        totalAfter += before
    }
}

console.log(
    `\ntotal: ${(totalBefore / 1024).toFixed(0)}k → ${(totalAfter / 1024).toFixed(0)}k  (-${((1 - totalAfter / totalBefore) * 100).toFixed(0)}%)`,
)
