// Run size-limit's --why visualizer for one check (or a name substring),
// stash the HTML under .reports/bundle/<branch>/ so it survives a branch
// switch and you can diff main vs feature in two browser windows.
//
// Usage:
//   pnpm size:why                       # default: 'three-flatland (full)'
//   pnpm size:why "three-flatland"      # substring filter against check names
//   pnpm size:why --list                # show available check names and exit
//
// Notes:
//   * .size-limit.cjs reads SIZE_FILTER and applies it as a name substring,
//     so we set that here rather than passing positional args (size-limit's
//     positional args are file paths, not name filters).
//   * Builds the relevant package(s) first — size-limit reads dist/ files.
//   * Each matched check writes esbuild-why-<name>.html and auto-opens it.

import { execSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

const require_ = createRequire(import.meta.url)

const args = process.argv.slice(2)
const wantsList = args.includes('--list')
const filter = args.find((a) => !a.startsWith('--')) ?? 'three-flatland (full)'

if (wantsList) {
  // Source the config with no filter so we see all check names.
  process.env.SIZE_FILTER = ''
  const checks = require_(resolve('.size-limit.cjs')) as { name: string }[]
  console.log('Available size-limit checks:')
  for (const c of checks) console.log(`  ${c.name}`)
  process.exit(0)
}

const branch =
  execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim().replace(/[^\w.-]/g, '_') ||
  'detached'
const outDir = `.reports/bundle/${branch}`
mkdirSync(outDir, { recursive: true })

console.log(`size:why → filter=${JSON.stringify(filter)} → ${outDir}/`)

// size-limit only reads packages/*/dist/ — skip docs/examples/minis builds.
// Turbo short-circuits unchanged packages, so re-runs are cheap on a warm cache.
execSync('pnpm turbo run build --filter="./packages/*"', { stdio: 'inherit' })

execSync(`size-limit --why --save-bundle ${outDir} --clean-dir`, {
  stdio: 'inherit',
  env: { ...process.env, SIZE_FILTER: filter },
})

console.log(`\nReport(s) in ${outDir}/. Switch branches and re-run to compare.`)
