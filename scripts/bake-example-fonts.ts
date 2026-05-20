/**
 * Regenerates the pre-baked slug font assets for both slug-text examples.
 *
 * Runs the slug-bake CLI (via tsx against the source) so no prior build step
 * is required. Output goes to both example public directories so the dev server
 * and the committed assets stay in sync.
 *
 * Usage: pnpm bake:fonts
 *
 * Fonts baked:
 *   Inter-Regular.ttf  --range latin+  → Inter-Regular.slug.glb (~3.4 MB)
 *   fa-solid-900.ttf   --range 0xf000-0xf200 → fa-solid.slug.glb (~1.7 MB)
 */

import { execSync } from 'node:child_process'
import { existsSync, copyFileSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')

const EXAMPLE_DIRS = [
  join(ROOT, 'examples', 'three', 'slug-text', 'public'),
  join(ROOT, 'examples', 'react', 'slug-text', 'public'),
] as const

const CLI = join(ROOT, 'packages', 'slug', 'src', 'cli.ts')

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

function run(cmd: string): void {
  console.log(`  $ ${cmd}`)
  execSync(cmd, { stdio: 'inherit', cwd: ROOT })
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

function main(): void {
  console.log('Baking example slug fonts...\n')

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
    run(
      `tsx ${CLI} ${ttfPath} --range ${font.range} --output ${outputBase}`
    )

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
