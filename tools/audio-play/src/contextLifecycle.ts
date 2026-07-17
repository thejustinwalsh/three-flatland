/**
 * Owns the AudioContext's acquire/release lifecycle — the
 * reacquire-as-default architecture: desktop audio devices are volatile
 * (device switches, sleep/wake, exclusive-mode grabs, OS interruptions),
 * so LOSING the output stream is normal, not exceptional, and a context
 * whose device went away often cannot be recovered by `resume()` — only
 * a fresh `AudioContext` renegotiates the device. Two moves:
 *
 * - **Acquire ladder** (before every play): running → use it; suspended/
 *   interrupted → ONE bounded resume() attempt; still not running (or
 *   closed) → reacquire: bounded close, fresh context, engine re-bind.
 * - **Idle-release**: after `idleMs` with no play activity AND nothing
 *   ringing (see the close gate below), the context is closed — so the
 *   acquire path runs constantly in normal use instead of being a rare
 *   emergency branch. "Released" simply means the CLOSED context stays
 *   assigned (state `'closed'` reads honestly everywhere); the next play
 *   reacquires through the same ladder.
 *
 * The idle close gate is three signals, each covering the others' blind
 * spot: `liveSources` (overlap-correct for every source this package
 * starts — a long song holds its entry through quiet passages, however
 * many one-shots layered over it), `playing` (the declared window of the
 * current stoppable source, incl. Tone/Wad whose internal nodes never
 * pass through player.ts), and a multi-sampled analyser `silent` read
 * (Tone/Wad reverb tails — the analyser is the one signal that sees the
 * summed output of everything). A false-positive "not quiet" only delays
 * the close — never cuts audible output.
 *
 * Every resume/close is BOUNDED (`opBoundMs`) — a wedged device call
 * must never stall the sidecar's command chain (that would turn a deaf
 * context into an unresponsive process, strictly worse). The idle close
 * runs through `enqueue` (the sidecar's command chain), so close-vs-play
 * races are impossible by the same single-threaded discipline that
 * protects response ordering.
 */

export type LifecycleContext = {
  state: 'suspended' | 'running' | 'closed' | 'interrupted'
  resume(): Promise<unknown>
  close(): Promise<unknown>
}

export type QuietSignals = {
  /** player.ts `liveSourceCount(ctx)` — still-ringing sources. */
  liveSources: number
  /** `getPlaybackStats(ctx).playing` — current stoppable source's declared window. */
  playing: boolean
  /** `getPlaybackStats(ctx).silent` — the analyser tap's verdict. */
  silent: boolean
}

export type ContextLifecycleOptions<C extends LifecycleContext> = {
  getCurrent: () => C
  setCurrent: (ctx: C) => void
  createContext: () => C
  /** Re-binds engines that captured the old context by reference
   * (Tone.setContext, Wad require-cache bust) — once per swap, after
   * `setCurrent`. */
  onReacquired: (ctx: C) => void
  isQuiet: () => QuietSignals
  /** Serializes `fn` with command handling — the sidecar passes a
   * commandChain enqueuer. The idle close only ever runs through this. */
  enqueue: (fn: () => Promise<void>) => void
  log: (message: string) => void
  idleMs: number
  opBoundMs?: number
  quietSamples?: number
  quietSampleGapMs?: number
}

export type ContextLifecycle = {
  /** The acquire ladder. Call (and await) before every play-kind
   * command; also counts as activity for the idle timer. Never throws —
   * a failed reacquire logs and leaves the old context assigned (the
   * play command then fails through its own normal Nack path). */
  ensureRunning(reason: string): Promise<void>
  /** Cancels the idle timer (sidecar shutdown path). */
  dispose(): void
}

export function createContextLifecycle<C extends LifecycleContext>(
  options: ContextLifecycleOptions<C>
): ContextLifecycle {
  const {
    getCurrent,
    setCurrent,
    createContext,
    onReacquired,
    isQuiet,
    enqueue,
    log,
    idleMs,
    opBoundMs = 3000,
    quietSamples = 3,
    quietSampleGapMs = 150,
  } = options

  let idleTimer: ReturnType<typeof setTimeout> | undefined
  let lastActivityAt = 0
  let disposed = false

  const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

  const bounded = (operation: Promise<unknown>): Promise<string> =>
    Promise.race([
      operation.then(
        () => 'ok',
        (err: unknown) => `failed: ${err instanceof Error ? err.message : String(err)}`
      ),
      sleep(opBoundMs).then(() => `timed out after ${opBoundMs}ms`),
    ])

  function armIdleTimer(): void {
    if (disposed || idleMs <= 0) return
    if (idleTimer) clearTimeout(idleTimer)
    idleTimer = setTimeout(() => {
      idleTimer = undefined
      // All gate checks + the close happen ON the command chain — a play
      // command that arrived first runs first and bumps lastActivityAt;
      // one that arrives later queues behind the close and reacquires.
      enqueue(() => gatedIdleClose())
    }, idleMs)
  }

  async function gatedIdleClose(): Promise<void> {
    if (disposed) return
    const armedAt = lastActivityAt
    const ctx = getCurrent()
    if (ctx.state !== 'running') return // nothing to release

    for (let sample = 0; sample < quietSamples; sample++) {
      if (lastActivityAt !== armedAt) return // play won the race — timer re-armed by it
      const quiet = isQuiet()
      if (quiet.liveSources > 0 || quiet.playing || !quiet.silent) {
        armIdleTimer() // something's still ringing — try again next window
        return
      }
      if (sample < quietSamples - 1) await sleep(quietSampleGapMs)
    }
    if (lastActivityAt !== armedAt) return

    const outcome = await bounded(ctx.close())
    log(`idle-release: closed context after ${idleMs}ms idle (close ${outcome})`)
  }

  return {
    async ensureRunning(reason: string): Promise<void> {
      lastActivityAt = Date.now()
      armIdleTimer()

      let ctx = getCurrent()
      if (ctx.state === 'running') return

      if (ctx.state === 'suspended' || ctx.state === 'interrupted') {
        const stateBefore = ctx.state
        const outcome = await bounded(ctx.resume())
        log(`context '${stateBefore}' before ${reason} — resume() ${outcome}`)
        if ((ctx.state as string) === 'running') return
      }

      const previousState = ctx.state
      if (previousState !== 'closed') {
        await bounded(ctx.close())
      }
      try {
        ctx = createContext()
      } catch (err) {
        // The old (dead) context stays assigned; the play command will
        // fail through its own Nack path with the context state visible
        // in stats — strictly more diagnosable than throwing here.
        log(`reacquire FAILED before ${reason}: ${err instanceof Error ? err.message : String(err)}`)
        return
      }
      setCurrent(ctx)
      // The hook re-binds engines that captured the old context. It runs
      // AFTER setCurrent — the fresh context is already live — so a
      // throwing hook must not abort the swap (that would leave it
      // half-applied and unlogged) or break this method's never-throws
      // contract. Guarded here at the contract level; the sidecar's hook
      // additionally guards each engine's rebind independently so one
      // engine's failure can't skip another's.
      try {
        onReacquired(ctx)
      } catch (err) {
        log(
          `reacquire hook failed (continuing — fresh context IS assigned): ${err instanceof Error ? err.message : String(err)}`
        )
      }
      log(`reacquired context before ${reason} (was '${previousState}')`)
    },

    dispose(): void {
      disposed = true
      if (idleTimer) clearTimeout(idleTimer)
      idleTimer = undefined
    },
  }
}
