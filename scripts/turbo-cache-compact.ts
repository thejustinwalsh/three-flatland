/**
 * Turbo local-cache compactor. turbo never evicts `.turbo/cache`, so it grows
 * unbounded — one `<hash>.tar.zst` + `<hash>-meta.json` pair per task hash —
 * and slowly eats the disk. This keeps the cache under a size cap by deleting
 * the oldest entries (by mtime) first; the newest (hottest) entries stay.
 *
 * Cache deletion is safe: turbo regenerates any missing entry on the next
 * build. So this never loses work — at worst a pruned task rebuilds once.
 *
 * Cap: 2048 MB by default; override with TURBO_CACHE_MAX_MB.
 * Flags: --dry-run (report only, delete nothing), --dir <path> (target a
 * specific cache dir; defaults to the repo-local `.turbo/cache`).
 *
 * Runs from lefthook (post-checkout / post-merge) and as `pnpm turbo:compact`.
 * It NEVER fails the git operation it runs from — it logs and exits 0.
 */

import { readdirSync, statSync, rmSync, existsSync } from 'node:fs'
import { resolve, join } from 'node:path'

const ROOT = resolve(import.meta.dirname!, '..')
const argv = process.argv.slice(2)
const DRY_RUN = argv.includes('--dry-run')
const dirArg = argv.indexOf('--dir')
const CACHE_DIR = dirArg !== -1 && argv[dirArg + 1] ? resolve(argv[dirArg + 1]!) : resolve(ROOT, '.turbo/cache')

const MAX_MB = Number(process.env.TURBO_CACHE_MAX_MB ?? '2048')
const MAX_BYTES = MAX_MB * 1024 * 1024
const mb = (n: number): string => (n / 1024 / 1024).toFixed(0)

interface Entry {
  files: string[]
  size: number
  mtime: number
}

function main(): void {
  if (!existsSync(CACHE_DIR)) return // nothing built yet

  // Group the two files per task hash into one entry.
  const entries = new Map<string, Entry>()
  let total = 0
  for (const name of readdirSync(CACHE_DIR)) {
    const full = join(CACHE_DIR, name)
    let st
    try {
      st = statSync(full)
    } catch {
      continue
    }
    if (!st.isFile()) continue
    const hash = name.replace(/(-meta\.json|\.tar\.zst)$/, '')
    const e = entries.get(hash) ?? { files: [], size: 0, mtime: 0 }
    e.files.push(full)
    e.size += st.size
    e.mtime = Math.max(e.mtime, st.mtimeMs)
    entries.set(hash, e)
    total += st.size
  }

  if (total <= MAX_BYTES) return // under cap — fast no-op

  // Evict oldest-first until back under the cap.
  const oldestFirst = [...entries.values()].sort((a, b) => a.mtime - b.mtime)
  let freed = 0
  let removed = 0
  for (const e of oldestFirst) {
    if (total - freed <= MAX_BYTES) break
    if (!DRY_RUN) {
      for (const f of e.files) {
        try {
          rmSync(f, { force: true })
        } catch {
          /* already gone — ignore */
        }
      }
    }
    freed += e.size
    removed++
  }

  const verb = DRY_RUN ? 'would prune' : 'pruned'
  console.log(
    `turbo-cache-compact: ${verb} ${removed} entr${removed === 1 ? 'y' : 'ies'}, ` +
      `freeing ${mb(freed)} MB (cap ${MAX_MB} MB, was ${mb(total)} MB → ${mb(total - freed)} MB)`
  )
}

try {
  main()
} catch (err) {
  console.warn(`turbo-cache-compact: skipped (${err instanceof Error ? err.message : String(err)})`)
}
process.exit(0) // never block the git hook
