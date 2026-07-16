# @three-flatland/audio-play

> Agent-facing reference for the inline audio sidecar — real `AudioContext`
> (via `node-web-audio-api`) rendering `zzfx` one-shots and `@zzfx-studio/
zzfxm` songs through unmodified upstream synthesis, with a custom
> `copyToChannel`-based output path (`src/player.ts`) — see "Why synthesis
> is unmodified but output isn't" below for why the naive `zzfx()`/
> `zzfxm()` convenience calls don't actually work under `node-web-audio-api`.

## Why this exists

The ZzFX CodeLens's "▶ Play" needs to make sound without opening a webview
panel — the studio editor panel already plays sound fine (it's a real
browser Web Audio context inside the webview iframe), but a CodeLens click
on a `zzfx(...)` call buried in source shouldn't have to open/reuse an
editor panel just to hear a one-shot SFX. This package is the "no panel"
path: a real `AudioContext`, running in a real OS process, driven directly
from the extension host.

## The hard prototype gate (read this before touching `sidecar.ts`)

**`node-web-audio-api`'s native module only loads under VS Code's Electron
binary if you spawn the _`Code Helper (Plugin)`_ binary, not the top-level
`Code`/Electron binary.** This was proven empirically, not assumed — see
below for exactly how and why.

### What actually happens on macOS

`node-web-audio-api` ships prebuilt `.node` native addons (napi/Rust/cpal)
per platform, bundled directly in the npm package (no separate per-platform
optional-dependency packages — all 7 platform binaries ship in one
`node-web-audio-api` install, ~5-7 MB each).

Directly invoking VS Code's main `Code` binary with `ELECTRON_RUN_AS_NODE=1`
and trying to load that `.node` file fails:

```
Error: dlopen(…/node-web-audio-api.darwin-arm64.node, …): code signature …
not valid for use in process: mapping process and mapped file (non-platform)
have different Team IDs
```

This is **not an N-API/ABI problem** — it's macOS hardened-runtime code
signing. `codesign -d --entitlements - "Visual Studio Code.app"` shows the
main `Code` binary's entitlements are exactly:
`com.apple.security.automation.apple-events`, `com.apple.security.cs.allow-jit`,
`com.apple.security.device.audio-input`, `com.apple.security.device.camera`
— no `com.apple.security.cs.disable-library-validation`. Without that
entitlement, the hardened runtime only lets a signed process `dlopen()`
code signed with the _same_ Team ID (Microsoft's `UBF8T346G9`) — an
npm-downloaded, differently-signed (or unsigned) `.node` file fails,
regardless of N-API version compatibility.

**The fix**: VS Code, like most Electron apps, ships separate Helper `.app`
bundles per process role (`Contents/Frameworks/*.app`), each with its own
entitlements. `Code Helper (Plugin).app` — the one VS Code's own extension
host runs as — **does** carry
`com.apple.security.cs.disable-library-validation` (confirmed via the same
`codesign -d --entitlements -` check). Spawning _that_ binary with
`ELECTRON_RUN_AS_NODE=1` loads the native module cleanly.

### Why this doesn't need special-casing in `client.ts`

`process.execPath`, read from _inside_ a real running extension host, was
verified (via a throwaway e2e diagnostic spec against a real
`--extensionTestsPath` launch) to **already resolve to the `Code Helper
(Plugin)` binary directly** — `process.type === 'utility'` confirms the
extension host itself runs as this exact helper process. So
`PlaySidecarClient` spawning `process.execPath` (passed in by the caller,
see `sidecarManager.ts` in `tools/vscode/extension/tools/audio/`) with
`ELECTRON_RUN_AS_NODE=1` is _already_ correct — no path-rewriting,
platform-specific helper-name lookup, or special-casing needed. This
matches the LOCKED design's literal wording: "process.execPath + env
flag."

### Verification methodology (repeat this if the gate is ever in doubt again)

Two independent proofs, run via the real downloaded VS Code test binary
(`tools/vscode/.vscode-test/…/Code Helper (Plugin).app/…`):

1. **`OfflineAudioContext` render** — device-independent proof. Renders a
   known 440 Hz sine to a buffer and checks the samples mathematically
   match (non-zero, correct peak amplitude, correct phase relationship
   between an early sample and one a quarter-period later). Proves the
   native module loads _and_ the DSP graph is correct, without needing a
   real audio output device — this is what actually catches an ABI/loading
   failure, independent of whether the test environment has real audio
   hardware.
2. **Real `AudioContext` + `zzfx()` via the polyfill** — best-effort,
   needs a real output device. Confirms `ZZFX.audioContext.state ===
'running'` after playing a real zzfx sound through the _unmodified_
   `zzfx` package. A failure here with a device/permission error (not a
   `dlopen`/module-load error) is an environment limitation, not proof the
   gate failed.

The definitive run spawned the child _from inside a real running
extension host_ (`evaluateInVSCode` + `child_process.spawn(process.execPath,
…, { env: { ELECTRON_RUN_AS_NODE: '1' } })`) — the exact mechanism the real
sidecar uses — not just a bare shell invocation of the helper binary. Both
proofs passed.

## Wire protocol — newline-JSON, not LSP-framed

Unlike `@three-flatland/codelens-service` (LSP `Content-Length` framing,
needed because it ships large source-file text payloads),
`src/protocol.ts` is deliberately simple: one JSON object per line on
stdin (commands) and stdout (responses), fire-and-forget for
`play`/`playSong`/`stopSong`/`stop`/`shutdown` — those commands carry no
`id`, their responses aren't correlated back to a specific request. A
caller that needs to know a `play`/`playSong` failed listens for an error
response via `client.onError()`; there's nothing meaningful to return on
success.

The three AWAITED commands — `stats` (see "Audibility regression guard"
below), `playToneSynth` (see "Tone.js: lazy load, bounded await" below,
#47/#49), and `ping` (see "`ping` — a device-independent liveness probe"
above) —
carry a numeric `id` the sidecar echoes back on the response, and the
client matches on `cmd` + `id`. This replaced the original content-based
correlation ("the next `cmd: 'stats'` line"): content matching relied on
strict stdin-order processing alone, which is still guaranteed, but once
an awaiter can TIME OUT (see `waitForResponse` in `client.ts`) a merely
LATE response would be consumed by the next caller's listener, shifting
every subsequent same-command response one stale, permanently. The id
makes a late orphan un-matchable; it falls through harmlessly.

Commands: `play {params}` (one-shot), `playSong {song}` / `stopSong`
(ZzFXM), `stop` (currently identical to `stopSong` — see the comment on
`handleStop` in `commandHandler.ts` for why it's a separate command
anyway), `shutdown`, `stats` (audibility snapshot), `ping` (device-
independent liveness probe — never reaches the `AudioBackend`). `stopSong`/
`stop` stop the CURRENT SOURCE — a song or a decoded file (#46): `playFile`'s
decoded source registers via an `onStarted` callback, generation-guarded
so a decode landing after a newer play is stopped on arrival instead of
layering.

The command state machine (source replacement, stop semantics, catching a
backend error into a `Nack`) lives in `src/commandHandler.ts`, injected
with an `AudioBackend` — `sidecar.ts` supplies the real zzfx/zzfxm-backed
one, `commandHandler.test.ts` supplies a fake one with no real audio at
all. `sidecar.ts` itself is only stdin/stdout wiring + that one real
backend.

## Why synthesis is unmodified but output isn't

**Root cause (proven by an A/B listening test, then reproduced instrumentally):**
`zzfx()`/`zzfxm()`'s internal output step, `ZZFX.playSamples`
(`node_modules/zzfx/ZzFX.js`), writes samples via
`buffer.getChannelData(i).set(channel)`. In a real browser,
`getChannelData()` returns a **live view** into the `AudioBuffer`'s
underlying storage — mutating it is exactly how the spec expects you to
fill a buffer. Under `node-web-audio-api`
(`node_modules/node-web-audio-api/js/AudioBuffer.js`, `getChannelData`
just returns `this[kNapiObj].getChannelData(channel)` — whatever the
native binding hands back), writing into that result **only reaches the
buffer that actually gets played when the process is running as
Electron's `ELECTRON_RUN_AS_NODE` Node integration — it silently does
nothing under stock Node.js.** This is a genuinely Electron-specific
native-binding quirk, not a universal `node-web-audio-api` limitation —
see "This bug is Electron-specific — it will NOT reproduce under plain
Node" below, because it changes what you're allowed to conclude from any
future test of this code.

Calling `zzfx()`/`zzfxm()` directly — the original Z9 implementation —
hit this exactly, silently (in the one environment that matters,
production, i.e. spawned as `Code Helper (Plugin)`), with nothing in the
process/lifecycle e2e specs able to detect it.

**The fix (`src/player.ts`):** `AudioBuffer.copyToChannel(source,
channelNumber, bufferOffset)` (same file) calls straight through to a
native write-into-buffer call, not a get-then-mutate one, so it works
correctly under `node-web-audio-api` in every environment tested,
Electron-hosted or not. `player.ts`'s `playSampleChannels` is
`ZZFX.playSamples`'s graph (buffer, source, gain, connect, start) rebuilt
with `copyToChannel` in place of `getChannelData().set()` — and with no
`StereoPannerNode`, since this package never passes a non-default pan
through the wire protocol and one fewer node type is one fewer surface
for another such Electron/browser behavioral difference to hide in.

**What stays unmodified:** everything upstream of that one substitution.
`sidecar.ts` calls `ZZFX.buildSamples(...params)` (one-shots) and
`ZZFXM.build(instruments, patterns, sequence, bpm)` (songs) directly —
both are pure numeric waveform synthesis, no `AudioContext` touch at all,
unmodified real `zzfx`/`@zzfx-studio/zzfxm` — then hands the resulting
sample arrays, plus `ZZFX.audioContext`/`ZZFX.sampleRate`/`ZZFX.volume`
read explicitly at the call site, to `player.ts`'s `playSampleChannels`
for output. Zero fidelity drift from what those packages produce; only
the "get already-synthesized samples into the actual audio output" step
is owned locally, because it's the one step `node-web-audio-api` doesn't
support the way `zzfx`/`zzfxm` expect. `player.ts` itself deliberately
imports nothing from `zzfx` — see its file doc comment — which is also
what makes `player.test.ts`'s fake-`AudioContext` unit tests possible
under plain-Node `vitest`.

`sidecar.ts` still imports `./audioContextGuard.js` **before** `zzfx` —
`zzfx`'s `ZZFX.audioContext = new AudioContext` runs at _module load
time_ (`node_modules/zzfx/ZzFX.js`), so `AudioContext` has to already be a
real, GUARDED global by the time `zzfx` is imported. `audioContextGuard.ts`
owns the `node-web-audio-api/polyfill.js` import itself (the polyfill
provides the raw native constructor via `Object.assign(globalThis,
webaudio)`) specifically so nothing can construct a real `AudioContext`
before the guard described below is in place — see "Device tolerance"
for why this ordering is load-bearing, not just a style preference.
`player.ts` reuses that same `ZZFX.audioContext` for both one-shots and
songs — no dual-context juggling needed.

## Device tolerance (`src/audioContextGuard.ts`) — a missing device must never crash the process

**The P0 bug this fixes:** `node-web-audio-api`'s native `AudioContext`
constructor throws SYNCHRONOUSLY when there's no output device to open
(cpal/ALSA finds nothing — the exact situation on a device-less Linux CI
runner, e.g. after `vscode-e2e.yml` stopped provisioning a PulseAudio null
sink). `zzfx`'s own module top-level does `audioContext: new AudioContext`
completely outside any try/catch this package controls
(`node_modules/zzfx/ZzFX.js`) — an unguarded throw there aborts zzfx's
ENTIRE module evaluation, which (ES modules: a dependency's top-level
throw propagates straight out of the importing `import` statement) aborts
`sidecar.ts`'s own module evaluation before a single line of this
package's code has run. There is no `try {} catch {}` a _consumer_ of
`zzfx` can wrap around that from the outside — the only fix is to make
the CONSTRUCTOR ITSELF never throw.

**The fix:** `audioContextGuard.ts` replaces the global `AudioContext` —
both `globalThis.AudioContext` and `globalThis.window.AudioContext` (the
polyfill installs it on both as genuinely SEPARATE properties, not
aliases — see `loadWadConstructor`'s doc comment below for why) — with a
guarded wrapper, reused for EVERY `new AudioContext()` call anywhere in
this process: zzfx's own top-level one, and every acquire/reacquire
attempt `contextLifecycle.ts` makes. Real construction is attempted EVERY
time (never cached as "permanently unavailable") — so a device that
appears after a device-less start is picked up on the very next play,
the same reacquire-as-default philosophy `contextLifecycle.ts` already
applies to a device that disappears mid-session (see "Context lifecycle"
below). A failure flips `isAudioDeviceAvailable()` false and returns a
minimal, inert stand-in — `state: 'closed'`, deliberately, so it reuses
the SAME "nothing to release, report honestly, don't touch the analyser"
handling `contextLifecycle.ts`'s `ensureRunning`/`gatedIdleClose` and
`sidecar.ts`'s `getStats` closed-branch already have for the (previously
only) idle-release case — instead of throwing.

Every play-kind backend in `sidecar.ts` (`play`, `playSong`, `playFile`,
`playToneSynth`, `playWadSynth`) calls `assertAudioDeviceAvailable()`
first, before touching `ZZFX.audioContext` — not strictly load-bearing
for crash-safety by itself (the guarded constructor already guarantees
`ZZFX.audioContext` is never `undefined`, and calling a real Web Audio
method on the degraded stand-in throws a plain `TypeError` that
`commandHandler.ts`'s existing try/catch already turns into a Nack
regardless), but it gives a CLEAR, intentional Nack — `code:
'AUDIO_DEVICE_UNAVAILABLE'` — instead of an incidental "`createBufferSource`
is not a function", and skips synthesis/engine-loading work whose outcome
is already known. Belt and suspenders, not either/or.

**The protocol stays alive regardless.** The stdin/stdout newline-JSON
loop, the command chain, and the process itself are completely
independent of whether `AudioContext` ever acquired a real device — a
device-less sidecar Nacks every audio-touching command cleanly and keeps
answering `stats` (honestly, `contextState: 'closed'`) and `ping` (see
below) for its entire lifetime.

## Tone.js: lazy load, bounded await (#47/#49)

`tone` is pure ESM (no synchronous CJS load path — contrast with
`loadWadConstructor`'s synchronous `require()` for `web-audio-daw` below),
so a genuinely lazy "only import on first use" load is inherently
asynchronous. `sidecar.ts`'s `loadToneEngine()` caches the dynamic
`import('tone')` in a module-scope `toneEnginePromise` — idempotent,
every call after the first (cold or not) reuses the same promise.

**The `playToneSynth` `AudioBackend` method is allowed to be
asynchronous** (`{ stop(): void } | Promise<{ stop(): void }>` —
`commandHandler.ts`'s `AudioBackend` type), and `sidecar.ts`'s real
backend uses that: it `assertAudioDeviceAvailable()`s first (fast-fail on
a device-less runner without paying for an import that would be moot
anyway), then `await`s `loadToneEngineBounded()` — a bounded race against
`TONE_LOAD_TIMEOUT_MS` (env `FL_AUDIO_TONE_LOAD_TIMEOUT_MS`, default
10s) — before ever constructing the synth. `commandHandler.ts`'s
`handleCommand` is correspondingly `async` and `await`s that call inside
its `playToneSynth` case, so the command's own Ack/Nack (echoed with its
correlation `id` — see "Wire protocol" above) always reflects whether the
engine actually became ready.

**Losing the bounded race does not cancel or reset `toneEnginePromise`**
— dynamic imports aren't cancellable, and there's no reason to throw away
in-flight work. A timed-out attempt Nacks with a `TONE_LOAD_FAILED` code;
the import keeps racing in the background and warms the cache for the
very next `playToneSynth` call. This is what makes the design
self-healing WITHOUT any retry logic on the caller's side: a
slow-but-not-hung first attempt Nacks once, and the next click (whenever
the user issues it) finds the engine already loaded.

**The extension side (`tools/vscode/extension/tools/audio/register.ts`)
does not retry.** It `await`s `PlaySidecarClient.playToneSynthAwaitable`
(id-correlated, `client.ts`) once and shows a single graceful error
message on a Nack — no fixed-backoff retry loop. This replaced an earlier
design (`toneColdStartRetry.ts`, since deleted) that retried on a timer
schedule (~250/500/1000/2000ms) whenever the sidecar Nacked a
synchronous, not-yet-loaded "still loading" response: that budget could
be exceeded on a slow runner (adversarial review finding #8,
`planning/testing/pr188-adversarial-review.md`), and — independent of
timing — it could never distinguish "still loading" from "genuinely
failed to load," since the sidecar itself didn't know either until this
fix made it actually wait. `playToneSynthAwaitable`'s default `timeoutMs`
(15s) is deliberately larger than the sidecar's own `TONE_LOAD_TIMEOUT_MS`
(10s) bound, so it only fires as an outer safety net for a dropped
response or a wedged sidecar — never in the normal bounded-wait path.

## `ping` — a device-independent liveness probe

Alongside `stats`/`playToneSynth`, `ping` is the third `id`-correlated
awaited command (`protocol.ts`'s `PingCommand`) — but unlike every other
command, `commandHandler.ts` answers it directly, WITHOUT calling into
the injected `AudioBackend` at all, and `sidecar.ts`'s `PLAY_COMMANDS` set
deliberately excludes it, so it also skips `contextLifecycle.ts`'s
acquire ladder. The result: `ping` proves the sidecar PROCESS is alive
and processing its command chain — the same one every other command runs
through, so a `ping` that Acks proves everything queued ahead of it on
that chain has already been handled — without ever touching
`AudioContext`, real or degraded. Wired end to end: `protocol.ts` →
`commandHandler.ts` → `PlaySidecarClient.ping()` (`client.ts`) →
`pingPlaySidecar()` (`tools/vscode/extension/tools/audio/
playSidecarManager.ts`) → `ExtensionApi.zzfxPlay.ping`
(`tools/vscode/extension/index.ts`). Exists specifically for e2e
process-lifecycle assertions (`tools/vscode/e2e/specs/audio-play.spec.ts`'s
pid tests) that need a deterministic "the process is up and responding"
signal independent of whether the test environment has a real audio
device — a bare pid alone only proves "a process was spawned," not "the
process is alive and answering the wire protocol."

## This bug is Electron-specific — it will NOT reproduce under plain Node

**Load-bearing finding, verified twice independently — read this before
trusting or writing any test that claims to prove or disprove this bug:**
`getChannelData().set()` writes samples correctly and audibly when the
sidecar runs under plain, stock Node.js. It is **silent only when the
exact same code runs under Electron's Node integration**
(`ELECTRON_RUN_AS_NODE=1` inside `Code Helper (Plugin)` — the sidecar's
real, only production execution path). Verified via a controlled
waveform-shape comparison (not just a peak check — see why below), run
both ways against the identical code:

- **Plain Node** (`node dist/sidecar.js`, no Electron involved): a known
  440 Hz sine written via `getChannelData(i).set(...)` plays back as a
  coherent 440 Hz tone — correct peak, correct zero-crossing rate,
  correct sample-by-sample shape. Indistinguishable from `copyToChannel`.
- **Real `Code Helper (Plugin)`** (`ELECTRON_RUN_AS_NODE=1`, the actual
  production path): the identical code, identical samples, written via
  `getChannelData(i).set(...)`, plays back as **exact silence** — peak
  `0`, zero crossings `0`, every sample `0`. `copyToChannel` on the same
  binary/environment plays the correct tone.

**Why the peak-only check matters less than it sounds — and why a naive
"spawn the real sidecar and check peak" test can lie:** a first attempt
at this check used only `peak > threshold` under **plain Node** (the
natural choice for a `vitest`-tier test, since `vitest` itself runs under
plain Node) and — reproducibly — **passed with the bug still present**,
because plain Node never exhibits the bug in the first place. A regression
guard that can't fail when the regression is present is worse than no
guard: it looks like protection while providing none. **Do not add a
vitest-level test in this package that spawns `dist/sidecar.js` via plain
`process.execPath` and claims to prove audibility** — it structurally
cannot, regardless of how the assertion is tuned. **[Updated by the P0
audio-e2e determinism redesign, planning/testing/test-determinism-
audit.md]** The one valid audibility proof is now
`tools/vscode/e2e/specs/audio-render-gate.spec.ts`, which spawns
`tools/vscode/e2e/host-bridge/offlineRenderProbe.mjs` from inside a real
running extension host (`process.execPath` +
`ELECTRON_RUN_AS_NODE=1` — the same mechanism the real sidecar itself is
spawned with) and renders the production `playSampleChannels` graph
through a real `OfflineAudioContext` under the real `Code Helper
(Plugin)` binary. It has been verified in both directions: `copyToChannel`
in place renders `peak≈0.5` (`RENDER_OK`); reintroducing
`getChannelData().set()` renders exact zeros (`RENDER_SILENT`) — that's
what makes it a real guard, not a decorative one, and it needs no audio
device, PulseAudio, warmup, or analyser polling to do it. The formerly
live-sidecar-plus-`stats`-polling proof that used to live in
`tools/vscode/e2e/specs/audio-play.spec.ts` was deleted as part of that
redesign — it required a real OS audio device and was the audio e2e
suite's main source of nondeterminism.

If this gate is ever in doubt again, re-run the waveform-shape comparison
above (a known sine, zero-crossing count, not just peak) under both a
plain `node` invocation and the real `Code Helper (Plugin)` binary
(`ELECTRON_RUN_AS_NODE=1`) — a peak-only check on either alone is not
sufficient evidence either way.

## Audibility regression guard (`stats`, `src/player.ts`, e2e-only)

`player.ts` keeps a persistent `AnalyserNode` tap in the master output
path (every `playSampleChannels` call's gain node routes through it on
its way to `destination`), keyed per-`AudioContext` via a `WeakMap` so
`sidecar.ts`'s single long-lived `ZZFX.audioContext` gets one shared
analyser while unit tests can use independent fake contexts without
cross-talk. `getPlaybackStats()` reads the analyser's current
time-domain window via `getFloatTimeDomainData` — an out-param "write
real-time data into this array" call, the same reliable category as
`copyToChannel`, not the buggy `getChannelData` pattern — and reduces it
to `{ peak, silent }`, plus the current source's exact timing
(`playing`/`durationSeconds`/`elapsedSeconds`, from a per-context
last-started-wins playback record — #43) so e2e waits derive from the
real play window instead of magic timeouts. This is wired through the `stats` protocol
command, `PlaySidecarClient.getStats()`, and `playSidecarManager.ts`'s
`getPlaySidecarStats()` — still real, live production plumbing (e.g.
`activePlayback.ts`'s source-editor tab-binding watches it), but **no
longer the audio e2e suite's audibility proof**: the P0 determinism
redesign (planning/testing/test-determinism-audit.md) deleted every
per-test `getStats()`-polling assertion in favor of the one deterministic
offline-render gate — see "This bug is Electron-specific" above for where
that proof lives now and why a vitest-level real-sidecar test still can't
substitute for it.

## Context lifecycle — reacquire as the default (`src/contextLifecycle.ts`)

Desktop audio devices are volatile (device switches, sleep/wake,
exclusive-mode grabs, OS interruptions), so the sidecar does NOT hold one
`AudioContext` open forever. `contextLifecycle.ts` (DI'd and unit-tested
like `commandHandler.ts`) owns two moves, both wired in `sidecar.ts`:

- **Acquire ladder**, awaited before every play-kind command on the
  serialized command chain: running → use; suspended/interrupted → ONE
  bounded `resume()`; still not running (or closed) → reacquire — bounded
  close, fresh `new AudioContext()` assigned to `ZZFX.audioContext`, and
  the engine re-bind hook (Tone `setContext` re-call + `web-audio-daw`
  require-cache bust, since Wad captures its context permanently at CJS
  module load).
- **Idle-release** (`FL_AUDIO_IDLE_RELEASE_MS`, default 45s; the e2e
  harness runs at 5s so reacquire is exercised constantly): after an idle
  window, the context is closed IF the triple gate passes —
  `liveSourceCount` (player.ts's overlap-correct still-ringing set) is 0,
  the playback record's `playing` is false, AND the analyser reads silent
  across a multi-sample window (each signal covers the others' blind
  spot; Tone/Wad-internal nodes never pass through player.ts). The close
  runs ON the command chain — close-vs-play races are impossible.
  "Released" = the CLOSED context stays assigned; `stats` then reports a
  synthetic honest `{silent:true, contextState:'closed'}` without
  touching the analyser and WITHOUT acquiring (never acquire just to
  ask). Every resume/close is bounded — a wedged device call must never
  stall the command chain.

## Lifecycle — mirrors `sidecarManager.ts`

`PlaySidecarClient` follows the exact same shape as `tools/vscode/
extension/tools/audio/sidecarManager.ts`'s `CodelensServiceClient`
wrapping: lazy spawn on first `play()`/`playSong()` call, warm reuse for
everything after (`start()` is idempotent — until the instance has exited
once), `onExit`/`onError` return unsubscribe functions (not a bulk-
`dispose()` API — same convention as `tools/bridge`'s `ClientBridge.on()`),
graceful `shutdown()` with a `SIGKILL` fallback after a timeout, hard
`dispose()` for immediate kill. **Permanent-exited guard**: once an
instance's process has exited (cleanly, crashed, or failed to spawn),
`isExited` stays `true` for that instance's lifetime and `start()` (and
everything that calls it internally — `play()`, `getStats()`, etc.) throws
`PlaySidecarExitedError` instead of silently spawning a replacement child.
This matters for a caller that captures a `PlaySidecarClient` reference
across time (e.g. `tools/vscode/extension/tools/audio/activePlayback.ts`'s
`watchPlaybackEnd` polling loop) — without it, a poll tick landing after
the singleton in `playSidecarManager.ts` has already respawned a NEW
instance would call `start()` on the stale, exited one and silently spawn
a second, orphaned child process invisible to the singleton's pid/shutdown
bookkeeping. Get a fresh client from `getPlaySidecarClient()` rather than
reusing one that might have exited.

## Building

`pnpm --filter @three-flatland/audio-play build` (tsup, `bundle: false` —
same reasoning as `codelens-service`: every cross-imported file under
`src/` needs its own `tsup.config.ts` entry, since `bundle: false` doesn't
follow imports to inline them). `dist/sidecar.js` is the file actually
passed to `child_process.spawn()` — it must exist as a real file on disk,
it's never imported as a module by the extension host itself.

## Tests — four tiers, no real audio in any of them

- **`src/commandHandler.test.ts`** — the state machine (song replacement,
  stop semantics, error-to-Nack) against a fake `AudioBackend`. No
  process, no `AudioContext`, no `node-web-audio-api` — fast, always
  runs. Includes the P0 device-tolerance regression guard: a fake
  backend that throws the same `AUDIO_DEVICE_UNAVAILABLE`-coded error
  `assertAudioDeviceAvailable()` would produce on every play kind,
  asserting the handler survives (a clean, coded Nack, never an uncaught
  exception) and that `ping`/`stats` keep answering on the SAME handler
  instance afterward — proof the process itself never went down. Also
  covers `ping` acking unconditionally without ever touching the backend.
- **`src/audioContextGuard.test.ts`** — the guard's own try/catch logic
  in isolation, with `node-web-audio-api/polyfill.js` mocked (a fake,
  throwable native `AudioContext` class stands in for "no output
  device") rather than depending on a real missing device, which a
  plain-Node `vitest` run can't reliably simulate either way. Proves: a
  failed native construction never throws out of the guarded wrapper,
  `isAudioDeviceAvailable()`/`assertAudioDeviceAvailable()` reflect that
  failure, the degraded stand-in reports `state: 'closed'`, a later
  successful construction flips availability back to `true`
  (reacquire-as-default, not a permanent trip), and — load-bearing for
  "don't break the working-device path" — a successful construction
  returns the REAL instance completely untouched.
- **`src/client.test.ts`** — `PlaySidecarClient`'s spawn/reuse/lifecycle
  plumbing, run against `src/__fixtures__/fakePlaySidecar.mjs` (mirrors
  `tools/codelens-service`'s `fakeSidecar.mjs` pattern: a from-scratch
  script speaking the real newline-JSON protocol, spawned under plain
  `process.execPath`, no `ELECTRON_RUN_AS_NODE`/Electron binary needed —
  the fixture never touches audio, so there's no ABI concern to work
  around here). Covers lazy spawn, warm reuse across repeated
  `play()`/`playSong()` calls, `onError`/`onExit` subscriptions, graceful
  `shutdown()` with the `SIGKILL` fallback (via a
  `FAKE_PLAY_SIDECAR_HANG_ON_SHUTDOWN` env var — `PlaySidecarOptions` has
  no CLI-args passthrough, unlike codelens-service's client, so the
  fixture's hang-mode switch goes through `env` instead of an arg). Also
  covers `ping()`'s id-correlated request/response round trip
  (`fakePlaySidecar.mjs` answers `ping` unconditionally, mirroring
  `commandHandler.ts`) and that it throws `PlaySidecarExitedError` like
  every other entry point once the instance has exited.
- **`src/player.test.ts`** — `playSampleChannels`/`getPlaybackStats`
  against a fake `AudioContext` (plain object literals + `vi.fn()`, no
  real Web Audio anywhere). Proves the **code path** — every channel goes
  through `copyToChannel`, `getChannelData` is never called (the fake's
  `getChannelData` throws if invoked, so a regression fails loudly here
  too), gain is set from the passed-in `masterVolume`, no
  `StereoPannerNode` gets created, one shared analyser per `ctx`. This is
  a legitimate, platform-independent regression guard for "does the code
  still call the right API" — it does **not** and cannot prove audio
  actually plays; see the next section for why that distinction is load-
  bearing here specifically.

None of these three tiers prove the _real_ `sidecar.ts` + real
`node-web-audio-api` combination is actually audible — that's what the
hard prototype gate above is for, now expressed as
`tools/vscode/e2e/specs/audio-render-gate.spec.ts`'s `OfflineAudioContext`
render (driven against the real built extension, through the real `Code
Helper (Plugin)` binary), per "This bug is Electron-specific" above:
**that gate is not optional or redundant with a vitest-level real-process
test** — it's the only tier capable of catching this specific class of
regression at all. **Unlike the live-sidecar `audio-play.spec.ts` proof
this replaced (P0 determinism redesign,
planning/testing/test-determinism-audit.md), it needs no real OS audio
device at all** — `OfflineAudioContext` never opens an output stream, so
it's immune to the CI/device pitfalls the next section used to describe.

## Common pitfalls

- **Linux CI (`ubuntu-latest`) has no audio device by default — `xvfb-run`
  only virtualizes the DISPLAY, not sound.** `node-web-audio-api` (via
  Rust's `cpal`, which uses ALSA on Linux) has nothing to open in a bare
  runner. This no longer matters for the blocking e2e gate itself
  (`audio-render-gate.spec.ts` renders offline, no device needed) — **and
  it no longer crashes the real, non-offline sidecar either** (see
  "Device tolerance" above): `audioContextGuard.ts` catches the
  device-less `new AudioContext` failure at zzfx's own import time, so
  `tryPlayInline`/`audio-play.spec.ts`'s pid tests spawn a process that
  stays up and Nacks audio-touching commands cleanly instead of crashing
  or failing to stabilize. Those tests now assert liveness via `ping()`
  (device-independent — never touches `AudioContext`) rather than trusting
  a bare pid alone. CI's `vscode-e2e.yml` no longer sets up a PulseAudio
  null sink (removed in the P0 determinism redesign, since the blocking
  gate doesn't need one, and the P0 device-less-startup fix means the pid
  tests don't need one either) — if a pid/ping test still flakes or fails
  specifically in CI (not locally, where a real device exists), re-check
  `audioContextGuard.ts`'s guard is actually installed before `zzfx`'s
  import (the import-order pitfall below) before assuming a device issue.
- Forgetting the `./audioContextGuard.js` import order relative to
  `zzfx`/`@zzfx-studio/zzfxm` imports in `sidecar.ts` — `zzfx`'s top-level
  `new AudioContext` would throw (`AudioContext is not defined`) if the
  polyfill hasn't installed the global yet.
- Spawning `process.execPath` from _outside_ a real extension host (e.g. a
  bare shell test) and expecting it to resolve to `Code Helper (Plugin)`
  — it won't; `process.execPath` only resolves there when read from
  _inside_ an already-running extension host. A bare CLI test needs to
  explicitly target `Contents/Frameworks/Code Helper (Plugin).app/
Contents/MacOS/Code Helper (Plugin)` (macOS) or the equivalent utility
  binary on other platforms.
- Testing the gate against `OfflineAudioContext` alone and calling it
  proven — that only proves the DSP math, not that a _real_ device
  connects. Testing against real `AudioContext` alone and calling a
  failure "gate failed" — that might just be a sandboxed environment with
  no audio device, not an ABI/signing problem. Use both, and read which
  one actually failed before concluding anything.
- `AudioBufferSourceNode.stop()` on a song handle you no longer have a
  reference to — `commandHandler.ts` keeps exactly one `currentSong`
  handle; calling `playSong` again before `stopSong`/`stop` correctly
  stops the previous song first, don't remove that guard.
- Adding a new file under `src/` without adding it to `tsup.config.ts`'s
  `entry` array — same `bundle: false` gotcha as `codelens-service`, see
  its `CLAUDE.md`.
- **Patching only the bare `globalThis.AudioContext`/`globalThis.webkitAudioContext`
  when shimming a browser-targeting package (e.g. `loadWadConstructor` for
  `web-audio-daw`), not also `globalThis.window.AudioContext`/
  `.webkitAudioContext`.** `node-web-audio-api/polyfill.js` creates
  `globalThis.window` as a SEPARATE plain object (`globalThis.window = {}`,
  then copies each export onto it once) — `globalThis.window !==
globalThis`. A package whose own bundle reads `window.AudioContext ||
window.webkitAudioContext` (as `web-audio-daw`'s `src/common.js` does)
  never sees a bare-`globalThis` patch at all, so it silently constructs
  its own second, genuinely separate real `AudioContext` instead of
  adopting the shared one. The symptom is exactly the "acks clean, plays
  nothing" failure mode this whole file is about, but louder: every
  `wad.play()` call threw `Attempting to connect nodes from different
contexts` (a native `InvalidAccessError`) the instant `plugEmIn` tried
  to connect Wad's own internal chain to `player.ts`'s shared `gainNode`
  — caught by `commandHandler.ts`'s generic try/catch into a Nack nothing
  was listening for. This went undetected by e2e for a while because the
  existing audibility check polled the SAME shared analyser tap for "is
  anything audible," which can read `true` off an adjacent, still-fading
  sound from a preceding command — not proof the sound under test
  actually played. Verify a fix like this the same way: assert
  `stats.playing === true` (not just `!stats.silent`) immediately after
  issuing the play, as the very FIRST command of a freshly spawned
  sidecar (no adjacent sound to produce a false positive).
- **The `getChannelData().set()`-under-Electron trap isn't limited to OUR
  code — it hit `web-audio-daw`'s OWN bundled noise-buffer construction
  too.** `build/wad.js` pre-renders a shared noise buffer at import time
  (`noiseBuffer.getChannelData(0)` then a fill loop writing into the
  returned array) — a detached copy under `node-web-audio-api`/Electron,
  same as everywhere else in this file, so every `source:'noise'` Wad
  played real silence (acked clean, `stats.peak === 0`) while every other
  oscillator type worked fine. Can't patch Wad's vendored bundle source,
  and its `noiseBuffer` variable is closed over inside the webpack
  bundle — not reachable from the public `Wad` export. Fixed in
  `loadWadConstructor()` by temporarily wrapping `ZZFX.audioContext
.createBuffer` for the duration of the `require('web-audio-daw')` call
  (Wad's import-time IIFE makes exactly one `createBuffer` call — nothing
  else in its top-level module code creates a buffer), capturing the
  actual buffer object Wad's closure holds a reference to, and
  re-committing real noise samples into it via `copyToChannel`
  immediately after — same seeded-LCG algorithm Wad's own IIFE uses
  (seed 6, `(seed * 9301 + 49297) % 233280`), so the result is the noise
  Wad always intended, just actually audible. If a THIRD library gets
  added to this sidecar later, budget time to check its own import-time
  buffer construction for this same pattern before trusting silence-free
  playback — this bug class isn't specific to Wad, it's specific to
  "any package's `getChannelData()` usage running under this Electron
  binary," and a vendored dependency can hit it just as easily as our
  own code can.
- **A DIFFERENT bug class from the `getChannelData` trap: `tone`'s
  AudioWorklet-based instruments (`Tone.PluckSynth`'s internal
  `LowpassCombFilter`) used to CRASH THE ENTIRE SIDECAR PROCESS** — not a
  clean Nack, every other in-flight sound (zzfx, zzfxm, other synths) died
  with it. Root cause, traced with a throwaway diagnostic constructing
  `new Tone.PluckSynth()` against the real polyfilled context:
  `standardized-audio-context` (a dependency of `tone`, NOT
  `node-web-audio-api` — `Tone.setContext(ZZFX.audioContext)` doesn't touch
  this path at all) computes its exported `AudioWorkletNode` once at import
  time gated on `window.isSecureContext`
  (`standardized-audio-context/src/factories/is-secure-context.ts`) — a
  real browser-only property our shim `window` object (from
  `node-web-audio-api/polyfill.js`) never sets, so it reads `undefined` and
  the export permanently resolves to `undefined`
  (`standardized-audio-context/build/es2019/module.js`:
  `const audioWorkletNodeConstructor = isSecureContext ? … : undefined`).
  `tone`'s own `ToneAudioWorklet` constructor
  (`build/esm/core/worklet/ToneAudioWorklet.js`) calls
  `context.addAudioWorkletModule(…).then(() => this.context.
createAudioWorkletNode(…))`, and `createAudioWorkletNode`'s
  `assert(isDefined(stdAudioWorkletNode), …)`
  (`build/esm/core/context/AudioContext.js`) throws INSIDE that unawaited
  `.then()` — an unhandled promise rejection Node treats as fatal. Fixed in
  `sidecar.ts` (module scope, before `loadToneEngine`'s dynamic
  `import('tone')` can ever resolve) with `window.isSecureContext = true`
  — this sidecar is a trusted native process, not a web page, so there's
  no real mixed-content state for that flag to guard. A SECOND, separate
  throw was hiding behind the first: `tone`'s own `createAudioWorkletNode`
  picks its constructor via `typeof self === "object" ? self : null`, and
  `self` isn't a Node global at all — without it, `context instanceof
theWindow.BaseAudioContext` throws again (`TypeError`, RHS of
  `instanceof` not callable) the moment the assert stops blocking. Fixed
  with `self ??= window`, which — since `node-web-audio-api`'s polyfill
  already copies its own `BaseAudioContext`/`AudioWorkletNode` onto
  `window` and `AudioContext extends BaseAudioContext`
  (`node_modules/node-web-audio-api/js/AudioContext.js`) — routes `tone`
  to construct a REAL native `AudioWorkletNode`, confirmed genuinely
  audible (not just crash-free) under both plain Node and the real `Code
  Helper (Plugin)` binary. If a Tone effect that goes through
  `ToneAudioWorklet` gets added to the sidecar later (none of the other 8
  allowlisted synth types do), it should work out of the box now — but
  re-verify with the same "construct it, poll for real peak" diagnostic
  rather than assuming.
- **Investigated and ruled out (not currently a live bug, but worth
  knowing about): `tone`'s `Context.getConstant(val)`
  (`build/esm/core/context/Context.js`) has the SAME
  `getChannelData()`-then-write shape as the noise-buffer bug above** —
  it `createBuffer`s a 128-sample buffer, calls `getChannelData(0)`, and
  fills it with `val` in a loop, so the write is silently lost under this
  Electron binary and the buffer stays at its zero-initialized default.
  The only path that reaches it from this sidecar's 9 allowlisted Tone
  synth types is `DuoSynth`'s internal vibrato `LFO`, which only ever
  constructs `new Zero({...})` → `getConstant(0)` — and `val === 0` is
  exactly the buffer's already-correct default state, so the lost write
  never changes the outcome (confirmed audible, real peak, via the same
  diagnostic). `getConstant(1)` (used by `CrossFade`/`StereoWidener`,
  neither reachable from any of the 9 allowlisted classes today) WOULD
  actually manifest this bug. If Tone effects that use `CrossFade` or
  `StereoWidener` — or anything else calling `getConstant` with a nonzero
  value — ever get added to `ToneEngine`'s allowlist, check this before
  trusting silence-free playback; the fix would follow the same
  intercept-and-`copyToChannel` shape as `loadWadConstructor`'s noise-buffer
  fix, just against `Tone.Context.prototype.getConstant` instead of a
  single `createBuffer` call.
- **Never call `zzfx()`/`zzfxm()` (or `ZZFX.play`/`ZZFX.playSamples`)
  directly in `sidecar.ts`** — they end in `getChannelData().set()`,
  which is a detached copy under `node-web-audio-api` and produces silent
  audio that acks clean (see "Why synthesis is unmodified but output
  isn't" above). Always go through `ZZFX.buildSamples`/`ZZFXM.build` +
  `player.ts`'s `playSampleChannels`.
- Trusting a `stats` result queried too early — `getPlaybackStats()`
  reflects whatever the analyser's current window sees, so a query issued
  before the sidecar has actually spawned (cold start includes native
  module load) or before the sound has started rendering will correctly,
  and unhelpfully, report silence. This no longer matters for the e2e
  audibility gate itself (`audio-render-gate.spec.ts` awaits
  `offline.startRendering()`'s own promise — a real completion signal,
  not a query against a live analyser), but still applies to any live
  production caller of `getStats()`/the `stats` wire command.
- **Adding a vitest-level test that spawns `dist/sidecar.js` via plain
  `process.execPath` and asserts on `stats.peak`/`stats.silent` to "prove
  audibility."** It cannot — `getChannelData().set()` plays back
  correctly under plain Node and only breaks under Electron's Node
  integration, so a plain-Node test passes identically whether the bug is
  present or fixed (verified both ways, see "This bug is
  Electron-specific" above). This looks like a regression guard and
  isn't one. `src/player.test.ts`'s fake-`AudioContext` unit tests are
  the right vitest-tier check (proves the _code_ calls the right API);
  `tools/vscode/e2e/specs/audio-render-gate.spec.ts` is the right
  audibility check (proves the _output_ is real, through the real `Code
  Helper (Plugin)` path, via `OfflineAudioContext` — no device needed).

## Reference

- Sidecar entry (stdin/stdout wiring + the real backend): `src/sidecar.ts`.
  Command state machine (DI'd, unit-tested): `src/commandHandler.ts`.
  Output path + analyser tap (`playSampleChannels`, `getPlaybackStats`):
  `src/player.ts`. Client: `src/client.ts`. Protocol: `src/protocol.ts`.
  Device-tolerant `AudioContext` guard (see "Device tolerance" above):
  `src/audioContextGuard.ts`.
- `zzfx` has no shipped `.d.ts` — `src/zzfx.d.ts` is copied from
  `tools/vscode/webview/audio/zzfx.d.ts`; keep in sync if the pinned `zzfx`
  version changes.
- Extension-side wiring: `tools/vscode/extension/tools/audio/
playSidecarManager.ts` (mirrors `sidecarManager.ts`, exposes
  `getPlaySidecarStats()`/`pingPlaySidecar()`), `register.ts` (routes
  `threeFlatland.audio.playParams` here instead of a panel, with a
  remote/spawn-failure fallback back to the panel path). `ping` is also
  surfaced on `ExtensionApi.zzfxPlay.ping` (`tools/vscode/extension/
index.ts`) alongside `getActivePid`/`shutdown`/`getStats`.
- e2e coverage: the deterministic offline audibility gate lives at
  `tools/vscode/e2e/specs/audio-render-gate.spec.ts`
  (`tools/vscode/e2e/host-bridge/offlineRenderProbe.mjs` is the probe it
  spawns). `tools/vscode/e2e/specs/audio-play.spec.ts`,
  `zzfx-audio-lenses.spec.ts`, and `zzfx-synth-lenses.spec.ts` cover
  sidecar process lifecycle and CodeLens wiring/dispatch, deliberately
  without any live-audio polling — see
  `planning/testing/test-determinism-audit.md` for the redesign this
  followed. `audio-play.spec.ts`'s three process-lifecycle tests now
  assert liveness via `ping()` (device-independent) before/alongside any
  pid-based assertion — see "Device tolerance"/"`ping`" above for why a
  bare pid alone isn't sufficient proof on a device-less runner.
