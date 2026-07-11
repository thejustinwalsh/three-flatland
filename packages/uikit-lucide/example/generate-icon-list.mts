/**
 * Enumerates every lucide icon FROM SOURCE and emits two committed JSON files so
 * `pnpm dev` needs no build step:
 *
 * - `icon-names.json` — sorted kebab basenames of `../icons/*.svg` (the same SVGs
 *   `@three-flatland/uikit-lucide` generates its components from). The browser
 *   maps each to its PascalCase export at runtime (see App.tsx `pascal()`, which
 *   mirrors the package's own `scripts/generate.ts` `getName`).
 * - `icon-tags.json` — `{ <kebab-name>: string[] }` search tags, pulled from
 *   `lucide-static/tags.json` and keyed by the SAME names (missing → `[]`). The
 *   browser folds these into a per-icon search haystack so a query matches by
 *   name OR tag ("weather" surfaces cloud/sun/rain).
 *
 * Run after the icon set changes: `pnpm exec tsx generate-icon-list.mts`.
 */
import { createRequire } from 'node:module'
import { readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const iconsDir = join(here, '..', 'icons')

const names = readdirSync(iconsDir)
  .filter((file) => file.endsWith('.svg'))
  .map((file) => file.slice(0, -'.svg'.length))
  .sort((a, b) => a.localeCompare(b))

const namesOut = join(here, 'icon-names.json')
writeFileSync(namesOut, JSON.stringify(names, null, 0) + '\n')
console.log(`wrote ${names.length} icon names to ${namesOut}`)

// Resolve lucide-static's tag map via Node resolution (version-agnostic) rather
// than a hard-coded .pnpm path — it's a devDependency of the uikit-lucide
// package this example sits inside.
const require = createRequire(import.meta.url)
const allTags = require('lucide-static/tags.json') as Record<string, string[]>

const tags: Record<string, string[]> = {}
for (const name of names) {
  tags[name] = allTags[name] ?? []
}

const tagsOut = join(here, 'icon-tags.json')
writeFileSync(tagsOut, JSON.stringify(tags, null, 0) + '\n')
const tagged = names.filter((name) => tags[name]!.length > 0).length
console.log(`wrote tags for ${names.length} icons (${tagged} with ≥1 tag) to ${tagsOut}`)
