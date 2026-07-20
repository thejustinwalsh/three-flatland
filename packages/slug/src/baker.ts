import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import type { Baker } from '@three-flatland/bake'

const USAGE = `Usage:
  flatland-bake slug <font.ttf|.otf|.woff> [options]

Bakes a .slug.glb sidecar next to the font: glyph outlines pre-parsed and
packed for GPU rendering, so the runtime skips opentype.js entirely.

Same flags as the slug-bake bin — run \`flatland-bake slug --help\` for the
full set (--range ascii|latin|latin+|0x..-0x.., --output, --stroke-widths,
--stroke-join, --stroke-cap, --miter-limit).`

/**
 * The slug CLI (dist/cli.js) is a self-executing bin — importing it would run
 * it. Dispatch through a child process so the same entry serves both the
 * `slug-bake` bin and `flatland-bake slug`.
 */
const baker: Baker = {
  name: 'slug',
  description: 'Bake a Slug font sidecar (.slug.glb — pre-parsed glyphs, optional baked strokes)',
  usage() {
    return USAGE
  },
  run(args) {
    const cliPath = fileURLToPath(new URL('./cli.js', import.meta.url))
    return new Promise((resolvePromise) => {
      const child = spawn(process.execPath, [cliPath, ...args], { stdio: 'inherit' })
      child.on('close', (code) => resolvePromise(code ?? 1))
      child.on('error', () => resolvePromise(1))
    })
  },
}

export default baker
