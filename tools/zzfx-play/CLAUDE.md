# @three-flatland/zzfx-play

> Agent-facing reference for the inline audio sidecar — real `AudioContext`
> (via `node-web-audio-api`) driving `zzfx` one-shots and `@zzfx-studio/
zzfxm` songs, both run completely unmodified.

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
stdin (commands) and stdout (responses), fire-and-forget — commands carry
no `id`, responses aren't correlated back to a specific request. A caller
that needs to know a `play`/`playSong` failed listens for an error
response via `client.onError()`; there's nothing meaningful to return on
success.

Commands: `play {params}` (one-shot), `playSong {song}` / `stopSong`
(ZzFXM), `stop` (currently identical to `stopSong` — see the comment on
`handleStop` in `commandHandler.ts` for why it's a separate command
anyway), `shutdown`.

The command state machine (song replacement, stop semantics, catching a
backend error into a `Nack`) lives in `src/commandHandler.ts`, injected
with an `AudioBackend` — `sidecar.ts` supplies the real zzfx/zzfxm-backed
one, `commandHandler.test.ts` supplies a fake one with no real audio at
all. `sidecar.ts` itself is only stdin/stdout wiring + that one real
backend.

## `zzfx`/`zzfxm` run completely unmodified — how

`sidecar.ts` imports `node-web-audio-api/polyfill.js` **before** `zzfx`.
This matters because `zzfx`'s `ZZFX.audioContext = new AudioContext` runs
at _module load time_ (`node_modules/zzfx/ZzFX.js`) — `AudioContext` has
to already be a real global by the time `zzfx` is imported, which the
polyfill provides by `Object.assign(globalThis, webaudio)` (see
`node-web-audio-api/polyfill.js`). Past that import ordering, both `zzfx`
and `@zzfx-studio/zzfxm` are used exactly as published — no synth port, no
API shims, zero fidelity drift from what the studio webview (real browser
Web Audio) produces. `zzfxm()` itself calls `ZZFX.playSamples(...)`
internally (see `@zzfx-studio/zzfxm`'s `dist/zzfxm.js`), so a song and a
one-shot share the exact same underlying `AudioContext` — no dual-context
juggling needed.

## Lifecycle — mirrors `sidecarManager.ts`

`PlaySidecarClient` follows the exact same shape as `tools/vscode/
extension/tools/zzfx/sidecarManager.ts`'s `CodelensServiceClient`
wrapping: lazy spawn on first `play()`/`playSong()` call, warm reuse for
everything after (`start()` is idempotent), `onExit`/`onError` return
unsubscribe functions (not a bulk-`dispose()` API — same convention as
`tools/bridge`'s `ClientBridge.on()`), graceful `shutdown()` with a
`SIGKILL` fallback after a timeout, hard `dispose()` for immediate kill.

## Building

`pnpm --filter @three-flatland/zzfx-play build` (tsup, `bundle: false` —
same reasoning as `codelens-service`: every cross-imported file under
`src/` needs its own `tsup.config.ts` entry, since `bundle: false` doesn't
follow imports to inline them). `dist/sidecar.js` is the file actually
passed to `child_process.spawn()` — it must exist as a real file on disk,
it's never imported as a module by the extension host itself.

## Tests — two tiers, no real audio in either

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

Neither tier proves the _real_ `sidecar.ts` + real `node-web-audio-api`
combination works — that's what the hard prototype gate above and
`tools/vscode/e2e/specs/zzfx-play.spec.ts` (driven against the real
built extension) are for. Unit tests here are deliberately scoped to
"does the state machine / process plumbing behave correctly," not "does
audio actually play."

## Common pitfalls

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

## Reference

- Sidecar entry (stdin/stdout wiring + the real backend): `src/sidecar.ts`.
  Command state machine (DI'd, unit-tested): `src/commandHandler.ts`.
  Client: `src/client.ts`. Protocol: `src/protocol.ts`.
- `zzfx` has no shipped `.d.ts` — `src/zzfx.d.ts` is copied from
  `tools/vscode/webview/zzfx/zzfx.d.ts`; keep in sync if the pinned `zzfx`
  version changes.
- Extension-side wiring: `tools/vscode/extension/tools/zzfx/
playSidecarManager.ts` (mirrors `sidecarManager.ts`), `register.ts`
  (routes `threeFlatland.zzfx.playParams` here instead of a panel, with a
  remote/spawn-failure fallback back to the panel path).
- e2e coverage: `tools/vscode/e2e/specs/zzfx-play.spec.ts`.
