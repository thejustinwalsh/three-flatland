// P0 audio-e2e determinism redesign (planning/testing/test-determinism-
// audit.md): the ONE deterministic audibility gate for the whole e2e
// suite. Every other audio spec used to prove "did this sound actually
// reach the output" by polling the real sidecar's live AnalyserNode via
// `getStats()` — nondeterministic (real OS audio device, PulseAudio on
// CI, warmup/cold-start races). This spec replaces all of that with a
// single, device-independent proof: it spawns
// `host-bridge/offlineRenderProbe.mjs` from *inside* a real running
// extension host — `child_process.spawn(process.execPath, …, { env: {
// ELECTRON_RUN_AS_NODE: '1' } })`, the exact mechanism fixtures.ts's
// (now-removed) `runOracle`/`warmUpAudioPipeline` used, and the exact
// mechanism the real audio-play sidecar itself is spawned with (see
// tools/audio-play/CLAUDE.md's "hard prototype gate").
//
// The probe renders the PRODUCTION `playSampleChannels` output path
// (tools/audio-play/src/player.ts) through a real `OfflineAudioContext`
// under the real `Code Helper (Plugin)` binary and prints exactly one
// verdict line. `offline.startRendering()` resolving inside the probe IS
// the completion signal — no audio device, no PulseAudio, no analyser
// poll, no warmup, no timer here. It still catches the exact
// Electron-specific regression this guard exists for: a regression from
// `copyToChannel` back to `getChannelData().set()` in `playSampleChannels`
// writes into a detached copy under Electron's Node integration and
// renders pure zeros — verified directly against the real `Code Helper
// (Plugin)` binary (copyToChannel -> peak≈1, getChannelData -> peak=0).
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '../fixtures'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OFFLINE_RENDER_PROBE_PATH = path.join(
  __dirname,
  '..',
  'host-bridge',
  'offlineRenderProbe.mjs'
)

test.describe('FL Audio: offline render audibility gate', () => {
  test('playSampleChannels (the real production output path) renders real, non-zero samples under the real Code Helper (Plugin) binary', async ({
    evaluateInVSCode,
  }) => {
    const result = await evaluateInVSCode(
      async (_vscode, arg: { probePath: string }) => {
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
          // The probe prints exactly one verdict line and does NOT call
          // process.exit() itself (removed — Node doesn't guarantee
          // pending stdout writes are flushed by process.exit()). Settle
          // on 'close', not 'exit': 'close' only fires after the child's
          // stdio streams are fully drained, so every 'data' event above
          // is guaranteed to have already landed by the time this runs —
          // 'exit' offers no such guarantee and can fire first. No
          // timeout/poll needed on this side: a genuine hang fails the
          // whole test via Playwright's own test timeout, which is the
          // correct place for that bound to live, not a test-authored
          // setTimeout race.
          child.on('close', (code) => {
            if (!/RENDER_OK|RENDER_SILENT/.test(stdout)) {
              reject(
                new Error(
                  `offlineRenderProbe.mjs produced no verdict line (exit=${code}): stdout=${stdout} stderr=${stderr}`
                )
              )
              return
            }
            resolve({ stdout, stderr })
          })
        })
      },
      { probePath: OFFLINE_RENDER_PROBE_PATH }
    )

    expect(
      result.stdout,
      `offlineRenderProbe.mjs must report RENDER_OK, not RENDER_SILENT — stderr: ${result.stderr}`
    ).toContain('RENDER_OK')

    const match = result.stdout.match(/RENDER_OK peak=([\d.]+) energy=([\d.]+) frames=(\d+)/)
    expect(match, `expected a parseable RENDER_OK line, got: ${result.stdout}`).not.toBeNull()
    const peak = Number(match![1])
    const energy = Number(match![2])
    const frames = Number(match![3])

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
})
