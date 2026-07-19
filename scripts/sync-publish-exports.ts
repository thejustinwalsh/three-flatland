/**
 * Derives each publishable package's `publishConfig.exports` from its
 * `exports`, dropping the top-level `source` condition.
 *
 * WHY: tsdown-style dev linking puts a `source` condition in `exports` so the
 * monorepo resolves package imports to `src/` (fast, no build). But the
 * published tarball ships `dist` only (`files: ["dist"]`), so that `source`
 * export dangles for consumers. pnpm pack/publish applies `publishConfig`,
 * overriding `exports` with a dist-only map — so consumers (who `npm install`
 * the pnpm-packed tarball) get clean, source-less exports. npm ignores
 * publishConfig, but pnpm bakes it into the tarball at pack time, so the split
 * is: pnpm to pack, npm to install.
 *
 * This keeps `publishConfig.exports` a static, committed, inspectable mirror of
 * `exports` (not a build-time surprise) that can never drift.
 *
 * Usage: node scripts/sync-publish-exports.ts            # write
 *        node scripts/sync-publish-exports.ts --verify   # CI check, exit 1 on drift
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const verify = process.argv.includes('--verify')

/** Recursively drop the `source` key from an exports value (a condition map,
 *  a subpath map, or a string target). */
function stripSource(value: unknown): unknown {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k === 'source') continue
      out[k] = stripSource(v)
    }
    return out
  }
  return value
}

type Pkg = {
  private?: boolean
  exports?: Record<string, unknown>
  publishConfig?: { exports?: unknown } & Record<string, unknown>
}

let drift = 0
let wrote = 0

for (const dir of readdirSync(join(ROOT, 'packages'))) {
  const pkgPath = join(ROOT, 'packages', dir, 'package.json')
  if (!existsSync(pkgPath)) continue
  const raw = readFileSync(pkgPath, 'utf8')
  const pkg = JSON.parse(raw) as Pkg

  // Only publishable packages with a `source`-carrying exports map need it.
  if (pkg.private === true || !pkg.exports) continue
  if (!JSON.stringify(pkg.exports).includes('"source"')) continue

  const distExports: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(pkg.exports)) distExports[k] = stripSource(v)

  const current = JSON.stringify(pkg.publishConfig?.exports ?? null)
  const next = JSON.stringify(distExports)
  if (current === next) continue

  if (verify) {
    drift++
    console.error(`  DRIFT      packages/${dir} — publishConfig.exports out of sync with exports`)
    continue
  }

  // Surgical write: append/replace ONLY the publishConfig block (kept as the
  // last top-level key) so the rest of package.json keeps its exact
  // formatting. A full JSON.parse→stringify would reflow unrelated fields.
  const block =
    '  "publishConfig": ' +
    JSON.stringify({ exports: distExports }, null, 2)
      .split('\n')
      .map((l, i) => (i === 0 ? l : '  ' + l))
      .join('\n')
  const marker = '\n  "publishConfig":'
  const at = raw.indexOf(marker)
  // idx present → replace from the preceding property's comma to EOF; else strip
  // the final `}` and re-close after appending (the prior last property gains a comma).
  const head = at !== -1 ? raw.slice(0, at) : raw.replace(/\s*}\s*$/, '') + ','
  writeFileSync(pkgPath, head + '\n' + block + '\n}\n')
  wrote++
  console.log(`  synced     packages/${dir}`)
}

if (verify) {
  if (drift > 0) {
    console.error(`\n${drift} package(s) have stale publishConfig.exports. Run \`pnpm sync:publish-exports\`.`)
    process.exit(1)
  }
  console.log('publishConfig.exports in sync.')
} else {
  console.log(`\nDone. Updated ${wrote} package(s).`)
}
