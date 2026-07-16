// Resolves an `audio.file` finding's `payload.path` (a string as written
// in source — may be relative, and the sidecar never validates it exists
// on disk, tools/codelens-service/CLAUDE.md) to a real absolute path.
//
// Two speeds, per the progressive-resolution design (#41):
//   - FAST (sync, 3 stat calls): (1) the source file's own directory,
//     (2) the workspace root, (3) `public/` under the workspace root —
//     first candidate that exists wins. `resolveAudioFilePath` below.
//   - SLOW (async, workspace-wide by basename): when the fast tiers all
//     miss, `AudioFileResolver` kicks off an injected `findByBasename`
//     search and reports a `searching` lens state until it settles —
//     `resolved` with the found path, or `notFound`. Guarded to
//     plainly-relative static paths (`isSearchEligible`): URLs/schemes,
//     absolute paths, and UNC paths never trigger a workspace search and
//     get no lens at all (`ineligible`), the pre-#41 behavior.
//
// Results are cached per session (per `AudioFileResolver` instance, one
// per activation). The cache is TRUSTED for lens display but VERIFIED on
// use: `resolveForPlay` re-stats the cached path first and, if the file
// has since been deleted/moved, re-runs the full fast→slow resolution —
// lazy self-repair on the play attempt, not on every scroll. A settled
// `notFound` is sticky for lens display, but a play attempt on the
// not-found lens re-searches too, so a re-added asset self-heals on the
// next click instead of staying stale for the session.
//
// `exists` and `findByBasename` are injected (defaults: `fs.existsSync`
// and none) so this stays unit-testable without the filesystem or the
// `vscode` module; like `numberArrayLiteral.ts`, no module-scope `vscode`
// import — register.ts supplies a `vscode.workspace.findFiles`-backed
// search and an `onDidUpdate` that fires `onDidChangeCodeLenses`.
import * as fs from 'node:fs'
import * as path from 'node:path'

export function audioFileCandidates(
  refPath: string,
  sourceDir: string,
  workspaceRoot: string
): string[] {
  return [
    path.resolve(sourceDir, refPath),
    path.resolve(workspaceRoot, refPath),
    path.resolve(workspaceRoot, 'public', refPath),
  ]
}

export function resolveAudioFilePath(
  refPath: string,
  sourceDir: string,
  workspaceRoot: string,
  exists: (p: string) => boolean = fs.existsSync
): string | undefined {
  return audioFileCandidates(refPath, sourceDir, workspaceRoot).find(exists)
}

/** True for the plainly-relative static paths the slow workspace search
 * is allowed to hunt for. URLs (`https://…`), any scheme-prefixed ref
 * (`data:`, `file:`, a Windows drive letter), absolute paths, and UNC
 * paths are not workspace-relative assets — searching for their basename
 * would at best find an unrelated file. */
export function isSearchEligible(refPath: string): boolean {
  if (!refPath) return false
  if (refPath.startsWith('/') || refPath.startsWith('\\\\')) return false
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(refPath)) return false
  return true
}

export type AudioFileLensState =
  | { state: 'resolved'; path: string }
  | { state: 'searching' }
  | { state: 'notFound' }
  | { state: 'ineligible' }

export type AudioFileResolverDeps = {
  /** Workspace-wide search returning absolute paths of files with this
   * exact basename. register.ts backs this with
   * `vscode.workspace.findFiles`; tests supply an in-memory fake. */
  findByBasename: (basename: string) => Promise<string[]>
  /** Fired whenever a lens-visible state settles asynchronously (a slow
   * search finished, or a play-time repair changed the answer) — wire to
   * `onDidChangeCodeLenses`. */
  onDidUpdate: () => void
  exists?: (p: string) => boolean
}

export class AudioFileResolver {
  private readonly cache = new Map<string, string>()
  private readonly searches = new Map<string, Promise<string | undefined>>()
  private readonly misses = new Set<string>()
  private readonly exists: (p: string) => boolean

  constructor(private readonly deps: AudioFileResolverDeps) {
    this.exists = deps.exists ?? fs.existsSync
  }

  private key(refPath: string, sourceDir: string, workspaceRoot: string): string {
    return `${workspaceRoot}\u0000${sourceDir}\u0000${refPath}`
  }

  /**
   * The synchronous, lens-shaping answer `provideCodeLenses` needs: a
   * cache/fast hit resolves immediately; a fast miss on an eligible path
   * kicks the slow search (once) and reports `searching` until it
   * settles. Cached paths are NOT re-stat'ed here — that's deliberate
   * (this runs on every scroll/edit); staleness is repaired lazily by
   * `resolveForPlay` on the next play attempt.
   */
  getLensState(refPath: string, sourceDir: string, workspaceRoot: string): AudioFileLensState {
    const key = this.key(refPath, sourceDir, workspaceRoot)
    const cached = this.cache.get(key)
    if (cached) return { state: 'resolved', path: cached }

    const fast = resolveAudioFilePath(refPath, sourceDir, workspaceRoot, this.exists)
    if (fast) {
      this.cache.set(key, fast)
      this.misses.delete(key)
      return { state: 'resolved', path: fast }
    }

    if (!isSearchEligible(refPath)) return { state: 'ineligible' }
    if (this.searches.has(key)) return { state: 'searching' }
    if (this.misses.has(key)) return { state: 'notFound' }

    void this.startSearch(key, refPath)
    return { state: 'searching' }
  }

  /**
   * Play-time trust-but-verify + lazy repair: re-stats the cached path
   * first; if it vanished (or nothing was ever cached — the not-found
   * lens's retry click lands here too), re-runs the full fast→slow
   * resolution, updates the cache, and fires `onDidUpdate` so the lens
   * re-renders at its new state. Returns the playable absolute path, or
   * `undefined` when the reference genuinely resolves nowhere.
   */
  async resolveForPlay(
    refPath: string,
    sourceDir: string,
    workspaceRoot: string
  ): Promise<string | undefined> {
    const key = this.key(refPath, sourceDir, workspaceRoot)
    const cached = this.cache.get(key)
    if (cached && this.exists(cached)) return cached
    if (cached) this.cache.delete(key)

    const fast = resolveAudioFilePath(refPath, sourceDir, workspaceRoot, this.exists)
    if (fast) {
      this.cache.set(key, fast)
      this.misses.delete(key)
      this.deps.onDidUpdate()
      return fast
    }

    if (!isSearchEligible(refPath)) {
      if (cached) this.deps.onDidUpdate()
      return undefined
    }

    // A settled miss doesn't block a play attempt — the whole point of
    // lazy repair is that the user's click is the moment to look again.
    this.misses.delete(key)
    return this.searches.get(key) ?? this.startSearch(key, refPath)
  }

  /** e2e/test-only reset (finding #7,
   * planning/testing/pr188-adversarial-review.md): empties every
   * cache/search/miss record so a later test's `getLensState`/
   * `resolveForPlay` calls can't see resolved paths left over from a
   * previous test's (by then recopied) workspace fixture. An in-flight
   * search whose promise was already running keeps running — its own
   * `startSearch` closure only touches `this.searches`/`this.cache` by
   * key, so a late resolution after `clear()` just repopulates the fresh
   * cache rather than throwing. */
  clear(): void {
    this.cache.clear()
    this.searches.clear()
    this.misses.clear()
  }

  private startSearch(key: string, refPath: string): Promise<string | undefined> {
    const basename = path.basename(refPath)
    const search = (async () => {
      let found: string | undefined
      try {
        const matches = (await this.deps.findByBasename(basename)).filter(
          (p) => path.basename(p) === basename
        )
        found = pickBestMatch(matches, refPath)
      } catch {
        found = undefined
      }
      this.searches.delete(key)
      if (found) {
        this.cache.set(key, found)
        this.misses.delete(key)
      } else {
        this.misses.add(key)
      }
      this.deps.onDidUpdate()
      return found
    })()
    this.searches.set(key, search)
    return search
  }
}

/** Deterministic pick from basename matches: a match whose full path ends
 * with the reference's own relative shape (e.g. `assets/boom.wav`) beats
 * a bare basename hit elsewhere; ties break to the shallowest, then
 * lexicographically first, path — stable across `findFiles`'s unordered
 * results. */
function pickBestMatch(matches: string[], refPath: string): string | undefined {
  const suffix = refPath.split(/[\\/]/).join(path.sep)
  const ranked = [...matches].sort((a, b) => {
    const aSuffix = a.endsWith(suffix) ? 0 : 1
    const bSuffix = b.endsWith(suffix) ? 0 : 1
    if (aSuffix !== bSuffix) return aSuffix - bSuffix
    const aDepth = a.split(path.sep).length
    const bDepth = b.split(path.sep).length
    if (aDepth !== bDepth) return aDepth - bDepth
    return a < b ? -1 : a > b ? 1 : 0
  })
  return ranked[0]
}
