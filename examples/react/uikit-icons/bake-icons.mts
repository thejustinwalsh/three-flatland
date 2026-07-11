/**
 * Regenerate `public/icons.shapes.glb` — dogfoods the BUILT `uikit-bake
 * icons` CLI (`packages/uikit/dist/cli.js`) against the checked-in
 * `icons.manifest.json`, so this example's 26-icon atlas re-bakes
 * byte-identically (see D6 in the svg-bake-pipeline plan: deterministic
 * basename ordering).
 *
 * Run from this directory AFTER building uikit:
 *
 *     pnpm --filter=@three-flatland/uikit build
 *     pnpm exec tsx bake-icons.mts
 */
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const cli = join(here, '../../../packages/uikit/dist/cli.js')
const manifest = join(here, 'icons.manifest.json')

execFileSync('node', [cli, 'icons', '--manifest', manifest], { stdio: 'inherit' })
