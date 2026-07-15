// Bake this demo's Slug assets into public/ — the fonts (Inter + the Noto SC common
// subset) as `.slug.glb` sidecars, and the full Lucide set as one shared icon atlas.
// The `.slug.glb` outputs are gitignored (generated artifacts), so this regenerates
// them; it only bakes what's missing, so `predev` is cheap after the first run.
//
// This is what makes the demo "baked end-to-end" — at runtime the loader fetches the
// baked sidecars and `installIconAtlas` reads the atlas, with zero opentype.js / SVG
// parsing. Run manually with `pnpm bake`, or automatically via `predev` / `prebuild`.
//
// Requires the workspace packages to be built (`pnpm build`) so the CLIs exist at
// packages/{slug,uikit}/dist/cli.js. We invoke those dist CLIs directly by absolute
// path: `pnpm exec` / the node_modules bin shim silently no-ops here (a pnpm
// workspace-symlink module-resolution quirk), whereas the source dist runs cleanly.
import { existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const pkg = resolve(dirname(fileURLToPath(import.meta.url)), '..') // examples/react/uikit-perf
const repo = resolve(pkg, '../../..') // workspace root
const slugCli = resolve(repo, 'packages/slug/dist/cli.js')
const uikitCli = resolve(repo, 'packages/uikit/dist/cli.js')
const lucideIcons = resolve(repo, 'packages/uikit-lucide/icons')

const jobs = [
  // [output that gates the bake, [command, ...args] run with cwd = this package]
  ['public/Inter-Regular.slug.glb', ['node', slugCli, 'public/Inter-Regular.ttf']],
  ['public/NotoSansSC-common.slug.glb', ['node', slugCli, 'public/NotoSansSC-common.ttf']],
  ['public/icons.slug.glb', ['node', uikitCli, 'icons', lucideIcons, '-o', 'public/icons.slug.glb']],
]

let baked = 0
for (const [out, [cmd, ...args]] of jobs) {
  if (existsSync(resolve(pkg, out))) {
    continue
  }
  console.log(`[bake] ${out} …`)
  execFileSync(cmd, args, { stdio: 'inherit', cwd: pkg })
  baked++
}
console.log(baked === 0 ? '[bake] all assets present' : `[bake] baked ${baked} asset(s)`)
