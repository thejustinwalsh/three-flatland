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
// CLAUDE.md`). `offlineWadProbe.mjs` and `offlineToneProbe.mjs` close that
// gap the same way: render a real production play through a real
// `OfflineAudioContext` under the real `Code Helper (Plugin)` binary and
// print exactly one verdict line. `offline.startRendering()` resolving
// inside each probe IS the completion signal — no audio device, no
// PulseAudio, no analyser poll, no warmup, no timer here.
//
// The zzfx gate still catches the exact Electron-specific regression it
// was built for: a regression from `copyToChannel` back to
// `getChannelData().set()` in `playSampleChannels` writes into a detached
// copy under Electron's Node integration and renders pure zeros — verified
// directly against the real `Code Helper (Plugin)` binary (copyToChannel
// -> peak≈1, getChannelData -> peak=0).
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '../fixtures'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const HOST_BRIDGE_DIR = path.join(__dirname, '..', 'host-bridge')
const OFFLINE_RENDER_PROBE_PATH = path.join(HOST_BRIDGE_DIR, 'offlineRenderProbe.mjs')
const OFFLINE_WAD_PROBE_PATH = path.join(HOST_BRIDGE_DIR, 'offlineWadProbe.mjs')
const OFFLINE_TONE_PROBE_PATH = path.join(HOST_BRIDGE_DIR, 'offlineToneProbe.mjs')

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
    child.on('close', (code) => {
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

/** Parses a probe's `RENDER_OK peak=<n> energy=<n> frames=<n>` verdict
 * line — local test-runner code, not shipped over the wire, so ordinary
 * closures/sharing rules apply (unlike `runOfflineProbe` above). */
function parseRenderOk(stdout: string): { peak: number; energy: number; frames: number } {
  const match = stdout.match(/RENDER_OK peak=([\d.]+) energy=([\d.]+) frames=(\d+)/)
  expect(match, `expected a parseable RENDER_OK line, got: ${stdout}`).not.toBeNull()
  return {
    peak: Number(match![1]),
    energy: Number(match![2]),
    frames: Number(match![3]),
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

    const { peak, energy, frames } = parseRenderOk(result.stdout)

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
  })

  test('playWadSynth (the real production Wad output path) renders a real, non-zero oscillator play under the real Code Helper (Plugin) binary', async ({
    evaluateInVSCode,
  }) => {
    const result = await evaluateInVSCode(runOfflineProbe, { probePath: OFFLINE_WAD_PROBE_PATH })

    expect(
      result.stdout,
      `offlineWadProbe.mjs must report RENDER_OK, not RENDER_SILENT — stderr: ${result.stderr}`
    ).toContain('RENDER_OK')

    const { peak, energy, frames } = parseRenderOk(result.stdout)

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
  })

  test('playToneSynth (the real production Tone output path) renders a real, non-zero synth play under the real Code Helper (Plugin) binary', async ({
    evaluateInVSCode,
  }) => {
    const result = await evaluateInVSCode(runOfflineProbe, { probePath: OFFLINE_TONE_PROBE_PATH })

    expect(
      result.stdout,
      `offlineToneProbe.mjs must report RENDER_OK, not RENDER_SILENT — stderr: ${result.stderr}`
    ).toContain('RENDER_OK')

    const { peak, energy, frames } = parseRenderOk(result.stdout)

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
  })
})
