// P0 audio-e2e determinism redesign (planning/testing/test-determinism-
// audit.md): the deterministic audibility gate for the whole e2e suite.
// Every other audio spec used to prove "did this sound actually reach the
// output" by polling the real sidecar's live AnalyserNode via `getStats()`
// — nondeterministic (real OS audio device, PulseAudio on CI, warmup/
// cold-start races). This spec replaces all of that with a single family
// of device-independent proofs: it spawns each `host-bridge/offline*Probe.
// mjs` script from *inside* a real running extension host —
// `child_process.spawn(process.execPath, …, { env: { ELECTRON_RUN_AS_NODE:
// '1' } })`, the exact mechanism fixtures.ts's (now-removed) `runOracle`/
// `warmUpAudioPipeline` used, and the exact mechanism the real audio-play
// sidecar itself is spawned with (see tools/audio-play/CLAUDE.md's "hard
// prototype gate").
//
// `offlineRenderProbe.mjs` covers zzfx/zzfxm's `playSampleChannels` output
// path only (see that file's own header comment) — Wad and Tone have their
// own, separate output graphs in `tools/audio-play/src/player.ts`
// (`playWadSynth`/`playToneSynth`) with their own historically-real
// Electron/Node silent-bug classes (Wad's noise-buffer, Tone's
// AudioWorklet crash / `getConstant` trap — see `tools/audio-play/
// CLAUDE.md`). `offlineWadProbe.mjs`/`offlineWadNoiseProbe.mjs` and
// `offlineToneProbe.mjs`/`offlineTonePluckProbe.mjs` close that gap the
// same way: render a real production play through a real
// `OfflineAudioContext` under the real `Code Helper (Plugin)` binary and
// print exactly one verdict line. `offline.startRendering()` resolving
// inside each probe IS the completion signal — no audio device, no
// PulseAudio, no analyser poll, no warmup, no timer here.
//
// Every probe calls the REAL production initialization helpers
// (`tools/audio-play/src/wadLoader.ts`'s `loadWadConstructor`,
// `tools/audio-play/src/toneEngineLoader.ts`'s `setupToneEnvironment`/
// `loadToneEngine`) rather than reimplementing the constructor-adoption
// dance, the noise-buffer repair, or the `isSecureContext`/`self` shims by
// hand — differing from `sidecar.ts`'s own calls ONLY by which
// `AudioContext` gets passed in. This is what makes the noise (`source:
// 'noise'`) and PluckSynth (AudioWorklet) cases below real regression
// guards rather than decorative ones: each was verified, by temporarily
// reverting the corresponding production fix and rebuilding, to flip that
// ONE probe to `RENDER_SILENT`/a crash while its sibling (oscillator/plain
// Synth) stays green — see each test's own comment for the specific
// break-and-revert result.
//
// The zzfx gate still catches the exact Electron-specific regression it
// was built for: a regression from `copyToChannel` back to
// `getChannelData().set()` in `playSampleChannels` writes into a detached
// copy under Electron's Node integration and renders pure zeros — verified
// directly against the real `Code Helper (Plugin)` binary (copyToChannel
// -> peak≈1, getChannelData -> peak=0).
//
// Beyond peak/energy, every fixture's assertions also pin a zero-crossing
// count (`offlineRenderOracle.mjs`) — a wrong-frequency, phase-corrupted,
// or equal-energy-noise-burst render can share peak/energy with the
// correct one while crossing zero a completely different number of times.
// Every fixture here is deterministic (byte-stable across repeated runs) —
// including PluckSynth, whose Karplus-Strong excitation is randomized by
// Tone itself but pinned by seeding `Math.random` in the probe before
// `import('tone')` (`toneOfflineEnv.mjs`), so its bounds are a tight
// two-sided box like the others rather than a probabilistic floor.
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '../fixtures'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const HOST_BRIDGE_DIR = path.join(__dirname, '..', 'host-bridge')
const OFFLINE_RENDER_PROBE_PATH = path.join(HOST_BRIDGE_DIR, 'offlineRenderProbe.mjs')
const OFFLINE_WAD_PROBE_PATH = path.join(HOST_BRIDGE_DIR, 'offlineWadProbe.mjs')
const OFFLINE_WAD_NOISE_PROBE_PATH = path.join(HOST_BRIDGE_DIR, 'offlineWadNoiseProbe.mjs')
const OFFLINE_TONE_PROBE_PATH = path.join(HOST_BRIDGE_DIR, 'offlineToneProbe.mjs')
const OFFLINE_TONE_PLUCK_PROBE_PATH = path.join(HOST_BRIDGE_DIR, 'offlineTonePluckProbe.mjs')

/**
 * The function actually shipped over the wire to `evaluateInVSCode` — see
 * `fixtures.ts`'s doc comment: it's reconstructed from source text on the
 * other side, so it must not close over anything outside its own
 * `(vscode, arg)` parameters. It doesn't (only `arg.probePath` and a
 * dynamic `node:child_process` import), so the SAME function reference is
 * reused for all three probes below rather than duplicating this
 * boilerplate per probe.
 */
async function runOfflineProbe(
  _vscode: typeof import('vscode'),
  arg: { probePath: string }
): Promise<{ stdout: string; stderr: string }> {
  const cp = await import('node:child_process')
  return await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = cp.spawn(process.execPath, [arg.probePath], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d: Buffer) => {
      stdout += String(d)
    })
    child.stderr.on('data', (d: Buffer) => {
      stderr += String(d)
    })
    child.on('error', (err) => reject(err))
    // Each probe prints exactly one verdict line and does NOT call
    // process.exit() itself (Node doesn't guarantee pending stdout writes
    // are flushed by process.exit()). Settle on 'close', not 'exit':
    // 'close' only fires after the child's stdio streams are fully
    // drained, so every 'data' event above is guaranteed to have already
    // landed by the time this runs — 'exit' offers no such guarantee and
    // can fire first. No timeout/poll needed on this side: a genuine hang
    // fails the whole test via Playwright's own test timeout, which is the
    // correct place for that bound to live, not a test-authored setTimeout
    // race.
    child.on('close', (code, signal) => {
      // A verdict line alone is not enough: a probe that prints RENDER_OK
      // and THEN throws during teardown (e.g. the eager-context dispose or
      // an unhandled rejection after rendering) exits non-zero, and that
      // is a real failure the gate must not swallow. Require a clean exit
      // first, then a valid verdict.
      if (code !== 0) {
        reject(
          new Error(
            `probe exited unsuccessfully (exit=${code}, signal=${signal}): stdout=${stdout} stderr=${stderr}`
          )
        )
        return
      }
      if (!/RENDER_OK|RENDER_SILENT/.test(stdout)) {
        reject(
          new Error(
            `probe produced no verdict line (exit=${code}): stdout=${stdout} stderr=${stderr}`
          )
        )
        return
      }
      resolve({ stdout, stderr })
    })
  })
}

/** Parses a probe's `RENDER_OK peak=<n> energy=<n> frames=<n>
 * zeroCrossings=<n>` verdict line (`offlineRenderOracle.mjs`) — local
 * test-runner code, not shipped over the wire, so ordinary
 * closures/sharing rules apply (unlike `runOfflineProbe` above).
 * `zeroCrossings` is what lets the assertions below go beyond peak/energy
 * — see each test's comment for why that matters per fixture. */
function parseRenderOk(stdout: string): {
  peak: number
  energy: number
  frames: number
  zeroCrossings: number
} {
  const match = stdout.match(
    /RENDER_OK peak=([\d.]+) energy=([\d.]+) frames=(\d+) zeroCrossings=(\d+)/
  )
  expect(match, `expected a parseable RENDER_OK line, got: ${stdout}`).not.toBeNull()
  return {
    peak: Number(match![1]),
    energy: Number(match![2]),
    frames: Number(match![3]),
    zeroCrossings: Number(match![4]),
  }
}

test.describe('FL Audio: offline render audibility gate', () => {
  test('playSampleChannels (the real production output path) renders real, non-zero samples under the real Code Helper (Plugin) binary', async ({
    evaluateInVSCode,
  }) => {
    const result = await evaluateInVSCode(runOfflineProbe, { probePath: OFFLINE_RENDER_PROBE_PATH })

    expect(
      result.stdout,
      `offlineRenderProbe.mjs must report RENDER_OK, not RENDER_SILENT — stderr: ${result.stderr}`
    ).toContain('RENDER_OK')

    const { peak, energy, frames, zeroCrossings } = parseRenderOk(result.stdout)

    // The probe renders exactly sampleRate(44100) * 0.2s of frames — a
    // wrong count means the offline graph rendered the wrong buffer
    // length entirely (resampling, a miscomputed OfflineAudioContext
    // size), not just a wrong signal.
    expect(frames).toBe(8820)

    // The fixture is a pure 440Hz sine at amplitude 0.5 fed through
    // unity gain (masterVolume=1, no ramps/taper — playSampleChannels
    // applies a single static GainNode value and nothing else). Peak
    // must land tight around 0.5: `peak > 0` alone would also pass for a
    // DC offset, a wrong gain, or a mostly-corrupt render.
    expect(peak).toBeGreaterThanOrEqual(0.45)
    expect(peak).toBeLessThanOrEqual(0.55)

    // Energy (sum of squares) of a full-buffer amplitude-0.5 sine over
    // 8820 frames is 0.5^2/2 * 8820 ≈ 1102.5. A DC-offset render (peak
    // still ~0.5 but constant, energy ≈ 0.25 * 8820 = 2205) or a
    // mostly-zero/single-impulse render (peak could still pass, energy
    // near zero) would land far outside this window even though peak
    // alone would not catch it.
    expect(energy).toBeGreaterThanOrEqual(900)
    expect(energy).toBeLessThanOrEqual(1300)

    // 440Hz over the full 0.2s window crosses zero ≈ 2*440*0.2 = 176
    // times — empirically measured at 175 (byte-stable across repeated
    // runs). Peak and energy alone can't distinguish a 440Hz sine from,
    // say, a 220Hz sine at 2x amplitude-scaled-to-match-energy, or a
    // phase-shifted/frequency-doubled render with the same RMS — the
    // crossing count catches those: half the frequency ≈ half the
    // crossings at the same peak/energy profile.
    expect(zeroCrossings).toBeGreaterThanOrEqual(165)
    expect(zeroCrossings).toBeLessThanOrEqual(185)
  })

  test('playWadSynth (the real production Wad output path) renders a real, non-zero oscillator play under the real Code Helper (Plugin) binary', async ({
    evaluateInVSCode,
  }) => {
    const result = await evaluateInVSCode(runOfflineProbe, { probePath: OFFLINE_WAD_PROBE_PATH })

    expect(
      result.stdout,
      `offlineWadProbe.mjs must report RENDER_OK, not RENDER_SILENT — stderr: ${result.stderr}`
    ).toContain('RENDER_OK')

    const { peak, energy, frames, zeroCrossings } = parseRenderOk(result.stdout)

    // The probe renders exactly sampleRate(44100) * 0.3s of frames — see
    // offlineWadProbe.mjs's fixture; a wrong count means the offline
    // graph rendered the wrong buffer length entirely.
    expect(frames).toBe(13230)

    // The fixture is a 440Hz sine Wad oscillator at volume 1 through a
    // short deterministic envelope (attack 0/decay 0/hold 0.05/release
    // 0.01) — empirically measured, byte-stable across repeated runs
    // (Wad's envelope automation has no randomness). Tight bounds around
    // the measured peak/energy catch a DC offset, a wrong gain stage, or
    // a mostly-corrupt render the same way the zzfx gate's bounds do.
    expect(peak).toBeGreaterThanOrEqual(0.6)
    expect(peak).toBeLessThanOrEqual(0.8)
    expect(energy).toBeGreaterThanOrEqual(450)
    expect(energy).toBeLessThanOrEqual(750)

    // The audible window (hold 0.05s + release 0.01s ≈ 0.06s) of a 440Hz
    // sine crosses zero ≈ 2*440*0.06 ≈ 53 times — empirically measured at
    // 52 (byte-stable). This is what distinguishes a real 440Hz oscillator
    // from, e.g., a wrong-frequency oscillator or a corrupted envelope that
    // happens to land the same peak/energy — see `offlineWadNoiseProbe.mjs`
    // below for the sibling case where the crossing count is the ONLY
    // property this oracle has left to check a noise source with.
    expect(zeroCrossings).toBeGreaterThanOrEqual(45)
    expect(zeroCrossings).toBeLessThanOrEqual(60)
  })

  test('playWadSynth source:"noise" (the noise-buffer copyToChannel repair) renders real, non-zero noise under the real Code Helper (Plugin) binary', async ({
    evaluateInVSCode,
  }) => {
    // Regression guard for wadLoader.ts's `loadWadConstructor` noise-buffer
    // repair specifically (see that file's doc comment): `web-audio-daw`'s
    // own bundle pre-renders its shared noise buffer via
    // `getChannelData()`-then-write at IMPORT TIME — a detached copy under
    // `node-web-audio-api`/Electron, so without the repair every
    // `source:'noise'` Wad plays real silence while `source:'sine'` (the
    // sibling test above) is completely unaffected. Verified directly: with
    // the repair reverted, this probe renders RENDER_SILENT while the sine
    // probe still renders RENDER_OK.
    const result = await evaluateInVSCode(runOfflineProbe, {
      probePath: OFFLINE_WAD_NOISE_PROBE_PATH,
    })

    expect(
      result.stdout,
      `offlineWadNoiseProbe.mjs must report RENDER_OK, not RENDER_SILENT — stderr: ${result.stderr}`
    ).toContain('RENDER_OK')

    const { peak, energy, frames, zeroCrossings } = parseRenderOk(result.stdout)

    expect(frames).toBe(13230)

    // Same seeded-LCG noise algorithm Wad's own IIFE uses (seed 6,
    // `(seed * 9301 + 49297) % 233280`) through the same short envelope as
    // the sine fixture — no randomness, empirically measured and
    // byte-stable across repeated runs.
    expect(peak).toBeGreaterThanOrEqual(0.6)
    expect(peak).toBeLessThanOrEqual(0.8)
    expect(energy).toBeGreaterThanOrEqual(300)
    expect(energy).toBeLessThanOrEqual(500)

    // A wide-spectrum noise source crosses zero far more often than a pure
    // tone at the same peak/energy — empirically measured at 6651
    // (byte-stable). This is the load-bearing check for this fixture
    // specifically: peak/energy alone can't tell a real noise burst apart
    // from, say, a single scaled sine burst tuned to the same peak/energy —
    // the crossing count can (a sine at this window's peak/energy would
    // land in the sibling sine test's ~52 window, two orders of magnitude
    // below noise's).
    expect(zeroCrossings).toBeGreaterThanOrEqual(6000)
    expect(zeroCrossings).toBeLessThanOrEqual(7200)
  })

  test('playToneSynth (the real production Tone output path) renders a real, non-zero synth play under the real Code Helper (Plugin) binary', async ({
    evaluateInVSCode,
  }) => {
    const result = await evaluateInVSCode(runOfflineProbe, { probePath: OFFLINE_TONE_PROBE_PATH })

    expect(
      result.stdout,
      `offlineToneProbe.mjs must report RENDER_OK, not RENDER_SILENT — stderr: ${result.stderr}`
    ).toContain('RENDER_OK')

    const { peak, energy, frames, zeroCrossings } = parseRenderOk(result.stdout)

    // The probe renders exactly sampleRate(44100) * 0.3s of frames — see
    // offlineToneProbe.mjs's fixture; a wrong count means the offline
    // graph rendered the wrong buffer length entirely.
    expect(frames).toBe(13230)

    // The fixture is a `Tone.Synth` playing 'C4' for 0.1s with a 0.05s
    // release override, at masterVolume 1 — empirically measured,
    // byte-stable across repeated runs (Tone's envelope automation has no
    // randomness). Tight bounds around the measured peak/energy catch a
    // DC offset, a wrong gain stage, or a mostly-corrupt render the same
    // way the zzfx gate's bounds do.
    expect(peak).toBeGreaterThanOrEqual(0.85)
    expect(peak).toBeLessThanOrEqual(1.0)
    expect(energy).toBeGreaterThanOrEqual(250)
    expect(energy).toBeLessThanOrEqual(420)

    // C4 (≈261.63Hz) over the ≈0.15s audible window (0.1s note + 0.05s
    // release) crosses zero ≈ 2*261.63*0.15 ≈ 78 times — empirically
    // measured at 78 (byte-stable). Catches a wrong-note/wrong-frequency
    // regression that peak/energy alone would miss (Tone's envelope shape
    // is what drives peak/energy here, not the note frequency — a
    // different note at the same velocity would pass the peak/energy
    // bounds above but land far outside this crossing-count window).
    expect(zeroCrossings).toBeGreaterThanOrEqual(70)
    expect(zeroCrossings).toBeLessThanOrEqual(88)
  })

  test('playToneSynth PluckSynth (the AudioWorklet path + isSecureContext/self shims) renders real, non-zero, crash-free audio under the real Code Helper (Plugin) binary', async ({
    evaluateInVSCode,
  }) => {
    // Regression guard for `toneEngineLoader.ts`'s `setupToneEnvironment`
    // shims specifically. `PluckSynth` is the ONE allowlisted Tone class
    // whose construction routes through `ToneAudioWorklet` →
    // `standardized-audio-context`'s `AudioWorkletNode`, gated on
    // `window.isSecureContext`/`self` — the exact path that used to CRASH
    // THE ENTIRE SIDECAR PROCESS (an unhandled promise rejection, not a
    // clean Nack) before the shim fix, documented in
    // `tools/audio-play/CLAUDE.md`. `offlineToneProbe.mjs` above exercises
    // plain `Tone.Synth`, which never touches this path at all — a
    // regression that deleted the shims could stay green there. Verified
    // directly: with `setupToneEnvironment`'s `isSecureContext` line
    // reverted, THIS probe crashes (no verdict line at all, caught by
    // `runOfflineProbe`'s "probe produced no verdict line" rejection above)
    // while `offlineToneProbe.mjs` still renders RENDER_OK.
    const result = await evaluateInVSCode(runOfflineProbe, {
      probePath: OFFLINE_TONE_PLUCK_PROBE_PATH,
    })

    expect(
      result.stdout,
      `offlineTonePluckProbe.mjs must report RENDER_OK, not RENDER_SILENT — stderr: ${result.stderr}`
    ).toContain('RENDER_OK')

    const { peak, energy, frames, zeroCrossings } = parseRenderOk(result.stdout)

    expect(frames).toBe(22050)

    // PluckSynth's Karplus-Strong excitation (`Tone.Noise`'s noise buffer
    // + its `Math.random()`-chosen start offset) is the ONLY
    // nondeterministic input to the otherwise bit-deterministic
    // comb-filter DSP — and `offlineTonePluckProbe.mjs` now seeds
    // `Math.random` (mulberry32, `toneOfflineEnv.mjs`) before
    // `import('tone')`, so the render is reproducible run to run. Measured
    // seeded values under this binary: peak≈0.211, energy≈3.03,
    // zeroCrossings=3069 — byte-stable across repeated local runs. The
    // bounds below are TIGHT TWO-SIDED boxes around those (not a
    // probabilistic floor that could false-fail on an unlucky run): the
    // slack absorbs only cross-platform libm epsilon in the amplitude
    // envelope, nothing else. peak+energy carry the tight-oracle load; a
    // broken AudioWorklet path renders exact silence (peak≈0), a DC offset
    // renders zeroCrossings≈0, a plain-tone leak (envelope only, no comb
    // filter) renders zeroCrossings≈78 — all fall outside these boxes.
    expect(peak).toBeGreaterThanOrEqual(0.16)
    expect(peak).toBeLessThanOrEqual(0.27)
    expect(energy).toBeGreaterThanOrEqual(2.2)
    expect(energy).toBeLessThanOrEqual(4.0)
    // Two-sided (Codex finding): the floor rejects silence/DC (≈0) and a
    // plain-tone leak (≈78); the ceiling rejects raw unfiltered noise
    // (≈half the samples ≈ 11000). Wider slack than peak/energy because
    // near-zero tail crossings in the decay are the most FP-sensitive
    // metric cross-platform — still a real comb-filtered-pluck shape gate.
    expect(zeroCrossings).toBeGreaterThanOrEqual(1200)
    expect(zeroCrossings).toBeLessThanOrEqual(4500)
  })
})
