## Findings

1. **P0 — CI still launches the real audio device path after PulseAudio was removed.**

   [audio-play.spec.ts:32](/Users/tjw/Developer/three-flatland/.claude/worktrees/tools-combined/tools/vscode/e2e/specs/audio-play.spec.ts:32), [audio-play.spec.ts:59](/Users/tjw/Developer/three-flatland/.claude/worktrees/tools-combined/tools/vscode/e2e/specs/audio-play.spec.ts:59), and [audio-play.spec.ts:91](/Users/tjw/Developer/three-flatland/.claude/worktrees/tools-combined/tools/vscode/e2e/specs/audio-play.spec.ts:91) all execute `playParams`. That spawns the production sidecar, whose import of `zzfx` constructs `new AudioContext` at module load ([sidecar.ts:15](/Users/tjw/Developer/three-flatland/.claude/worktrees/tools-combined/tools/audio-play/src/sidecar.ts:15), [ZzFX.js:62](/Users/tjw/Developer/three-flatland/.claude/worktrees/tools-combined/node_modules/.pnpm/zzfx@1.3.2/node_modules/zzfx/ZzFX.js:62)). `node-web-audio-api` immediately calls the native `NapiAudioContext` constructor and rethrows native failures ([AudioContext.js:63](/Users/tjw/Developer/three-flatland/.claude/worktrees/tools-combined/node_modules/.pnpm/node-web-audio-api@2.0.0/node_modules/node-web-audio-api/js/AudioContext.js:63)).

   On Linux, that native constructor uses cpal/ALSA and is expected to fail when there is no default output device; there is no fallback or catch around the initial context. It does not merely guarantee a harmless non-running context.

   The PID checks do not make this safe. The client records the child synchronously at spawn ([client.ts:87](/Users/tjw/Developer/three-flatland/.claude/worktrees/tools-combined/tools/audio-play/src/client.ts:87)), before the child imports `zzfx`. Three rapid commands can therefore collect the same PID before the asynchronous crash is observed—possibly producing a false green. Other audio-lens tests will then fail or hang when they expect responses.

   Safest blocking-lane fix: make sidecar startup device-tolerant. Lazily initialize the real backend, catch initial `AudioContext` creation failure, keep the protocol process alive, and return a correlated Nack for play commands. Add a device-independent ready/ping command for lifecycle/PID tests. Moving PID tests to a non-blocking hardware lane avoids red CI but loses useful process-lifecycle coverage.

2. **P0 — the offline probe has an exit/stdio race and can intermittently report “no verdict.”**

   The child calls `console.log(...)` and immediately `process.exit(0)` ([offlineRenderProbe.mjs:56](/Users/tjw/Developer/three-flatland/.claude/worktrees/tools-combined/tools/vscode/e2e/host-bridge/offlineRenderProbe.mjs:56)). Node explicitly does not guarantee pending pipe writes are flushed by `process.exit()`.

   The parent compounds that by inspecting stdout on the child’s `exit` event ([audio-render-gate.spec.ts:67](/Users/tjw/Developer/three-flatland/.claude/worktrees/tools-combined/tools/vscode/e2e/specs/audio-render-gate.spec.ts:67)); `exit` may precede the child stdio streams’ `close` event and final `data` delivery.

   Remove explicit `process.exit`, set `process.exitCode` if needed, and settle the parent on `close`, after stdout/stderr are drained.

3. **P0 — the rewritten audio-lens suite still contains exactly the forbidden deadline polling.**

   `fetchSettledLenses` polls every 150 ms until a 15-second wall-clock deadline ([zzfx-audio-lenses.spec.ts:155](/Users/tjw/Developer/three-flatland/.claude/worktrees/tools-combined/tools/vscode/e2e/specs/zzfx-audio-lenses.spec.ts:155)). `pollLensAt` repeats the same pattern with a 5-second deadline ([zzfx-audio-lenses.spec.ts:204](/Users/tjw/Developer/three-flatland/.claude/worktrees/tools-combined/tools/vscode/e2e/specs/zzfx-audio-lenses.spec.ts:204)).

   Calling this “sanctioned” does not make it deterministic. These tests still depend on search completion beating a scheduler/load-dependent deadline. The resolver already fires `onDidChangeCodeLenses`; expose/await the resolver’s in-flight search or a test-facing completion signal. If no causal signal can be exposed, delete the timing-sensitive e2e assertion rather than retain a deadline oracle.

4. **P0 — the BroadcastChannel echo-guard barrier is not a valid barrier.**

   [bus-websocket.test.ts:347](/Users/tjw/Developer/three-flatland/.claude/worktrees/tools-combined/packages/three-flatland/src/debug/bus-websocket.test.ts:347) assumes the wire-borne repost and a later barrier post are delivered in order. They are posted by different `BroadcastChannel` objects: the consumer bridge’s internal channel and `barrierChannel` at line 354. BroadcastChannel FIFO applies to messages from the same sending object/source; it does not impose a total order across independent senders.

   Therefore the barrier can reach the provider tap first, the assertion at line 362 can pass, and the prohibited echo can arrive afterward. That is both a race and a false green. Instrument the actual provider tap/echo-guard with an explicit processed/drop acknowledgement, or delete this negative integration test if production cannot expose a causal drain signal.

   The filter barrier at [bus-websocket.test.ts:414](/Users/tjw/Developer/three-flatland/.claude/worktrees/tools-combined/packages/three-flatland/src/debug/bus-websocket.test.ts:414) is different: all three messages originate from the same `local` object, so FIFO is defensible there.

5. **P1 — “dispatch without throwing” is false coverage for fire-and-forget sidecar commands.**

   The rewritten specs claim full command completion at [zzfx-audio-lenses.spec.ts:181](/Users/tjw/Developer/three-flatland/.claude/worktrees/tools-combined/tools/vscode/e2e/specs/zzfx-audio-lenses.spec.ts:181) and [zzfx-synth-lenses.spec.ts:118](/Users/tjw/Developer/three-flatland/.claude/worktrees/tools-combined/tools/vscode/e2e/specs/zzfx-synth-lenses.spec.ts:118). But `playSong` and `playWadSynth` merely write to the child and return ([register.ts:424](/Users/tjw/Developer/three-flatland/.claude/worktrees/tools-combined/tools/vscode/extension/tools/audio/register.ts:424), [register.ts:467](/Users/tjw/Developer/three-flatland/.claude/worktrees/tools-combined/tools/vscode/extension/tools/audio/register.ts:467)). They do not await an Ack.

   A malformed command, native device failure, Nack, or sidecar crash after stdin write can therefore leave these tests green. The offline gate only validates `playSampleChannels`; it does not validate command serialization, `ZZFXM.build`, Wad construction, file decoding, or that the real sidecar accepted the command.

   Promote every play kind to ID-correlated responses, as Tone already does. Until then, these tests should be described only as extension-command routing tests.

6. **P1 — unique source-editor binding coverage was deleted with no replacement.**

   Production behavior lives in three VS Code event handlers at [register.ts:241](/Users/tjw/Developer/three-flatland/.claude/worktrees/tools-combined/tools/vscode/extension/tools/audio/register.ts:241): active-editor change, tab-group change, and document close. Neither `commandHandler.test.ts` nor `player.test.ts` exercises VS Code tabs, `ActivePlayback.sourceUri`, or these listeners.

   The removed “switching/closing the source document stops playback” e2e was the only test covering this wiring. It was load-bearing—comments at [register.ts:227](/Users/tjw/Developer/three-flatland/.claude/worktrees/tools-combined/tools/vscode/extension/tools/audio/register.ts:227) explicitly say the tab event is required because `onDidCloseTextDocument` is insufficient.

   Restore this with an injected/observable stop command or a fake VS Code event unit test. It need not assert audibility; it should assert the sidecar’s correlated `stop` receipt.

7. **P1 — the shared window still leaks timer-driven and process state across tests.**

   The fixture only closes tabs, clears workspace configuration, and recopies files ([fixtures.ts:151](/Users/tjw/Developer/three-flatland/.claude/worktrees/tools-combined/tools/vscode/e2e/fixtures.ts:151)). The extension host, sidecars, active-playback singleton, resolver caches, global storage, and audio context all survive because the same window is reused across every file ([fixtures.ts:219](/Users/tjw/Developer/three-flatland/.claude/worktrees/tools-combined/tools/vscode/e2e/fixtures.ts:219)).

   Worse, the fixture deliberately sets the sidecar’s idle release to five seconds ([fixtures.ts:90](/Users/tjw/Developer/three-flatland/.claude/worktrees/tools-combined/tools/vscode/e2e/fixtures.ts:90)). Whether a later test uses the existing context or exercises reacquisition therefore depends on how long preceding tests took. That is direct timer/order dependence.

   Add a deterministic extension test-reset command that stops sidecars, clears `ActivePlayback` and resolver caches, and cancels idle state—or use a fresh extension host for audio specs. Do not use elapsed inter-test gaps to choose the production path.

8. **P1 — the Tone tests still wait on fixed production backoff timers.**

   [zzfx-synth-lenses.spec.ts:443](/Users/tjw/Developer/three-flatland/.claude/worktrees/tools-combined/tools/vscode/e2e/specs/zzfx-synth-lenses.spec.ts:443) explicitly waits through the retry schedule. That schedule is four fixed sleeps at [toneColdStartRetry.ts:56](/Users/tjw/Developer/three-flatland/.claude/worktrees/tools-combined/tools/vscode/extension/tools/audio/toneColdStartRetry.ts:56) and [toneColdStartRetry.ts:87](/Users/tjw/Developer/three-flatland/.claude/worktrees/tools-combined/tools/vscode/extension/tools/audio/toneColdStartRetry.ts:87).

   The response correlation is good, but retry timing is still a timer dependency and can lose if module loading exceeds the arbitrary budget. The sidecar should await its already-existing `toneEnginePromise` and Ack when ready, rather than repeatedly Nack and require timed retries.

9. **P1 — several deleted audio integrations are not equivalent to their unit replacements.**

   Per deletion:

   - **`playSong` var-ref/positional/spread plays:** lens census proves command names, while `commandHandler.test.ts` receives an already-resolved `Song`. It does not cover CodeLens source identity → fresh parse → `resolveSong` → wire serialization → `ZZFXM.build`. Positional playback is no longer dispatched at all. Unique integration coverage was lost.
   - **Cross-kind supersede:** command-handler tests adequately prove the generic single-slot state machine with fake handles ([commandHandler.test.ts:263](/Users/tjw/Developer/three-flatland/.claude/worktrees/tools-combined/tools/audio-play/src/commandHandler.test.ts:263)). They do not prove the real Wad/Tone/song backends return and register the correct handle. This is a moderate integration loss, not a complete semantic loss.
   - **Mid-playback Wad/Tone stop:** player tests prove fake `wad.stop`, `triggerRelease`, `releaseAll`, and disposal ([player.test.ts:564](/Users/tjw/Developer/three-flatland/.claude/worktrees/tools-combined/tools/audio-play/src/player.test.ts:564), [player.test.ts:726](/Users/tjw/Developer/three-flatland/.claude/worktrees/tools-combined/tools/audio-play/src/player.test.ts:726)). Command-handler tests prove stop invokes the current fake handle. Missing is the real engine handle → command handler → wire `stopSong` integration. A correlated stop Ack would recover this deterministically.
   - **Long-song sustain/exact 7.68-second duration:** generic fake-context timing tests at [player.test.ts:275](/Users/tjw/Developer/three-flatland/.claude/worktrees/tools-combined/tools/audio-play/src/player.test.ts:275) do not exercise `ZZFXM.build`’s actual sample count or ensure the five-second idle-release path does not close a long real song. Unique coverage was removed. Replace with an offline render of the fixture song plus deterministic lifecycle unit tests, not wall-clock playback.
   - **Source-editor tab-binding stop:** no equivalent coverage; this is the clearest load-bearing deletion.
   - **`SUSTAINED_PARAMS` audibility:** the copy regression itself is covered by the new offline gate and by the unit test forbidding `getChannelData` ([player.test.ts:114](/Users/tjw/Developer/three-flatland/.claude/worktrees/tools-combined/tools/audio-play/src/player.test.ts:114)). What is not covered is `playParams` command → `ZZFX.buildSamples` → production sidecar graph. The fixed sine probe bypasses that integration.

10. **P2 — the offline gate catches the named regression, but its oracle is narrower than claimed.**

   It imports the real built production function, not a copy: [offlineRenderProbe.mjs:30](/Users/tjw/Developer/three-flatland/.claude/worktrees/tools-combined/tools/vscode/e2e/host-bridge/offlineRenderProbe.mjs:30) resolves `./dist/player.js`, and global setup rebuilds dependencies before the suite. Reintroducing `getChannelData().set()` should render zeros under the affected Electron binary, so this gate should catch that exact regression.

   `peak > 1e-3` is enough for that binary zero-vs-nonzero defect because the offline graph contains only a fixed sine source, gain, analyser, and destination—no device noise. But it is weak for broader corruption: a DC offset, one-sample impulse, wrong frequency, wrong gain, or mostly corrupt output all pass. The parent parses energy and frames but never asserts either ([audio-render-gate.spec.ts:88](/Users/tjw/Developer/three-flatland/.claude/worktrees/tools-combined/tools/vscode/e2e/specs/audio-render-gate.spec.ts:88)).

   Assert exact frame count, expected peak/energy ranges, and correlation or RMS error against the known sine. That strengthens the oracle without introducing timing.

11. **P2 — the relay rewrite retains unseeded randomness unnecessarily.**

   WebSocket handshake keys still use `Math.random()` at [relay.test.ts:163](/Users/tjw/Developer/three-flatland/.claude/worktrees/tools-combined/packages/devtools/src/relay.test.ts:163) and [relay.test.ts:261](/Users/tjw/Developer/three-flatland/.claude/worktrees/tools-combined/packages/devtools/src/relay.test.ts:261). It is unlikely to fail, but it directly violates the stated rule and adds no coverage. Use a fixed valid 16-byte RFC example key.

## CI assessment

The explicit masking layers are gone: Playwright retries are zero ([playwright.config.ts:33](/Users/tjw/Developer/three-flatland/.claude/worktrees/tools-combined/tools/vscode/e2e/playwright.config.ts:33)), and the workflow invokes the test command once ([vscode-e2e.yml:98](/Users/tjw/Developer/three-flatland/.claude/worktrees/tools-combined/.github/workflows/vscode-e2e.yml:98)). I found no remaining `continue-on-error` or retry wrapper on this job.

However, CI is not reproducible across time: it uses `ubuntu-latest`, `node-version: lts/*`, a stable Rust toolchain, and VS Code `stable` ([vscode-e2e.yml:9](/Users/tjw/Developer/three-flatland/.claude/worktrees/tools-combined/.github/workflows/vscode-e2e.yml:9), [vscode-e2e.yml:20](/Users/tjw/Developer/three-flatland/.claude/worktrees/tools-combined/.github/workflows/vscode-e2e.yml:20), [fixtures.ts:194](/Users/tjw/Developer/three-flatland/.claude/worktrees/tools-combined/tools/vscode/e2e/fixtures.ts:194)). Pinning VS Code is particularly important for an Electron-native regression gate.

Bottom line: the offline rendering concept is sound and catches the specific detached-buffer regression, but this PR is not yet “signals only.” The device-less sidecar startup, stdout/`exit` race, invalid cross-channel barrier, two explicit lens poll deadlines, and deleted tab-binding coverage are blocking issues.