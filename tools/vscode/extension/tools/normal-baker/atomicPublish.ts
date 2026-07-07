// Pure orchestration for the bake-then-publish sequence, split out of
// sidecar.ts so it's unit-testable with injected fakes (including a
// simulated bake/write failure) — sidecar.ts itself can't be unit tested
// directly since it does `import * as vscode from 'vscode'` at module
// scope, which throws under plain vitest (see paths.ts's identical note).

export type AtomicPublishDeps = {
  /** Bakes into `tmpPngPath`. Real impl: `bakeNormalMapFile`. */
  bake: (tmpPngPath: string) => void
  /** Serializes the descriptor into `tmpJsonPath`. Real impl: `writeSidecarJson`. */
  writeJson: (tmpJsonPath: string) => void
  /** Real impl: `node:fs`'s `renameSync`. */
  rename: (from: string, to: string) => void
  /** Real impl: `node:fs`'s `unlinkSync`. */
  unlink: (path: string) => void
}

export type AtomicPublishPaths = {
  pngPath: string
  jsonPath: string
  pngTmpPath: string
  jsonTmpPath: string
}

/**
 * Bake to a temp PNG, serialize to a temp JSON, then publish both via
 * rename. `rename` is atomic on POSIX filesystems when source and
 * destination share one (same directory, which callers must ensure by
 * construction) — so a crash or thrown error mid-bake or mid-serialize
 * can never leave a torn/truncated final file: the previous pair (if
 * any) stays fully intact until the instant its replacement is
 * completely written. On ANY failure, both temp paths get a best-effort
 * `unlink` (one or both may never have been created) before the error
 * rethrows — the final paths are never touched unless both writes
 * already succeeded.
 *
 * Rename order is PNG then JSON. This does not make the PAIR
 * transactionally atomic: a crash landing between the two `rename`
 * calls leaves the just-published PNG's stamped content-hash
 * disagreeing with whatever JSON is (or isn't) at `jsonPath`. That
 * residual window is self-healing at the runtime layer regardless —
 * `resolveNormalMap.ts`'s `NormalMapLoader` already treats a hash
 * mismatch between a descriptor and its baked sibling as "stale," and
 * falls back to an in-memory bake rather than trusting a possibly-wrong
 * pairing. Either rename order has an equivalent self-healing window;
 * PNG-first just matches the natural "bake, then record what was baked"
 * narrative.
 */
export function publishAtomically(paths: AtomicPublishPaths, deps: AtomicPublishDeps): void {
  try {
    deps.bake(paths.pngTmpPath)
    deps.writeJson(paths.jsonTmpPath)
    deps.rename(paths.pngTmpPath, paths.pngPath)
    deps.rename(paths.jsonTmpPath, paths.jsonPath)
  } catch (err) {
    for (const tmp of [paths.pngTmpPath, paths.jsonTmpPath]) {
      try {
        deps.unlink(tmp)
      } catch {
        // Best-effort cleanup — the temp file may never have been created.
      }
    }
    throw err
  }
}
