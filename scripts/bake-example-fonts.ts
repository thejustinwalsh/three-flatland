/**
 * Regenerates the pre-baked slug font assets for both slug-text examples.
 *
 * Runs the built slug-bake CLI (dist/cli.js) via node. Output goes to both
 * example public directories so the dev server and the committed assets stay
 * in sync.
 *
 * Usage: pnpm --filter @three-flatland/slug build && pnpm bake:fonts
 *
 * Fonts baked:
 *   Inter-Regular.ttf  --range latin+  → Inter-Regular.slug.glb (~3.4 MB)
 *   fa-solid-900.ttf   --range 0xf000-0xf200 → fa-solid.slug.glb (~1.7 MB)
 */

import { execFileSync } from 'node:child_process'
import { existsSync, copyFileSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')

const EXAMPLE_DIRS = [
  join(ROOT, 'examples', 'three', 'slug-text', 'public'),
  join(ROOT, 'examples', 'react', 'slug-text', 'public'),
] as const

const CLI = join(ROOT, 'packages', 'slug', 'dist', 'cli.js')

interface BakeConfig {
  ttf: string
  range: string
  output: string
}

const FONTS: BakeConfig[] = [
  {
    ttf: 'Inter-Regular.ttf',
    range: 'latin+',
    output: 'Inter-Regular',
  },
  {
    ttf: 'fa-solid-900.ttf',
    range: '0xf000-0xf200',
    output: 'fa-solid',
  },
]

/** Run `cmd` with an explicit args array, inheriting stdio, in ROOT.
 *  (paths with spaces are handled by the args array). */
function run(cmd: string, args: string[]): void {
  console.log(`  $ ${cmd} ${args.join(' ')}`)
  execFileSync(cmd, args, { stdio: 'inherit', cwd: ROOT, shell: process.platform === 'win32' })
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

function main(): void {
  console.log('Baking example slug fonts...\n')

  if (!existsSync(CLI)) {
    console.error(`Missing built slug CLI: ${CLI}\n  Build it first: pnpm --filter @three-flatland/slug build`)
    process.exit(1)
  }

  // Use the first example dir as the bake destination, then copy to the rest.
  const primaryDir = EXAMPLE_DIRS[0]

  for (const font of FONTS) {
    const ttfPath = join(primaryDir, font.ttf)
    if (!existsSync(ttfPath)) {
      console.error(`Missing TTF: ${ttfPath}`)
      process.exit(1)
    }

    const outputBase = join(primaryDir, font.output)
    console.log(`Baking ${font.ttf} (--range ${font.range})...`)
    run('node', [CLI, ttfPath, '--range', font.range, '--output', outputBase])

    const glbFile = `${font.output}.slug.glb`
    const srcGlb = join(primaryDir, glbFile)

    // Copy to remaining example dirs.
    for (const dir of EXAMPLE_DIRS.slice(1)) {
      ensureDir(dir)
      const destGlb = join(dir, glbFile)
      copyFileSync(srcGlb, destGlb)
      console.log(`  copied → ${destGlb.replace(ROOT + '/', '')}`)
    }

    console.log()
  }

  console.log('Done.')
}

main()
