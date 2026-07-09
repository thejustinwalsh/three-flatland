# @three-flatland/zzfx-play

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
see `sidecarManager.ts` in `tools/vscode/extension/tools/zzfx/`) with
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
`play`/`playSong`/`stopSong`/`stop`/`shutdown` — commands carry no `id`,
responses aren't correlated back to a specific request. A caller that
needs to know a `play`/`playSong` failed listens for an error response via
`client.onError()`; there's nothing meaningful to return on success.

`stats` (see "Audibility regression guard" below) is the one exception —
it exists purely to hand data back, so `client.ts`'s `getStats()`
correlates its response by content (the next `cmd: 'stats'` line on
stdout) rather than a formal request id, which is safe only because the
sidecar processes stdin lines strictly sequentially (`sidecar.ts`'s
`rl.on('line', ...)`) — responses can never arrive out of order relative
to the commands that produced them.

Commands: `play {params}` (one-shot), `playSong {song}` / `stopSong`
(ZzFXM), `stop` (currently identical to `stopSong` — see the comment on
`handleStop` in `commandHandler.ts` for why it's a separate command
anyway), `shutdown`, `stats` (audibility snapshot). `stopSong`/`stop`
stop the CURRENT SOURCE — a song or a decoded file (#46): `playFile`'s
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

`sidecar.ts` still imports `node-web-audio-api/polyfill.js` **before**
`zzfx` — `zzfx`'s `ZZFX.audioContext = new AudioContext` runs at _module
load time_ (`node_modules/zzfx/ZzFX.js`), so `AudioContext` has to already
be a real global by the time `zzfx` is imported (the polyfill provides
this via `Object.assign(globalThis, webaudio)`). `player.ts` reuses that
same `ZZFX.audioContext` for both one-shots and songs — no dual-context
juggling needed.

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
cannot, regardless of how the assertion is tuned. The only valid
audibility proof is `tools/vscode/e2e/specs/zzfx-play.spec.ts`, which
drives the real sidecar through a real running extension host, and
therefore through the real `Code Helper (Plugin)` binary. That spec has
been verified in both directions: it passes with `copyToChannel` in place
and **fails** (`stats.silent === true`) when `getChannelData().set()` is
reintroduced — that's what makes it a real guard, not a decorative one.

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
command, `PlaySidecarClient.getStats()`, `playSidecarManager.ts`'s
`getPlaySidecarStats()`, and `extension/index.ts`'s `ExtensionApi` so
`tools/vscode/e2e/specs/zzfx-play.spec.ts` can play a sound through the
real sidecar and assert real, nonzero output. **This proof only holds at
the e2e tier** — see "This bug is Electron-specific" above for why a
vitest-level real-sidecar test cannot substitute for it.

## Lifecycle — mirrors `sidecarManager.ts`

`PlaySidecarClient` follows the exact same shape as `tools/vscode/
extension/tools/zzfx/sidecarManager.ts`'s `CodelensServiceClient`
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
across time (e.g. `tools/vscode/extension/tools/zzfx/activePlayback.ts`'s
`watchPlaybackEnd` polling loop) — without it, a poll tick landing after
the singleton in `playSidecarManager.ts` has already respawned a NEW
instance would call `start()` on the stale, exited one and silently spawn
a second, orphaned child process invisible to the singleton's pid/shutdown
bookkeeping. Get a fresh client from `getPlaySidecarClient()` rather than
reusing one that might have exited.

## Building

`pnpm --filter @three-flatland/zzfx-play build` (tsup, `bundle: false` —
same reasoning as `codelens-service`: every cross-imported file under
`src/` needs its own `tsup.config.ts` entry, since `bundle: false` doesn't
follow imports to inline them). `dist/sidecar.js` is the file actually
passed to `child_process.spawn()` — it must exist as a real file on disk,
it's never imported as a module by the extension host itself.

## Tests — three tiers, no real audio in any of them

- **`src/commandHandler.test.ts`** — the state machine (song replacement,
  stop semantics, error-to-Nack) against a fake `AudioBackend`. No
  process, no `AudioContext`, no `node-web-audio-api` — fast, always
  runs.
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
  fixture's hang-mode switch goes through `env` instead of an arg).
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
hard prototype gate above and `tools/vscode/e2e/specs/zzfx-play.spec.ts`
(driven against the real built extension, through the real `Code Helper
(Plugin)` binary) are for, and per "This bug is Electron-specific" above,
**that e2e tier is not optional or redundant with a vitest-level
real-process test** — it's the only tier capable of catching this
specific class of regression at all.

## Common pitfalls

- **Linux CI (`ubuntu-latest`) has no audio device by default — `xvfb-run`
  only virtualizes the DISPLAY, not sound.** `node-web-audio-api` (via
  Rust's `cpal`, which uses ALSA on Linux) has nothing to open in a bare
  runner: real-audio-dependent e2e specs (anything waiting on
  `stats.playing`, or a decoded `.wav`/song/synth actually reaching the
  analyser tap) either hang until their 60s timeout or the sidecar itself
  fails during `AudioContext` construction (observed as a `null`/
  `undefined` pid on the very first `zzfx-play.spec.ts` assertion — the
  child process never stabilizes). `tools/vscode/.github/workflows/
vscode-e2e.yml` installs and starts PulseAudio with a null sink
  (`pactl load-module module-null-sink`) before the e2e run specifically
  for this — ALSA's `pulse` plugin then has a real, functioning (silent)
  default device to open. This was never exercised until #47 (Tone/Wad
  synthesis) landed and the workflow ran on Linux CI for the first time;
  every previous "green e2e" in this epic's history was verified locally
  on macOS, which has a real audio device. If a real-audio e2e spec times
  out or gets a null pid in CI specifically (not locally), check this
  step exists and actually ran before suspecting the test or the sidecar
  logic itself.
- Forgetting the `node-web-audio-api/polyfill.js` import order relative to
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
  and unhelpfully, report silence. Poll for a bit rather than a single
  fixed-delay check — see the Z12 e2e spec's polling loop.
- **Adding a vitest-level test that spawns `dist/sidecar.js` via plain
  `process.execPath` and asserts on `stats.peak`/`stats.silent` to "prove
  audibility."** It cannot — `getChannelData().set()` plays back
  correctly under plain Node and only breaks under Electron's Node
  integration, so a plain-Node test passes identically whether the bug is
  present or fixed (verified both ways, see "This bug is
  Electron-specific" above). This looks like a regression guard and
  isn't one. `src/player.test.ts`'s fake-`AudioContext` unit tests are
  the right vitest-tier check (proves the _code_ calls the right API);
  `tools/vscode/e2e/specs/zzfx-play.spec.ts` is the right audibility
  check (proves the _output_ is real, through the real `Code Helper
(Plugin)` path).

## Reference

- Sidecar entry (stdin/stdout wiring + the real backend): `src/sidecar.ts`.
  Command state machine (DI'd, unit-tested): `src/commandHandler.ts`.
  Output path + analyser tap (`playSampleChannels`, `getPlaybackStats`):
  `src/player.ts`. Client: `src/client.ts`. Protocol: `src/protocol.ts`.
- `zzfx` has no shipped `.d.ts` — `src/zzfx.d.ts` is copied from
  `tools/vscode/webview/zzfx/zzfx.d.ts`; keep in sync if the pinned `zzfx`
  version changes.
- Extension-side wiring: `tools/vscode/extension/tools/zzfx/
playSidecarManager.ts` (mirrors `sidecarManager.ts`, exposes
  `getPlaySidecarStats()`), `register.ts` (routes
  `threeFlatland.zzfx.playParams` here instead of a panel, with a
  remote/spawn-failure fallback back to the panel path).
- e2e coverage, including the Z12 audibility regression guard:
  `tools/vscode/e2e/specs/zzfx-play.spec.ts`.
