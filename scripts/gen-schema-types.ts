// Generate TypeScript types from JSON Schemas in @three-flatland/schemas.
//
// The schemas package owns the canonical .json files + Ajv validators
// (dev/tool-time only). Runtime consumers (three-flatland, tools/io)
// must NOT depend on @three-flatland/schemas — they get a generated,
// self-contained .ts file with the type and nothing else.
//
// Each generated file is committed so a fresh `pnpm install` produces a
// working build without running codegen first. CI re-runs codegen with
// `--verify` and fails on any diff.
//
// Layout:
//   packages/schemas/src/<name>/schema.json       — source of truth
//   packages/three-flatland/src/sprites/<name>.types.gen.ts  — target
//   tools/io/src/atlas/<name>.types.gen.ts                   — target

import { compileFromFile } from 'json-schema-to-typescript'
import { execSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const verify = process.argv.includes('--verify')

// Add new schemas here. `name` becomes the type name + filename stem.
type Target = { schema: string; type: string; out: string }
const TARGETS: Target[] = [
  // atlas — JSON sidecar for sprite sheets (TexturePacker/Aseprite superset).
  ...['packages/three-flatland/src/sprites', 'tools/io/src/atlas'].map((dir) => ({
    schema: 'packages/schemas/src/atlas/schema.json',
    type: 'AtlasJson',
    out: `${dir}/atlas.types.gen.ts`,
  })),
]

const HEADER = (sourceRel: string, type: string) =>
  `// AUTO-GENERATED — DO NOT EDIT. Regenerate with \`pnpm gen:types\`.\n` +
  `// Source: ${sourceRel}\n` +
  `// Generator: scripts/gen-schema-types.ts (json-schema-to-typescript)\n` +
  `// Exported type: ${type}\n\n`

let drift = 0

for (const { schema, type, out } of TARGETS) {
  const compiled = await compileFromFile(resolve(schema), {
    bannerComment: '',
    style: { semi: false, singleQuote: true },
  })

  // json-schema-to-typescript names the root export from the schema's `title`.
  // Force it to the canonical PascalCase type name so consumers don't have to
  // chase the title. We rewrite the very first `export interface <X>` only.
  const renamed = compiled.replace(/^export interface \w+/m, `export interface ${type}`)

  // `minItems: 1` produces `[T, ...T[]]` non-empty tuples. Those cascade into
  // typecheck breaks at construction sites where arrays grow incrementally
  // (foo.push(...)). The schema validator enforces minItems at runtime — the
  // type doesn't need to also assert it. Loosen tuples back to plain arrays.
  const loosened = renamed.replace(/\[(\w+), \.\.\.\1\[\]\]/g, '$1[]')

  const next = HEADER(schema, type) + loosened

  const exists = existsSync(out)
  const prev = exists ? readFileSync(out, 'utf8') : ''

  if (prev === next) {
    console.log(`  unchanged  ${out}`)
    continue
  }

  if (verify) {
    drift++
    console.error(`  DRIFT      ${out}`)
    continue
  }

  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, next)
  console.log(`  ${exists ? 'updated   ' : 'created   '} ${out}`)
}

if (verify && drift > 0) {
  console.error(
    `\n${drift} generated file(s) drifted from their schema source.\n` +
      `Run \`pnpm gen:types\` and commit the result.`,
  )
  process.exit(1)
}

// Format generated files so they match repo style (Prettier handles trailing
// commas + line widths that json-schema-to-typescript ignores).
if (!verify) {
  const targets = TARGETS.map((t) => t.out).join(' ')
  try {
    execSync(`pnpm exec prettier --write ${targets}`, { stdio: 'inherit' })
  } catch {
    // Non-fatal: drift check will catch anything important.
  }
}
