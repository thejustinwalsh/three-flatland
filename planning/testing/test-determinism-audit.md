## Bottom line

The current test architecture violates the maintainer’s rule in several places. The audio CI gate is probabilistic by construction and should be replaced, not “stabilized.”

Most importantly, I verified the missing technical fact:

> Under the actual VS Code `Code Helper (Plugin)` binary, `OfflineAudioContext.startRendering()` reproduces the Electron-specific detached-`getChannelData()` bug.

My read-only A/B probe under the downloaded Electron helper produced:

```text
getChannelData().set(): peak=0, energy=0
copyToChannel():       peak=1, energy≈2400
```

Therefore an Electron-hosted offline render is the foundationally correct regression gate. It needs no audio device, PulseAudio, analyser polling, warmup, sleep, or deadline—and it still catches the exact production bug.

No files were changed.

## P0: Replace the audio gate

The bad architecture is concentrated in:

- [fixtures.ts](tools/vscode/e2e/fixtures.ts:132): unconditional worker-start audio warmup.
- [fixtures.ts](tools/vscode/e2e/fixtures.ts:196): `warmUpAudioPipeline`.
- [fixtures.ts](tools/vscode/e2e/fixtures.ts:259): CodeLens poll deadline.
- [fixtures.ts](tools/vscode/e2e/fixtures.ts:307): 45-second replay/poll warmup.
- [fixtures.ts](tools/vscode/e2e/fixtures.ts:321): live-analyser polling.
- [fixtures.ts](tools/vscode/e2e/fixtures.ts:371): timer-based “deaf sidecar” classification.
- [fixtures.ts](tools/vscode/e2e/fixtures.ts:474): timer-bounded child oracle.
- [fixtures.ts](tools/vscode/e2e/fixtures.ts:512): second 10-second re-probe.
- [deviceProbe.mjs](tools/vscode/e2e/host-bridge/deviceProbe.mjs:31): real `AudioContext` and output device.
- [deviceProbe.mjs](tools/vscode/e2e/host-bridge/deviceProbe.mjs:49): six fixed-delay analyser reads.

The underlying sampling flaw is [player.ts](tools/audio-play/src/player.ts:247): `getPlaybackStats()` snapshots only the analyser’s current window. It does not prove that a particular command produced samples. It can miss a short sound or attribute an adjacent sound to the wrong command.

### Deterministic replacement

Add one Electron-helper integration gate that:

1. Creates an `OfflineAudioContext` with a fixed sample rate and frame count.
2. Generates fixed, known non-zero samples.
3. Sends them through the real production `playSampleChannels()` graph at [player.ts:163](tools/audio-play/src/player.ts:163).
4. Awaits `offline.startRendering()`. That promise is the completion signal.
5. Reads the returned buffer using `copyFromChannel`—not `getChannelData`, given the bug under test.
6. Asserts non-zero accumulated energy, expected peak, and preferably waveform/zero-crossing shape.

Run this under the real `Code Helper (Plugin)` with `ELECTRON_RUN_AS_NODE=1`. A regression at [player.ts:175](tools/audio-play/src/player.ts:175) from `copyToChannel` back to `getChannelData().set()` deterministically renders zeros.

This can be exposed as an awaited, ID-correlated `renderProbe` command, or as a dedicated helper process launched from the extension host. It must import and execute the production output function, not duplicate its write logic in the test.

### Offline versus real AudioContext

`OfflineAudioContext.startRendering()` is foundationally correct:

- Device-independent.
- Frame-count deterministic.
- Completion is explicitly signalled by the returned promise.
- The returned samples belong to this exact render.
- It catches the Electron detached-copy bug. Verified directly.

A real `AudioContext` plus accumulated energy and `AudioBufferSourceNode.onended` is not foundationally correct:

- `onended` proves the source timeline ended; it does not prove the device rendered non-zero output.
- Energy accumulation still requires live render callbacks to run.
- Those callbacks depend on the real device/PulseAudio/cpal stream.
- It catches the detached-copy bug only when the live output stream is healthy.
- A dead or delayed stream remains indistinguishable from zero-filled application output.

It is better than snapshot polling, but still unsuitable as a CI gate.

The real-hardware path should be removed from blocking CI. Keep it only as a manual/non-blocking platform smoke lane. Delete the idea that retrying it can produce a trustworthy green.

The workflow currently admits and masks this nondeterminism:

- [vscode-e2e.yml:105](.github/workflows/vscode-e2e.yml:105): PulseAudio readiness polling with sleeps.
- [vscode-e2e.yml:117](.github/workflows/vscode-e2e.yml:117): null-sink polling with sleeps.
- [vscode-e2e.yml:128](.github/workflows/vscode-e2e.yml:128): explicit whole-job retry to shake audio state.
- [vscode-e2e.yml:141](.github/workflows/vscode-e2e.yml:141): `nick-fields/retry`, two attempts.

A retrying probabilistic oracle is not a gate.

## Exact rewrites for the anchored flakes

### Codelens `didChange`

The first test is already correct in the current tree:

- [client.test.ts:77](tools/codelens-service/src/client.test.ts:77) sends `didChange`.
- It then awaits `parse()`.
- The parse response carries `_didChangeSeen`.
- [fakeSidecar.mjs:56](tools/codelens-service/src/__fixtures__/fakeSidecar.mjs:56) generates that ordered stdout signal.

Keep this test.

The second remains broken:

- [client.test.ts:250](tools/codelens-service/src/client.test.ts:250)
- [client.test.ts:256](tools/codelens-service/src/client.test.ts:256) incorrectly claims a stdout parse response ensures a prior stderr write has arrived.
- The actual log is written at [fakeSidecar.mjs:104](tools/codelens-service/src/__fixtures__/fakeSidecar.mjs:104).

Concrete rewrite: attach a Promise to `client.stderr` before `didChange`, accumulate chunks until the expected line is observed, and await that Promise. The stderr `data` event is the signal this test is meant to verify. Do not use `parse()` as a cross-pipe barrier.

### Audio specs

All audibility assertions in these files must move to the offline Electron render gate:

- [audio-play.spec.ts:147](tools/vscode/e2e/specs/audio-play.spec.ts:147), polling at lines 163–174.
- [zzfx-audio-lenses.spec.ts:188](tools/vscode/e2e/specs/zzfx-audio-lenses.spec.ts:188), used at lines 472, 496, 522, 544, 773, 888, 897, 927, 975, and 1022.
- [zzfx-synth-lenses.spec.ts:122](tools/vscode/e2e/specs/zzfx-synth-lenses.spec.ts:122), used at lines 214, 313, 349, 362, 392, 414, 440, 448, 478, 586, and 672.

For ordinary lens e2e tests, stop proving hardware audibility repeatedly. Prove:

- The exact lens command was generated.
- The sidecar returned that command’s ID-correlated start Ack.
- Stop returned that command’s ID-correlated stop Ack.
- Natural completion, where relevant, came from the source’s `onended`/engine completion event.

Currently most play/stop commands are fire-and-forget at [client.ts:216](tools/audio-play/src/client.ts:216). Promote all commands to ID-correlated awaited operations. Tone already has the beginning of this design at [client.ts:273](tools/audio-play/src/client.ts:273).

Stop tests should await a correlated `stopped` response generated after the actual source stop/completion signal—not poll `silent`.

Long-duration/sustain behavior belongs in offline rendering or fake-clock unit tests. It must not consume five real seconds to establish a property of sample frames.

## Other explicit timer/poll dependencies

### VS Code e2e

- [audio-play.spec.ts:60](tools/vscode/e2e/specs/audio-play.spec.ts:60): 500 ms delay before asserting no panel. Await command completion; then inspect tabs.
- [audio-play.spec.ts:83](tools/vscode/e2e/specs/audio-play.spec.ts:83): 300 ms before reading PID. Await a sidecar-ready/start Ack.
- [audio-play.spec.ts:110](tools/vscode/e2e/specs/audio-play.spec.ts:110): same PID race before shutdown.
- [zzfx-audio-lenses.spec.ts:158](tools/vscode/e2e/specs/zzfx-audio-lenses.spec.ts:158): `Searching…` poll. Await `onDidChangeCodeLenses` or expose the resolver’s completion promise.
- [zzfx-audio-lenses.spec.ts:227](tools/vscode/e2e/specs/zzfx-audio-lenses.spec.ts:227): silence polling.
- [zzfx-audio-lenses.spec.ts:284](tools/vscode/e2e/specs/zzfx-audio-lenses.spec.ts:284): lens poll deadline.
- [zzfx-audio-lenses.spec.ts:620](tools/vscode/e2e/specs/zzfx-audio-lenses.spec.ts:620): long-song real-time polling.
- [zzfx-audio-lenses.spec.ts:921](tools/vscode/e2e/specs/zzfx-audio-lenses.spec.ts:921): document-switch/close stop polling.
- [zzfx-synth-lenses.spec.ts:155](tools/vscode/e2e/specs/zzfx-synth-lenses.spec.ts:155): silence polling.
- [zzfx-synth-lenses.spec.ts:510](tools/vscode/e2e/specs/zzfx-synth-lenses.spec.ts:510): real-time natural-end deadline.
- [zzfx-synth-lenses.spec.ts:638](tools/vscode/e2e/specs/zzfx-synth-lenses.spec.ts:638): fixed 1-second delay.
- [zzfx-synth-lenses.spec.ts:703](tools/vscode/e2e/specs/zzfx-synth-lenses.spec.ts:703): 20-second cold-start poll.

Additional non-audio e2e landmines:

- [settings.spec.ts:288](tools/vscode/e2e/specs/settings.spec.ts:288): CodeLens resolution poll.
- [normal-baker.spec.ts:77](tools/vscode/e2e/specs/normal-baker.spec.ts:77): polls for output file after Save. The Save bridge response already is the proper completion signal; make the click await/expose it.
- [normal-baker.spec.ts:254](tools/vscode/e2e/specs/normal-baker.spec.ts:254): polls JSON length after Save.
- [atlas-formats.spec.ts:28](tools/vscode/e2e/specs/atlas-formats.spec.ts:28): retries Save clicks until lazy image loading happens. Expose an `image-ready` render signal and click once.
- [zzfx.spec.ts:403](tools/vscode/e2e/specs/zzfx.spec.ts:403): waveform attribute poll. Dispatch/await a `waveform-rendered` event after drawing.
- [zzfx.spec.ts:458](tools/vscode/e2e/specs/zzfx.spec.ts:458) and [zzfx.spec.ts:505](tools/vscode/e2e/specs/zzfx.spec.ts:505): editor-selection polls. Await the reveal command’s completion/event.
- [design-audit.spec.ts:91](tools/vscode/e2e/specs/design-audit.spec.ts:91) and [design-audit.spec.ts:100](tools/vscode/e2e/specs/design-audit.spec.ts:100): fixed screenshot delays. Wait for an explicit rendered/settled marker.
- [smoke-examples.spec.ts:283](e2e/smoke-examples.spec.ts:283): custom stats polling loop. Have the example emit an app/stats-ready event.
- [smoke-examples.spec.ts:460](e2e/smoke-examples.spec.ts:460): canvas attachment is treated as time for later errors to surface. Emit an application-ready signal after first successful render.

### Unit/integration tests

- [bus-websocket.test.ts:171](packages/three-flatland/src/debug/bus-websocket.test.ts:171), plus lines 197, 205, 247, 282, and 342: fixed BroadcastChannel delays. Attach a one-shot message Promise before posting. Negative tests need an explicit bridge-drained/barrier Ack, not “nothing happened for 20 ms.”
- [NormalMapLoader.test.ts:49](packages/normals/src/NormalMapLoader.test.ts:49) and line 108: timer-scheduled mock callbacks. Invoke the callbacks directly or control them with deferred Promises.
- [audioFileResolver.test.ts:97](tools/vscode/extension/tools/audio/audioFileResolver.test.ts:97): `setTimeout(0)` flush used throughout. Make the resolver expose/return its in-flight search promise or resolve an injected deferred search.
- [memoizedLoader.test.ts:4](tools/vscode/extension/tools/audio/lm/memoizedLoader.test.ts:4): `tick()` delay. Use the already-established deferred load barrier.
- [core.test.ts:503](tools/vscode/extension/tools/audio/lm/core.test.ts:503): timer used to force a concurrent write race. Use two deferred barriers to schedule the exact interleaving.
- [commandHandler.test.ts:224](tools/audio-play/src/commandHandler.test.ts:224): `vi.waitFor` on async error. Have the fake backend expose a Promise resolved by the error callback.
- [activePlayback.test.ts:56](tools/vscode/extension/tools/audio/activePlayback.test.ts:56): real 10 ms sleep and polling watcher. Production [activePlayback.ts:70](tools/vscode/extension/tools/audio/activePlayback.ts:70) should subscribe to sidecar started/ended/stopped events instead.
- [audio-play client.test.ts:31](tools/audio-play/src/client.test.ts:31): repeated `vi.waitFor` process-start polling through lines 340+. Add and await a fixture-ready/initialize Ack.
- [audio-play client.test.ts:136](tools/audio-play/src/client.test.ts:136): real timeout/drop tests.
- [fakePlaySidecar.mjs:40](tools/audio-play/src/__fixtures__/fakePlaySidecar.mjs:40): real delayed-response fixture.
- [codelens client.test.ts:162](tools/codelens-service/src/client.test.ts:162) and [client.test.ts:233](tools/codelens-service/src/client.test.ts:233): real elapsed-time assertions. Inject the shutdown scheduler/clock and advance it deterministically.
- [relay.test.ts:129](packages/devtools/src/relay.test.ts:129) and line 142: custom timer-bounded event waits. Await frame/close events directly; let the test-runner ceiling report a missing signal.
- [registry.test.ts:87](packages/three-flatland/src/orchestration/registry.test.ts:87): GC test loops with delays and assumes WeakRef clearing timing. Delete it as an oracle; GC scheduling is deliberately nondeterministic. Keep structural WeakMap coverage.
- [batchSort.test.ts:367](packages/three-flatland/src/ecs/systems/batchSort.test.ts:367): unseeded `Math.random()` inputs. Replace with a fixed adversarial position/velocity table.
- [basisu-bench.test.ts:16](packages/image/src/basisu-bench.test.ts:16) and [transcode-bench.test.ts:109](packages/image/src/transcode-bench.test.ts:109): wall-clock performance assertions, merely disabled on CI after flaking. These are benchmarks, not tests; move them to a non-blocking benchmark lane.

Virtual-clock tests such as `contextLifecycle.test.ts` and the fake-timer retry-budget test are deterministic today; they do not wait on wall time. They are not flakes. However, the production cold-start retry itself at [toneColdStartRetry.ts:56](tools/vscode/extension/tools/audio/toneColdStartRetry.ts:56) should still be replaced with a Tone-engine-ready promise. “Try every 250/500/1000/2000 ms” is inferior to awaiting the import already in progress.

## Order and shared-state failures

- [playwright.config.ts:33](tools/vscode/e2e/playwright.config.ts:33): CI retry masks first-attempt failures. Set retries to zero.
- [fixtures.ts:675](tools/vscode/e2e/fixtures.ts:675): one worker-lifetime VS Code window.
- [fixtures.ts:698](tools/vscode/e2e/fixtures.ts:698): workspace files/config are reset, but process singletons, global storage, extension state, sidecars, and audio graphs survive.
- [audio-play.spec.ts:143](tools/vscode/e2e/specs/audio-play.spec.ts:143): explicitly depends on the prior test having shut down the sidecar.
- [zzfx.spec.ts:581](tools/vscode/e2e/specs/zzfx.spec.ts:581): tests are deliberately ordered last because global-storage history leaks across tests. That is confessed order dependence, not isolation.
- [fixtures.ts:666](tools/vscode/e2e/fixtures.ts:666): defaults to moving VS Code `"stable"`, so identical repository commits do not test against an identical editor.

Every test should either get a fresh user-data/global-storage state or call a deterministic reset API that clears every extension singleton and sidecar. No test should rely on filename order, prior shutdown, “LAST in file,” or incidental earlier playback.

The blunt recommendation: delete the warmup/oracle/recycle machinery, remove both retry layers, install one Electron-helper offline render gate, and make all sidecar and UI operations expose awaited completion signals. That is smaller, faster, and actually trustworthy.