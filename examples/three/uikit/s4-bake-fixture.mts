/**
 * Regenerate `public/s4-shapes.glb` — the baked `SlugShapeSet` fixture the
 * S4 harness compares against runtime registration (pixel-identity gate).
 *
 * Run from this directory AFTER building the slug package:
 *
 *     pnpm --filter=@three-flatland/slug build
 *     pnpm exec tsx s4-bake-fixture.mts
 */
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { SlugShapeSet } from '@three-flatland/slug'
import { packShapeSet } from '@three-flatland/slug/bake'
import { fixtureShapes } from './s4-fixture-shapes.js'

const set = new SlugShapeSet()
for (const contours of fixtureShapes()) set.registerShape(contours)

const glb = await packShapeSet(set, { fixture: 's4', shapes: set.shapeCount })
const out = join(dirname(fileURLToPath(import.meta.url)), 'public', 's4-shapes.glb')
writeFileSync(out, glb)
console.log(`wrote ${out} (${glb.byteLength} bytes, ${set.shapeCount} shapes)`)
