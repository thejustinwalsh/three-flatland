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
          // The probe prints exactly one verdict line and calls
          // process.exit(0) itself — the child's 'exit' event IS the
          // completion signal here, the same way offline.startRendering()
          // resolving is the completion signal inside the probe. No
          // timeout/poll needed on this side: a genuine hang fails the
          // whole test via Playwright's own test timeout, which is the
          // correct place for that bound to live, not a test-authored
          // setTimeout race.
          child.on('exit', (code) => {
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
    expect(Number(match![1])).toBeGreaterThan(0)
  })
})
