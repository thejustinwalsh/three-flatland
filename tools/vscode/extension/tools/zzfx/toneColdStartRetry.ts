// The zzfx-play sidecar's Tone.js engine loads lazily, kicked off by the
// FIRST playToneSynth command of the sidecar's lifetime (see zzfx-play's
// sidecar.ts `loadToneEngine`) — every session's first Tone play
// deterministically Nacks with a `TONE_LOADING` code while that import is
// still in flight, not a rare race. The sidecar side of this is correct
// and deliberately NOT changed here: eagerly warming Tone at extension
// activation would start its `lookAhead` ticker permanently for sessions
// that never play a Tone finding, and trying to predict intent from
// workspace findings is exactly the kind of guessing the sidecar's
// Nack-don't-block design avoids. The fix belongs on this, the EXTENSION
// side of the fire-and-forget wire protocol: silently resend before ever
// surfacing an error to the user.
//
// Correlation decision (documented, not left ambiguous): the protocol
// carries no request ids, and the sidecar processes stdin strictly
// sequentially — so a `TONE_LOADING` Nack COULD in principle be
// correlated to a specific send via a temporary `onError` listener
// bounded by a short timeout window. That was the first design tried
// here, and it has a real bug: on the very FIRST command a fresh sidecar
// ever receives (exactly the case the cold-start spec drives), the
// process itself hasn't spawned/finished importing its own base modules
// yet — `child_process.spawn` returns immediately, but nothing reads
// stdin until the child's own module graph (node-web-audio-api included)
// finishes loading, which existing specs in this codebase already budget
// UP TO 15s for. A fixed short correlation window would elapse before the
// sidecar has even looked at the command, so "no error observed within
// the window" would be wrongly read as success.
//
// The fix: don't guess with a timeout at all — confirm success by asking
// the sidecar directly. `playClient.getStats()` is ALREADY a safe,
// content-correlated round trip (see tools/zzfx-play/CLAUDE.md's "Wire
// protocol" section) that doesn't resolve until the sidecar actually
// responds, however long that takes — immune to the spawn-time race by
// construction. Since a single child process reads stdin strictly
// sequentially, sending `playToneSynth` and then awaiting `getStats()`
// guarantees the sidecar has already fully decided that `playToneSynth`
// call's fate (Nack or real playback started) before the stats response
// comes back — `stats.playing` is `true` immediately once a
// `playToneSynth` call succeeds (player.ts's `trackPlayback` runs
// synchronously inside the same backend call), so it's a reliable,
// self-timing success signal. This also means the retry doesn't need
// `Nack.code`/`'TONE_LOADING'` at all for its own logic — the code still
// rides the wire (see protocol.ts/commandHandler.ts/client.ts) purely for
// diagnostics (the existing global `onError` → log listener in
// playSidecarManager.ts now logs it explicitly).
import type { PlaySidecarClient, PlayToneSynthCommand } from '@three-flatland/zzfx-play'

const RETRY_DELAYS_MS = [250, 500, 1000, 2000]

async function isNowPlaying(playClient: PlaySidecarClient): Promise<boolean> {
  const stats = await playClient.getStats().catch(() => undefined)
  return stats?.playing === true
}

/**
 * Plays a Tone.js finding, silently resending on a cold-start failure per
 * the schedule above (~4s of backoff across 4 retries, plus whatever each
 * attempt's own `getStats()` confirmation round trip takes) before giving
 * up. Resolves `true` once an attempt is confirmed actually playing —
 * callers must call `trackPlayback` exactly ONCE, after this resolves
 * `true`, never per attempt. Resolves `false` once the budget is
 * exhausted so the caller shows exactly ONE user-visible error rather
 * than one per attempt.
 */
export async function playToneSynthWithColdStartRetry(
  playClient: PlaySidecarClient,
  cmd: Omit<PlayToneSynthCommand, 'cmd'>,
  volume: number | undefined
): Promise<boolean> {
  playClient.playToneSynth(cmd, volume)
  if (await isNowPlaying(playClient)) return true
  for (const delay of RETRY_DELAYS_MS) {
    await new Promise((resolve) => setTimeout(resolve, delay))
    playClient.playToneSynth(cmd, volume)
    if (await isNowPlaying(playClient)) return true
  }
  return false
}
