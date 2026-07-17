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
 * Gem assignment: each example MDX in `docs/src/content/docs/examples/`
 * declares a `sort: N` frontmatter value. Examples are ordered by that
 * value, and gem is `GEM_ORDER[(sort - 1) % GEM_ORDER.length]` — so the
 * cycle follows the gallery page order, not alphabetical filename order.
 * Examples without a sort field fall back to alphabetical placement
 * after sorted entries (drift-tolerant during transitions). Per-slug
 * pins in `GEM_OVERRIDES` still win. See `examples/_shared/gems.config.ts`.
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
 * List example slugs in a variant. Excludes the `template` directory
 * (template is the source-of-truth, not a sync target) and any directory
 * without a `package.json` (stale local scratch dirs that should not be
 * mistaken for workspace examples). Returned order is alphabetical;
 * callers re-sort by frontmatter when ordering matters.
 */
function listExamples(variant: Variant): string[] {
  const dir = join(ROOT, 'examples', variant)
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((name) => {
      if (name === 'template') return false
      const full = join(dir, name)
      if (!statSync(full).isDirectory()) return false
      return existsSync(join(full, 'package.json'))
    })
    .sort()
}

/**
 * Read the `sort: N` frontmatter value from an example's MDX page. The
 * page lives at `docs/src/content/docs/examples/<slug>.mdx`; if it's
 * missing or has no `sort` field, returns `null` so the caller can
 * apply a fallback ordering.
 *
 * Minimal parser — we only need one numeric key out of a tiny block of
 * frontmatter, no need to pull in a yaml dep. The mdx frontmatter is
 * delimited by `---` lines at the top of the file; we read inside that
 * block and grep for `^\s*sort:\s*(\d+)`.
 */
function readSortFrontmatter(slug: string): number | null {
  const path = join(ROOT, 'docs', 'src', 'content', 'docs', 'examples', `${slug}.mdx`)
  if (!existsSync(path)) return null
  const content = readFileSync(path, 'utf-8')
  // Frontmatter must start at the top with `---`.
  if (!content.startsWith('---')) return null
  const end = content.indexOf('\n---', 3)
  if (end < 0) return null
  const block = content.slice(3, end)
  const match = block.match(/^\s*sort:\s*(\d+)\s*$/m)
  if (!match) return null
  return Number(match[1])
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
    (gem === null ? `export const GEM: Gem | null = null\n` : `export const GEM = '${gem}' as const satisfies Gem\n`)
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
  // pairs"). Order is driven by each example MDX's `sort` frontmatter
  // value — examples with explicit sort come first (asc), then any
  // unsorted slugs alphabetically. The sortedIndex feeds into the gem
  // cycle so color follows gallery-page order, not filename order.
  const baseSlugs = listExamples('three')
  const sortedSlugs = baseSlugs
    .map((slug) => ({ slug, sort: readSortFrontmatter(slug) }))
    .sort((a, b) => {
      const aHas = a.sort !== null
      const bHas = b.sort !== null
      if (aHas && bHas) return (a.sort as number) - (b.sort as number)
      if (aHas) return -1
      if (bHas) return 1
      return a.slug.localeCompare(b.slug)
    })
    .map((entry) => entry.slug)

  const slugToIndex = new Map<string, number>()
  sortedSlugs.forEach((slug, i) => slugToIndex.set(slug, i))

  const docsMap: Record<string, Gem | null> = {}

  for (const variant of VARIANTS) {
    const template = readTemplate(variant)
    const variantSlugs = listExamples(variant)
    console.log(`[${variant}] ${variantSlugs.length} examples`)

    for (const [i, slug] of variantSlugs.entries()) {
      // Global cycle-index from the sorted three-variant list ensures
      // three + react with the same slug resolve to the same gem.
      // Falls back to the variant-local index for any react-only or
      // three-only slug.
      const sortedIndex = slugToIndex.get(slug) ?? i
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
