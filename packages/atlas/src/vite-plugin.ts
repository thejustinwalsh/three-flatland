/**
 * Vite plugin that wraps `bakeAtlas` so a project can declare source
 * sprite directories and get baked atlases at dev/build time instead of
 * committing baked artifacts.
 *
 * Each entry bakes to a stable pair — `<out>.json` + `<out>.png` — at the
 * exact `out` path (never content-hashed), so consumers (e.g.
 * `SpriteSheetLoader`) can fetch it by a known URL in both dev and prod:
 *
 *   - **build**: the pair is emitted into the bundle via `this.emitFile`
 *     at `fileName: '<out>.json' | '<out>.png'`.
 *   - **dev**: the pair is served from memory by a dev-only middleware at
 *     `/<out>.json` and `/<out>.png` — nothing is written to disk.
 *
 * Baking is skipped when nothing changed: a SHA-256 digest over each
 * source file's bytes plus the bake options is cached alongside the
 * baked bytes under Vite's `cacheDir` (`<cacheDir>/flatland-atlas/`).
 * Matching digest on a later run reuses the cached bytes without calling
 * `bakeAtlas` again.
 *
 * In dev, source directories are watched; a change, add, or removal of a
 * `.png` inside one re-bakes that entry and triggers a full reload.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, extname, join, resolve, sep } from 'node:path'
import type { Plugin } from 'vite'
import {
  bakeAtlas,
  decodePng,
  encodePng,
  type AtlasSource,
  type BakeAtlasOptions,
  type BakedAtlasJSON,
} from './bake'
import { computeStalenessHash, hashBytes } from './staleness'

export interface AtlasEntry {
  /**
   * Glob pattern(s) or a bare directory. A bare directory (no `*`, `?`,
   * or `[]`) expands to every `.png` directly inside it; a pattern with a
   * wildcard in its final path segment (e.g. `sprites/particles/*.png`)
   * matches sibling files. No recursive `**` — this is a flat
   * shelf-packer, not a general-purpose glob engine.
   */
  src: string | string[]
  /**
   * Output basename, project-root-relative — also the basename for both
   * files, e.g. `'assets/particles'` bakes to `assets/particles.json` and
   * `assets/particles.png`.
   */
  out: string
  /**
   * Forwarded to `bakeAtlas`. `imageName` is always derived from `out`
   * (overriding any value set here) so the JSON's `meta.image` matches
   * the file this plugin actually emits.
   */
  bake?: BakeAtlasOptions
}

export interface FlatlandAtlasOptions {
  entries: AtlasEntry[]
}

interface BakedEntryResult {
  json: BakedAtlasJSON
  pngBytes: Uint8Array
}

/** Throws with a descriptive message on missing `src`/`out` or colliding `out` values. */
export function validateEntries(entries: AtlasEntry[]): void {
  if (entries.length === 0) {
    throw new Error('flatland-atlas: vite plugin needs at least one entry')
  }
  const seenOut = new Set<string>()
  entries.forEach((entry, i) => {
    const patterns = Array.isArray(entry.src) ? entry.src : [entry.src]
    if (patterns.length === 0 || patterns.some((p) => !p || p.trim() === '')) {
      throw new Error(`flatland-atlas: entries[${i}].src is missing or empty`)
    }
    if (!entry.out || entry.out.trim() === '') {
      throw new Error(`flatland-atlas: entries[${i}].out is missing or empty`)
    }
    if (seenOut.has(entry.out)) {
      throw new Error(
        `flatland-atlas: entries[${i}].out '${entry.out}' collides with another entry — ` +
          `each entry must write to a distinct 'out'`
      )
    }
    seenOut.add(entry.out)
  })
}

function isGlobPattern(pattern: string): boolean {
  return /[*?[\]]/.test(pattern)
}

function globToRegExp(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.')
  return new RegExp(`^${escaped}$`)
}

/** The directory a pattern watches — the pattern itself for a bare directory, its dirname otherwise. */
function patternWatchDir(root: string, pattern: string): string {
  const resolved = resolve(root, pattern)
  return isGlobPattern(pattern) ? dirname(resolved) : resolved
}

/** Resolve one `src` pattern to absolute, sorted `.png` paths. */
function resolvePattern(root: string, pattern: string): string[] {
  const resolved = resolve(root, pattern)
  if (!isGlobPattern(pattern)) {
    if (!existsSync(resolved) || !statSync(resolved).isDirectory()) {
      throw new Error(`flatland-atlas: src '${pattern}' is not a directory and has no wildcard`)
    }
    return readdirSync(resolved)
      .filter((f) => extname(f).toLowerCase() === '.png')
      .sort()
      .map((f) => join(resolved, f))
  }

  const dir = dirname(resolved)
  const regex = globToRegExp(basename(resolved))
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => regex.test(f))
    .sort()
    .map((f) => join(dir, f))
}

function expandEntrySources(root: string, entry: AtlasEntry): string[] {
  const patterns = Array.isArray(entry.src) ? entry.src : [entry.src]
  const files = new Set<string>()
  for (const pattern of patterns) {
    for (const file of resolvePattern(root, pattern)) files.add(file)
  }
  return [...files].sort()
}

function cacheKey(out: string): string {
  return out.replace(/[\\/]/g, '_')
}

/**
 * Bake one entry, reusing the cached pair when the staleness digest
 * (source bytes + bake options) matches the last run.
 */
export function bakeEntry(root: string, cacheDir: string, entry: AtlasEntry): BakedEntryResult {
  const files = expandEntrySources(root, entry)
  if (files.length === 0) {
    const patterns = Array.isArray(entry.src) ? entry.src.join(', ') : entry.src
    throw new Error(
      `flatland-atlas: entry out '${entry.out}' matched no .png files for src '${patterns}'`
    )
  }

  const sourceFiles = files.map((file) => {
    const bytes = readFileSync(file)
    return { name: basename(file, extname(file)), bytes, contentHash: hashBytes(bytes) }
  })

  const imageName = `${basename(entry.out)}.png`
  const bakeOptions: BakeAtlasOptions = { ...entry.bake, imageName }
  const hash = computeStalenessHash(
    sourceFiles.map(({ name, contentHash }) => ({ name, contentHash })),
    bakeOptions
  )

  const key = cacheKey(entry.out)
  const hashFile = join(cacheDir, `${key}.hash`)
  const jsonFile = join(cacheDir, `${key}.json`)
  const pngFile = join(cacheDir, `${key}.png`)

  if (existsSync(hashFile) && existsSync(jsonFile) && existsSync(pngFile)) {
    if (readFileSync(hashFile, 'utf-8') === hash) {
      return {
        json: JSON.parse(readFileSync(jsonFile, 'utf-8')) as BakedAtlasJSON,
        pngBytes: readFileSync(pngFile),
      }
    }
  }

  const sources: AtlasSource[] = sourceFiles.map(({ name, bytes }) => decodePng(name, bytes))
  const baked = bakeAtlas(sources, bakeOptions)
  const pngBytes = encodePng(baked.page)

  mkdirSync(cacheDir, { recursive: true })
  writeFileSync(hashFile, hash)
  writeFileSync(jsonFile, JSON.stringify(baked.json))
  writeFileSync(pngFile, pngBytes)

  return { json: baked.json, pngBytes }
}

function urlFor(out: string, ext: 'json' | 'png'): string {
  return `/${out}.${ext}`.replace(/\/{2,}/g, '/')
}

/**
 * Bake `entries` at dev/build time from source sprite directories,
 * skipping unchanged entries via a content-hash cache.
 */
export function flatlandAtlas(options: FlatlandAtlasOptions): Plugin {
  validateEntries(options.entries)

  let root = process.cwd()
  let cacheDir = join(root, 'node_modules', '.vite', 'flatland-atlas')
  let command: 'build' | 'serve' = 'serve'
  const baked = new Map<string, BakedEntryResult>()

  return {
    name: 'flatland-atlas',

    configResolved(config) {
      root = config.root
      cacheDir = join(config.cacheDir, 'flatland-atlas')
      command = config.command
    },

    buildStart() {
      for (const entry of options.entries) {
        baked.set(entry.out, bakeEntry(root, cacheDir, entry))
      }

      if (command === 'build') {
        for (const entry of options.entries) {
          const result = baked.get(entry.out)!
          this.emitFile({
            type: 'asset',
            fileName: `${entry.out}.json`,
            source: JSON.stringify(result.json),
          })
          this.emitFile({ type: 'asset', fileName: `${entry.out}.png`, source: result.pngBytes })
        }
      }
    },

    configureServer(server) {
      const entryDirs = new Map<AtlasEntry, string[]>()
      for (const entry of options.entries) {
        const patterns = Array.isArray(entry.src) ? entry.src : [entry.src]
        const dirs = patterns.map((pattern) => patternWatchDir(root, pattern))
        entryDirs.set(entry, dirs)
        for (const dir of dirs) server.watcher.add(dir)
      }

      server.watcher.on('all', (_event, filePath) => {
        if (extname(filePath).toLowerCase() !== '.png') return
        const absolute = resolve(filePath)
        for (const entry of options.entries) {
          const dirs = entryDirs.get(entry) ?? []
          const inside = dirs.some((dir) => absolute === dir || absolute.startsWith(dir + sep))
          if (!inside) continue

          try {
            baked.set(entry.out, bakeEntry(root, cacheDir, entry))
          } catch (err) {
            server.config.logger.warn(
              `flatland-atlas: re-bake of '${entry.out}' failed after '${filePath}' changed — ${(err as Error).message}`
            )
            continue
          }
          server.ws.send({ type: 'full-reload' })
        }
      })

      server.middlewares.use((req, res, next) => {
        if (!req.url) return next()
        const url = req.url.split('?')[0]
        for (const entry of options.entries) {
          const result = baked.get(entry.out)
          if (!result) continue
          if (url === urlFor(entry.out, 'json')) {
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify(result.json))
            return
          }
          if (url === urlFor(entry.out, 'png')) {
            res.setHeader('Content-Type', 'image/png')
            res.end(Buffer.from(result.pngBytes))
            return
          }
        }
        next()
      })
    },
  }
}

export default flatlandAtlas
