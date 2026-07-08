// Generates the soft-particle sprite atlas for the overdraw benchmark
// (benchmarks/overdraw) and bakes it into TWO
// SpriteSheetLoader-compatible variants via @three-flatland/atlas:
//
//   particles.png      + particles.json      — polygon meshes included,
//                                               drives the tight-mesh path
//   particles-quad.png + particles-quad.json — pixel-identical page, NO
//                                               polygons, a different file
//                                               so TextureLoader/SpriteSheet-
//                                               Loader's URL-keyed cache
//                                               hands out a distinct Texture
//                                               instance that never gets an
//                                               atlasMeshRegistry entry —
//                                               the example's mode toggle
//                                               is just "which sheet is
//                                               loaded", no library changes
//
// Each of the 4 shapes (puff / wisp / spark / ring) is built so every
// alpha>threshold pixel stays within a SHARED normalized radius R. The
// tight-mesh envelope geometry is one convex hull per BATCH (the union of
// every registered frame's polygon in the atlas — see
// packages/three-flatland/src/pipeline/envelopeGeometry.ts), not one hull
// per frame. Keeping all 4 shapes inside the same boundary circle means
// the batch's shared envelope stays that circle (radius R) regardless of
// which frames are drawn, instead of ballooning toward the union of very
// differently-oriented silhouettes.
//
// Usage: tsx scripts/generate-overdraw-particles.ts
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
// Relative import (not the package name): @three-flatland/atlas isn't a
// root devDependency, and this is a one-off authoring script, not a
// consumer of the published surface.
import { bakeAtlas, encodePng, type AtlasSource } from '../packages/atlas/src/index'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

const CANVAS = 128
/** Shared envelope radius, normalized to the frame's [-1, 1] half-extent. No shape emits alpha beyond this. */
const R = 0.62
const ALPHA_THRESHOLD = 8

function smootherstep(t: number): number {
  const c = Math.min(1, Math.max(0, t))
  return c * c * (3 - 2 * c)
}

/** Soft disc edge: opaque for r well inside edgeR, feathering to 0 exactly at edgeR. */
function radialAlpha(r: number, edgeR: number, featherFrac: number): number {
  const featherWidth = edgeR * featherFrac
  return Math.round(255 * smootherstep((edgeR - r) / featherWidth))
}

interface ShapeDef {
  name: string
  alphaAt(nx: number, ny: number): number
}

const SHAPES: ShapeDef[] = [
  {
    // Round glow — full angular coverage at r=R, anchors the shared hull.
    name: 'puff',
    alphaAt(nx, ny) {
      return radialAlpha(Math.hypot(nx, ny), R, 0.85)
    },
  },
  {
    // Elongated streak, tips touching r=R along its rotation axis only —
    // an ellipse's farthest point from center is its semi-major vertex,
    // so it never reaches past R even though it's much sparser than puff.
    name: 'wisp',
    alphaAt(nx, ny) {
      const angle = (32 * Math.PI) / 180
      const cos = Math.cos(angle)
      const sin = Math.sin(angle)
      const ux = nx * cos + ny * sin
      const uy = -nx * sin + ny * cos
      const a = R
      const b = R * 0.2
      const re = Math.hypot(ux / a, uy / b)
      return radialAlpha(re, 1, 0.4)
    },
  },
  {
    // 5-point star, tips at 0.95R — sparsest of the four.
    name: 'spark',
    alphaAt(nx, ny) {
      const r = Math.hypot(nx, ny)
      const theta = Math.atan2(ny, nx)
      const points = 5
      const innerR = R * 0.16
      const outerR = R * 0.95
      const sector = (Math.PI * 2) / points
      const local = ((theta % sector) + sector) % sector
      const half = sector / 2
      const frac = 1 - Math.abs(local - half) / half
      const starR = innerR + (outerR - innerR) * frac
      return radialAlpha(r, starR, 0.25)
    },
  },
  {
    // Annulus, outer edge at R (matches puff) — a concave silhouette
    // whose own convex hull would fill its hole; exercises that the
    // shared per-batch hull degrades no worse than the puff already does.
    name: 'ring',
    alphaAt(nx, ny) {
      const r = Math.hypot(nx, ny)
      const innerR = R * 0.34
      const outerR = R
      const bandFeather = (outerR - innerR) * 0.25
      const outerT = (outerR - r) / bandFeather
      const innerT = (r - innerR) / bandFeather
      return Math.round(255 * smootherstep(Math.min(outerT, innerT)))
    },
  },
]

function rasterize(shape: ShapeDef): AtlasSource {
  const rgba = new Uint8Array(CANVAS * CANVAS * 4)
  let occupied = 0
  for (let py = 0; py < CANVAS; py++) {
    const ny = (py + 0.5 - CANVAS / 2) / (CANVAS / 2)
    for (let px = 0; px < CANVAS; px++) {
      const nx = (px + 0.5 - CANVAS / 2) / (CANVAS / 2)
      const alpha = Math.max(0, Math.min(255, shape.alphaAt(nx, ny)))
      const o = (py * CANVAS + px) * 4
      rgba[o] = 255
      rgba[o + 1] = 255
      rgba[o + 2] = 255
      rgba[o + 3] = alpha
      if (alpha >= ALPHA_THRESHOLD) occupied++
    }
  }
  const ratio = occupied / (CANVAS * CANVAS)
  console.log(`  ${shape.name}: occupies ${(ratio * 100).toFixed(1)}% of its frame (own silhouette, not the shared envelope)`)
  return { name: shape.name, width: CANVAS, height: CANVAS, rgba }
}

function main(): void {
  console.log(`Rasterizing ${SHAPES.length} soft-particle sources (${CANVAS}x${CANVAS}, shared envelope R=${R})...`)
  const sources = SHAPES.map(rasterize)

  console.log('Baking tight-mesh atlas variant (polygons on)...')
  const meshBaked = bakeAtlas(sources, {
    vertexBudget: 10,
    alphaThreshold: ALPHA_THRESHOLD,
    spacing: 2,
    polygons: true,
    imageName: 'particles.png',
  })
  const meshedFrames = Object.entries(meshBaked.json.frames).filter(([, f]) => f.mesh)
  console.log(
    `  packed ${sources.length} frame(s) into ${meshBaked.page.width}x${meshBaked.page.height} (${meshedFrames.length} with polygon mesh)`
  )
  for (const [name, frame] of meshedFrames) {
    console.log(`    ${name}: ${frame.mesh!.verts.length} verts, ${frame.mesh!.indices.length / 3} tris`)
  }

  console.log('Baking synth-quad atlas variant (polygons off — a distinct page file, no mesh registration)...')
  const quadBaked = bakeAtlas(sources, {
    vertexBudget: 10,
    alphaThreshold: ALPHA_THRESHOLD,
    spacing: 2,
    polygons: false,
    imageName: 'particles-quad.png',
  })

  const meshPagePng = encodePng(meshBaked.page)
  const quadPagePng = encodePng(quadBaked.page)
  const meshJson = JSON.stringify(meshBaked.json, null, 2) + '\n'
  const quadJson = JSON.stringify(quadBaked.json, null, 2) + '\n'

  const targets = [resolve(ROOT, 'benchmarks/overdraw/public/assets')]
  for (const dir of targets) {
    mkdirSync(dir, { recursive: true })
    writeFileSync(resolve(dir, 'particles.png'), meshPagePng)
    writeFileSync(resolve(dir, 'particles.json'), meshJson)
    writeFileSync(resolve(dir, 'particles-quad.png'), quadPagePng)
    writeFileSync(resolve(dir, 'particles-quad.json'), quadJson)
    console.log(`  wrote ${dir}`)
  }
}

main()
