// Bake this demo's Slug assets into public/ — the fonts (Inter + the Noto SC common
// subset) as `.slug.glb` sidecars, and the full Lucide set as one shared icon atlas.
// The `.slug.glb` outputs are gitignored (generated artifacts), so this regenerates
// them; it only bakes what's missing, so `predev` is cheap after the first run.
//
// This is what makes the demo "baked end-to-end" — at runtime the loader fetches the
// baked sidecars and `installIconAtlas` reads the atlas, with zero opentype.js / SVG
// parsing. Run manually with `pnpm bake`, or automatically via `predev`.
import { existsSync } from 'node:fs'
import { execSync } from 'node:child_process'

const jobs = [
  // [output that gates the bake, command run from this package's cwd]
  ['public/Inter-Regular.slug.glb', 'pnpm exec slug-bake public/Inter-Regular.ttf'],
  ['public/NotoSansSC-common.slug.glb', 'pnpm exec slug-bake public/NotoSansSC-common.ttf'],
  [
    'public/icons.slug.glb',
    'pnpm exec uikit-bake icons node_modules/@three-flatland/uikit-lucide/icons -o public/icons.slug.glb',
  ],
]

let baked = 0
for (const [out, cmd] of jobs) {
  if (existsSync(out)) {
    continue
  }
  console.log(`[bake] ${out} …`)
  execSync(cmd, { stdio: 'inherit' })
  baked++
}
console.log(baked === 0 ? '[bake] all assets present' : `[bake] baked ${baked} asset(s)`)
