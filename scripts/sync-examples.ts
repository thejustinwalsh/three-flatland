/**
 * Syncs the gem-background helper into every example, generates each
 * example's `gem.ts`, and regenerates the docs `example-gems.ts` lookup
 * table consumed by GalleryGrid.
 *
 * Usage: pnpm sync:examples
 *
 * Flags:
 *   --verify             CI check; exit 1 on any drift, no writes.
 *
 * What gets synced:
 *   examples/three/template/GemBackground.ts → examples/three/<slug>/GemBackground.ts
 *   examples/react/template/GemBackground.tsx → examples/react/<slug>/GemBackground.tsx
 *
 * What gets generated:
 *   examples/three/<slug>/gem.ts   — `export const GEM = '<gem>' as const`
 *   examples/react/<slug>/gem.ts   — same
 *   docs/src/data/example-gems.ts  — `{ slug → gem }` lookup for tile rendering
 *
 * Gem assignment: alphabetical-index modulo gem-cycle, with optional
 * per-slug overrides. See `examples/_shared/gems.config.ts`.
 */

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, mkdirSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { GEM_ORDER, GEM_OVERRIDES, gemForExample, type Gem } from '../examples/_shared/gems.config.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const ROOT = resolve(__dirname, '..')

const VARIANTS = ['three', 'react'] as const
type Variant = (typeof VARIANTS)[number]

const TEMPLATE_FILES: Record<Variant, string> = {
  three: 'GemBackground.ts',
  react: 'GemBackground.tsx',
}

const GENERATED_BANNER =
  '// AUTO-GENERATED — do not edit. Source: scripts/sync-examples.ts.\n' +
  '// To change the gem assignment, edit examples/_shared/gems.config.ts\n' +
  '// then run `pnpm sync:examples`.\n'

const verify = process.argv.includes('--verify')

let driftCount = 0
const driftedFiles: string[] = []

/**
 * List example slugs in a variant, sorted alphabetically. Excludes the
 * `template` directory itself (template is the source-of-truth, not a
 * sync target).
 */
function listExamples(variant: Variant): string[] {
  const dir = join(ROOT, 'examples', variant)
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((name) => {
      if (name === 'template') return false
      const full = join(dir, name)
      return statSync(full).isDirectory()
    })
    .sort()
}

/**
 * Read the canonical helper body from the template directory.
 */
function readTemplate(variant: Variant): string {
  const path = join(ROOT, 'examples', variant, 'template', TEMPLATE_FILES[variant])
  return readFileSync(path, 'utf-8')
}

/**
 * Write or verify a single file. In verify mode, compares contents and
 * registers drift; otherwise writes.
 */
function syncFile(targetPath: string, expected: string, label: string): void {
  const relPath = targetPath.replace(ROOT + '/', '')
  if (verify) {
    if (!existsSync(targetPath)) {
      driftCount++
      driftedFiles.push(`${relPath} (missing)`)
      return
    }
    const actual = readFileSync(targetPath, 'utf-8')
    if (actual !== expected) {
      driftCount++
      driftedFiles.push(relPath)
    }
    return
  }
  // Ensure parent dir exists.
  const parent = dirname(targetPath)
  if (!existsSync(parent)) mkdirSync(parent, { recursive: true })
  if (existsSync(targetPath) && readFileSync(targetPath, 'utf-8') === expected) {
    // No-op, already in sync.
    return
  }
  writeFileSync(targetPath, expected)
  console.log(`  wrote ${label}: ${relPath}`)
}

/**
 * Generate the `gem.ts` body for a given gem assignment.
 */
function gemModuleSource(gem: Gem | null): string {
  return (
    GENERATED_BANNER +
    '\n' +
    `import type { Gem } from './GemBackground'\n` +
    '\n' +
    (gem === null
      ? `export const GEM: Gem | null = null\n`
      : `export const GEM = '${gem}' as const satisfies Gem\n`)
  )
}

/**
 * Generate the docs `example-gems.ts` body.
 */
function docsModuleSource(map: Record<string, Gem | null>): string {
  const entries = Object.entries(map)
    .map(([slug, gem]) => `  ${JSON.stringify(slug)}: ${gem === null ? 'null' : `'${gem}'`},`)
    .join('\n')
  return (
    GENERATED_BANNER +
    '\n' +
    `import type { GEM_ORDER } from '../../../examples/_shared/gems.config'\n` +
    '\n' +
    `type Gem = (typeof GEM_ORDER)[number]\n` +
    '\n' +
    `export const EXAMPLE_GEMS: Record<string, Gem | null> = {\n` +
    entries +
    '\n}\n'
  )
}

function main(): void {
  const action = verify ? 'Verifying' : 'Syncing'
  console.log(`${action} gem-background helpers + per-example gem.ts...`)
  console.log(`Order: [${GEM_ORDER.join(', ')}]`)
  if (Object.keys(GEM_OVERRIDES).length > 0) {
    console.log(`Overrides: ${JSON.stringify(GEM_OVERRIDES)}`)
  }
  console.log('')

  // Use the three variant as the slug source — three and react are
  // assumed paired (per examples/CLAUDE.md "Examples always exist in
  // pairs"). Sorting alphabetically gives stable, deterministic
  // gem index assignment regardless of insertion order.
  const slugs = listExamples('three')
  const docsMap: Record<string, Gem | null> = {}

  for (const variant of VARIANTS) {
    const template = readTemplate(variant)
    const variantSlugs = listExamples(variant)
    console.log(`[${variant}] ${variantSlugs.length} examples`)

    for (const [i, slug] of variantSlugs.entries()) {
      // Use the global slug index from the (sorted) three-variant list
      // so three and react examples with the same slug always resolve
      // to the same gem. Falls back to the variant-local index for
      // any react-only or three-only slug.
      const sortedIndex = slugs.indexOf(slug) >= 0 ? slugs.indexOf(slug) : i
      const gem = gemForExample(slug, sortedIndex)
      if (variant === 'three') docsMap[slug] = gem

      const exampleDir = join(ROOT, 'examples', variant, slug)
      syncFile(join(exampleDir, TEMPLATE_FILES[variant]), template, `${variant}/${slug} helper`)
      syncFile(join(exampleDir, 'gem.ts'), gemModuleSource(gem), `${variant}/${slug} gem.ts`)
    }
  }

  // Generate docs lookup. Path: docs/src/data/example-gems.ts
  const docsTarget = join(ROOT, 'docs', 'src', 'data', 'example-gems.ts')
  syncFile(docsTarget, docsModuleSource(docsMap), 'docs gem map')

  if (verify) {
    if (driftCount > 0) {
      console.log('')
      console.log(`✗ ${driftCount} file(s) out of sync:`)
      for (const f of driftedFiles) console.log(`    ${f}`)
      console.log('')
      console.log('Run `pnpm sync:examples` to fix.')
      process.exit(1)
    }
    console.log('')
    console.log('✓ All gem-background files in sync.')
    return
  }
  console.log('')
  console.log('✓ Done.')
}

main()
