import type { PlaybackStats } from '@three-flatland/zzfx-play'

export type ActiveSource = { findingId: string; sourceUri: string }

/**
 * The extension-side "which finding's sound is playing right now" record
 * behind the single Play⇄Stop toggle lens (#46). At most one — the
 * sidecar replaces rather than stacks (see zzfx-play's commandHandler.ts)
 * — so this is one field plus a token guard: async watchers capture a
 * token at set() time, and a late clear() from a watcher that outlived
 * its own playback is a no-op if anything newer took over in between.
 * `onDidChange` fires on every real transition (a set, or a clear that
 * actually cleared) — register.ts wires it to the CodeLens refresh.
 */
export class ActivePlayback {
  private active: ActiveSource | undefined
  private token = 0

  constructor(private readonly onDidChange: () => void) {}

  get current(): ActiveSource | undefined {
    return this.active
  }

  isActive(findingId: string, sourceUri: string): boolean {
    return this.active?.findingId === findingId && this.active?.sourceUri === sourceUri
  }

  /** True while the playback marked by `token` is still the active one. */
  isCurrent(token: number): boolean {
    return this.active !== undefined && token === this.token
  }

  /** Marks a new active source and returns the token guarding it. */
  set(source: ActiveSource): number {
    this.active = source
    this.token++
    this.onDidChange()
    return this.token
  }

  /**
   * Clears the active source. With a token, only if that set() is still
   * the current one. Returns whether anything was actually cleared —
   * `onDidChange` fires only then.
   */
  clear(token?: number): boolean {
    if (this.active === undefined) return false
    if (token !== undefined && token !== this.token) return false
    this.active = undefined
    this.token++
    this.onDidChange()
    return true
  }
}

/**
 * Resolves once the playback marked by `token` has ended — then clears
 * it so its lens auto-reverts to ▶ Play. Polls the sidecar's exact
 * playback timing (#43's `stats.playing`) rather than sleeping out a
 * duration snapshot, so a natural end is detected as it happens, and a
 * manual stop or a replacement play terminates the loop through the
 * token guard with no clear of its own. The startup window covers the
 * cold-spawn/async-decode gap before `playing` first flips true; a play
 * that never starts within it (silent spawn/decode failure) clears too,
 * so a dead ⏹ Stop lens can't stick around.
 */
export async function watchPlaybackEnd(
  active: ActivePlayback,
  token: number,
  getStats: () => Promise<PlaybackStats | undefined>,
  options: { pollMs?: number; startupMs?: number } = {}
): Promise<void> {
  const { pollMs = 250, startupMs = 10_000 } = options
  const startupDeadline = Date.now() + startupMs
  let seenPlaying = false
  while (active.isCurrent(token)) {
    const stats = await getStats().catch(() => undefined)
    if (stats?.playing) seenPlaying = true
    else if (seenPlaying || Date.now() > startupDeadline) break
    await new Promise((resolve) => setTimeout(resolve, pollMs))
  }
  active.clear(token)
}
