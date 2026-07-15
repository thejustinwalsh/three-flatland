// The audio-play sidecar's Tone.js engine loads lazily, kicked off by the
// FIRST playToneSynth command of the sidecar's lifetime (see audio-play's
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
// A second design was tried after that and ALSO had a real bug, subtler:
// confirming success by polling `playClient.getStats().playing` after
// sending. `getStats()` itself is a safe, content-correlated round trip —
// but `stats.playing` reflects `player.ts`'s SHARED, per-context
// "most-recently-started source" record, not anything correlated to the
// SPECIFIC `playToneSynth` call that was just sent. A one-shot `zzfx.call`
// never registers as that shared source (commandHandler.ts) and keeps its
// OWN playback-record entry alive for its short duration — so a Tone play
// issued while an unrelated one-shot is still audible reads
// `stats.playing === true` off the ONE-SHOT and reports false success on
// the very first attempt, even though the Tone call itself Nacked with
// `TONE_LOADING` and nothing plays. `getStats()`'s own spawn-time immunity
// doesn't help here — the false positive isn't a timing race, it's
// correlating to the wrong signal entirely.
//
// The fix: correlate to THIS call's own response, not a shared side
// channel. `PlaySidecarClient.playToneSynthAwaitable()` (`tools/audio-play/
// src/client.ts`) attaches a listener for the next `cmd: 'playToneSynth'`
// response line BEFORE sending, the same content-correlation pattern
// `getStats()` already uses (safe because the sidecar processes stdin
// strictly sequentially — see `tools/audio-play/CLAUDE.md`'s "Wire
// protocol" section) — so it resolves with THIS SPECIFIC call's own
// Ack/Nack, however long the sidecar takes to produce it, immune to both
// the spawn-time race the first design had and the shared-state
// misattribution the second one had.
import type { PlaySidecarClient, PlayToneSynthCommand } from '@three-flatland/audio-play'

const RETRY_DELAYS_MS = [250, 500, 1000, 2000]

async function attemptPlayToneSynth(
  playClient: PlaySidecarClient,
  cmd: Omit<PlayToneSynthCommand, 'cmd'>,
  volume: number | undefined
): Promise<boolean> {
  const response = await playClient
    .playToneSynthAwaitable(cmd, volume)
    .catch((error: unknown): { ok: false; error: string } => ({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }))
  return response.ok
}

/**
 * Plays a Tone.js finding, silently resending on a cold-start failure per
 * the schedule above (~4s of backoff across 4 retries, plus whatever each
 * attempt's own correlated response round trip takes) before giving up.
 * Resolves `true` once an attempt's OWN response confirms it actually
 * started — callers must call `trackPlayback` exactly ONCE, after this
 * resolves `true`, never per attempt. Resolves `false` once the budget is
 * exhausted so the caller shows exactly ONE user-visible error rather
 * than one per attempt.
 */
export async function playToneSynthWithColdStartRetry(
  playClient: PlaySidecarClient,
  cmd: Omit<PlayToneSynthCommand, 'cmd'>,
  volume: number | undefined
): Promise<boolean> {
  if (await attemptPlayToneSynth(playClient, cmd, volume)) return true
  for (const delay of RETRY_DELAYS_MS) {
    await new Promise((resolve) => setTimeout(resolve, delay))
    if (await attemptPlayToneSynth(playClient, cmd, volume)) return true
  }
  return false
}
