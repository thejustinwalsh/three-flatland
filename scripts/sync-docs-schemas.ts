// Stage @three-flatland/schemas JSON files into docs/public/schemas/ so the
// docs site serves them at the canonical $id URL declared in
// packages/schemas/src/version.ts (https://three-flatland.dev/schemas/<n>.v<MAJOR>.json).
//
// Lifecycle:
//   * Author edits packages/schemas/src/<n>/schema.json
//   * Changesets bumps the schemas package version (driven by conventional commits)
//   * Major bump → new docs/public/schemas/<n>.v<NEW_MAJOR>.json appears
//   * Patch/minor → existing <n>.v<MAJOR>.json is updated in place (additive
//     changes share the URL)
//
// Old versions accumulate forever in docs/public/schemas/ — once a file is
// committed there, it must remain accessible (consumers reference it by $id).
//
// `--verify` mode is the CI guard: exits non-zero if any docs/public/schemas/
// file is missing or out of sync with the current source. Authors run
// `pnpm sync:schemas` to fix.

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { createRequire } from 'node:module'

const require_ = createRequire(import.meta.url)
const verify = process.argv.includes('--verify')

const SCHEMAS_SRC = 'packages/schemas/src'
const DOCS_PUBLIC = 'docs/public/schemas'

const schemaPkg = require_(resolve('packages/schemas/package.json')) as { version: string }
const SCHEMA_MAJOR = Number.parseInt(schemaPkg.version.split('.')[0]!, 10)
const SCHEMA_BASE_URL = 'https://three-flatland.dev/schemas'

if (!Number.isFinite(SCHEMA_MAJOR)) {
  console.error(`sync-docs-schemas: bad version "${schemaPkg.version}" in packages/schemas/package.json`)
  process.exit(1)
}

// Discover schema sources: packages/schemas/src/<name>/schema.json
type Source = { name: string; sourcePath: string }
const sources: Source[] = readdirSync(SCHEMAS_SRC, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((d) => ({ name: d.name, sourcePath: `${SCHEMAS_SRC}/${d.name}/schema.json` }))
  .filter((s) => existsSync(s.sourcePath))

if (sources.length === 0) {
  console.error('sync-docs-schemas: no schemas found under packages/schemas/src/*/schema.json')
  process.exit(1)
}

let drift = 0
let immutabilityViolation = 0

mkdirSync(DOCS_PUBLIC, { recursive: true })

for (const { name, sourcePath } of sources) {
  const sourceJson = JSON.parse(readFileSync(sourcePath, 'utf8')) as Record<string, unknown>

  // Inject $id derived from the schemas package version so the published file
  // reports the canonical URL even though the source intentionally omits it.
  const $id = `${SCHEMA_BASE_URL}/${name}.v${SCHEMA_MAJOR}.json`
  const published = { $schema: sourceJson.$schema, $id, ...stripMeta(sourceJson) }

  // Format with 2-space indent + trailing newline so prettier doesn't fight us.
  const next = JSON.stringify(published, null, 2) + '\n'

  const target = `${DOCS_PUBLIC}/${name}.v${SCHEMA_MAJOR}.json`
  const exists = existsSync(target)
  const prev = exists ? readFileSync(target, 'utf8') : ''

  if (exists && prev === next) {
    console.log(`  unchanged  ${target}`)
    continue
  }

  if (verify) {
    drift++
    console.error(`  DRIFT      ${target}`)
    continue
  }

  // Immutability check (pragmatic): if the file already exists and the new
  // content has structural differences beyond additive evolution, warn — but
  // don't block. The author chose patch/minor in the changeset; if they
  // intended a breaking change they should have bumped major (which would
  // produce a different filename and bypass this check entirely).
  if (exists && !isAdditive(prev, next)) {
    immutabilityViolation++
    console.error(
      `  WARN       ${target} — structural diff under unchanged major.\n` +
        `             If this is a breaking change, bump @three-flatland/schemas major.`,
    )
  }

  writeFileSync(target, next)
  console.log(`  ${exists ? 'updated   ' : 'created   '} ${target}`)
}

if (verify && drift > 0) {
  console.error(
    `\n${drift} docs schema file(s) out of sync with source.\n` +
      `Run \`pnpm sync:schemas\` and commit the result.`,
  )
  process.exit(1)
}

if (immutabilityViolation > 0) {
  // Only warn — the changeset bump level is the author's call. CI verify
  // already enforced that the file matches source; the question is whether
  // the breaking-change bump was applied. A reviewer should catch this.
  console.error(`\n${immutabilityViolation} immutability warning(s).`)
}

// `meta.published-at` style fields could go here later. For now we strip
// nothing — the schema's own meta block is the JSON Schema vocabulary.
function stripMeta(obj: Record<string, unknown>): Record<string, unknown> {
  const { $schema: _s, $id: _i, ...rest } = obj
  return rest
}

// "Additive" = the new schema is a superset (no required fields removed,
// no enum values dropped, no types narrowed). We don't try to do a full
// JSON Schema diff; just check that no top-level keys were removed.
// Conservative: anything more nuanced is reviewer judgment.
function isAdditive(prevText: string, nextText: string): boolean {
  try {
    const prev = JSON.parse(prevText) as Record<string, unknown>
    const next = JSON.parse(nextText) as Record<string, unknown>
    const prevKeys = Object.keys(prev)
    return prevKeys.every((k) => k in next)
  } catch {
    return false
  }
}
