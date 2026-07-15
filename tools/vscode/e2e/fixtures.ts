import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron, test as base, expect } from '@playwright/test'
import type { ElectronApplication, FrameLocator, Page } from '@playwright/test'
import { downloadAndUnzipVSCode } from '@vscode/test-electron'
import { HostBridgeClient } from './host-bridge/client'

export { expect }

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const EXTENSION_ROOT = path.join(__dirname, '..')
const FIXTURE_WORKSPACE = path.join(__dirname, 'fixtures', 'workspace')
const RUNNER_PATH = path.join(__dirname, 'host-bridge', 'dist', 'runner.cjs')
const VSCODE_TEST_ROOT = path.join(EXTENSION_ROOT, '.vscode-test')

type CachedWindow = {
  app: ElectronApplication
  workbox: Page
  bridge: HostBridgeClient
  baseDir: string
  extensionsDir: string
  userDataDir: string
  /** Set when the warmup reached an ENVIRONMENTAL-deafness verdict (see
   * `warmUpAudioPipeline`): the OS audio device provably can't produce
   * sound for ANY code right now. Audio specs skip with this annotation
   * (via `skipIfAudioDeviceDeaf`); non-audio specs run regardless. */
  audioEnvDeaf?: string
}

type Fixtures = {
  baseDir: string
  electronApp: ElectronApplication
  workbox: Page
  /**
   * Evaluates `fn` inside the real extension host, with real `vscode` API
   * access — see `e2e/host-bridge/{runner,client}.ts`. `fn` is shipped as
   * source text and reconstructed on the other side of the wire, so it
   * must not close over anything outside its own `(vscode, arg)`
   * parameters.
   */
  evaluateInVSCode: <R, Arg = undefined>(
    fn: (vscodeModule: typeof import('vscode'), arg: Arg) => R | Promise<R>,
    arg?: Arg
  ) => Promise<R>
  /**
   * Runs a registered command through the real extension host — the same
   * `vscode.commands.executeCommand` path a command-palette selection or a
   * context-menu click resolves to. `relativeFsPaths` (workspace-relative)
   * are turned into real `vscode.Uri` instances *inside* the host, then
   * forwarded as `(clicked, allSelected)`, the call shape VS Code uses for
   * explorer multi-select commands (see
   * `extension/tools/{atlas,encode,merge}/register.ts`).
   */
  openCommand: (commandId: string, relativeFsPaths?: string[]) => Promise<void>
  /**
   * Waits for a panel's editor tab to be visible, then drills through VS
   * Code's double-iframe webview structure to the extension's own
   * document. Failing on a missing tab first gives a clear timeout instead
   * of silently resolving an unrelated iframe.
   */
  webviewFrame: (panelTitle: string | RegExp) => Promise<FrameLocator>
  /** Internal — see the comment on its implementation below. */
  _sharedWindow: CachedWindow
}

type WorkerFixtures = {
  vscodeInstallPath: string
  /** Internal — a worker-lifetime mutable box `_sharedWindow` reads/writes into. */
  _windowCache: { current?: CachedWindow }
}

async function launchWindow(vscodeInstallPath: string): Promise<CachedWindow> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fl-vscode-e2e-'))
  // realpath: macOS resolves os.tmpdir() through a /tmp -> /private/tmp
  // symlink. VS Code reports workspaceFolders[0].uri.fsPath through the
  // resolved path, so comparing against the un-resolved tmpDir would
  // fail the workspace-identity assertion every time, not flakily.
  const baseDir = await fs.realpath(tmpDir)
  await fs.cp(FIXTURE_WORKSPACE, baseDir, { recursive: true })

  const extensionsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fl-vscode-e2e-ext-'))
  const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fl-vscode-e2e-userdata-'))

  // Removing VSCODE_* env vars avoids a known failure mode where a nested
  // VS Code (this test running inside a VS Code integrated terminal, or a
  // prior run's leaked env) makes custom webviews fail to register their
  // service worker ("InvalidStateError: Failed to register a
  // ServiceWorker …").
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && !/^VSCODE_/i.test(key)) env[key] = value
  }
  // Shrink the audio sidecar's idle-release window for the WHOLE e2e
  // session (production default 45s): mid-suite gaps then exercise the
  // context reacquire path constantly, making it the well-worn default
  // path — the reacquire-as-default architecture's own point — with the
  // suite's audibility assertions as the oracle. Inherited extension
  // host → sidecar spawn env.
  env.FL_AUDIO_IDLE_RELEASE_MS = '5000'

  const app = await _electron.launch({
    executablePath: vscodeInstallPath,
    env,
    args: [
      // Same flag set @vscode/test-electron's own runTests() launcher
      // uses (see its lib/runTest.ts) — sandboxing and first-run dialogs
      // are the well-known ways Electron-under-automation hangs or
      // crashes.
      '--no-sandbox',
      '--disable-gpu-sandbox',
      '--disable-updates',
      '--skip-welcome',
      '--skip-release-notes',
      '--disable-workspace-trust',
      `--extensions-dir=${extensionsDir}`,
      `--user-data-dir=${userDataDir}`,
      `--extensionDevelopmentPath=${EXTENSION_ROOT}`,
      `--extensionTestsPath=${RUNNER_PATH}`,
      baseDir,
    ],
  })

  const workbox = await app.firstWindow()
  // Attached immediately once the process exists, before any other setup
  // — extension host activation (and so the bridge starting) reliably
  // takes longer than that, but a listener attached any later risks
  // missing already-flushed output.
  const bridge = await HostBridgeClient.connect(app.process())

  const warmup = await warmUpAudioPipeline(bridge)
  if (warmup.ok && warmup.recovered) {
    // Honest green — audio IS verified — but the episode is worth eyes.
    console.warn(`\n[e2e warmup] ${warmup.recovered}\n`)
  }
  if (!warmup.ok) {
    // Environmental verdict — the device provably can't produce sound for
    // ANY code right now (see the oracle in warmUpAudioPipeline). Local
    // default: skip audio specs loudly. CI (and release-gate runs) set
    // FL_E2E_REQUIRE_AUDIO=1 so unverified audio HARD-FAILS there — CI's
    // null sink should always work, and a deaf oracle there is a real
    // problem (this is what makes "CI is the backstop against substrate
    // regressions" literally true rather than aspirational).
    if (process.env.FL_E2E_REQUIRE_AUDIO === '1') {
      throw new Error(
        `[e2e warmup] FL_E2E_REQUIRE_AUDIO=1 and audio is unverified — ${warmup.annotation}`
      )
    }
    console.error(`\n[e2e warmup] AUDIO SPECS WILL BE SKIPPED — ${warmup.annotation}\n`)
  }

  return {
    app,
    workbox,
    bridge,
    baseDir,
    extensionsDir,
    userDataDir,
    ...(warmup.ok ? {} : { audioEnvDeaf: warmup.annotation }),
  }
}

/**
 * Call from an audio spec's `test.beforeEach(({ _sharedWindow }) => ...)`
 * — skips the test (loudly, with the environmental evidence as the
 * annotation) when the warmup's oracle proved the OS audio device deaf.
 * A skip here is NEVER a pass: the suite summary shows every skipped
 * audio test with the reason, and if this annotation appears on a change
 * touching node-web-audio-api, the lockfile, or sidecar spawn plumbing,
 * treat it as a failure (CI, which runs FL_E2E_REQUIRE_AUDIO=1, will).
 */
export function skipIfAudioDeviceDeaf(win: CachedWindow): void {
  test.skip(!!win.audioEnvDeaf, win.audioEnvDeaf)
}

/**
 * Plays one real sound and waits (generously) for it to become audible,
 * once, before any real test runs. `getSidecarClient` spawns the shared
 * audio-play sidecar (native module load + real `AudioContext` + ALSA's
 * `pulse` plugin connecting to the CI null sink) lazily, on the FIRST
 * play command of the whole worker session — not eagerly during
 * extension activation. Observed pattern in CI: the first ~4 real-audio
 * e2e tests in the shared window (see `_sharedWindow` above) fail on
 * `stats.silent`/`stats.peak` while every test after them, including a
 * longer one, passes reliably across repeated runs — a cold-start/warm-up
 * race on that lazy first spawn, not persistent PulseAudio/ALSA
 * unreliability (see `tools/audio-play/CLAUDE.md`'s "Common pitfalls").
 * Paying that cold-start tax here, once, with a much larger budget than
 * any single test's own timeout affords, means real tests start from an
 * already-warm pipeline instead of racing it individually. Not called
 * on `resetWindowWorkspace`'s path — only the very first launch pays this.
 */
type WarmupVerdict = { ok: true; recovered?: string } | { ok: false; annotation: string }

async function warmUpAudioPipeline(bridge: HostBridgeClient): Promise<WarmupVerdict> {
  return bridge.evaluate(
    async (vscode, arg: { deviceProbePath: string }) => {
      // A Date.now()-deadline check BETWEEN loop iterations does not bound
      // a single stuck `await` — if one underlying vscode API call never
      // settles, execution never returns to re-check the deadline. Race
      // every individual call against its own timeout instead, so a genuine
      // hang fails fast with a labeled cause instead of exhausting the
      // whole test's timeout with no diagnostic.
      const withTimeout = <T>(promise: PromiseLike<T>, ms: number, label: string): Promise<T> =>
        Promise.race([
          promise,
          new Promise<T>((_resolve, reject) => {
            setTimeout(() => reject(new Error(`[e2e warmup] "${label}" exceeded ${ms}ms`)), ms)
          }),
        ])

      // Phase-timing trace, embedded in any warmup failure so a flake names
      // the phase that ate the budget instead of just "never audible in 45s".
      // Consecutive identical entries coalesce ("silent x12") to stay short.
      const t0 = Date.now()
      const trace: string[] = []
      let traceRepeats = 0
      // Set by the boundary-recovery re-probe (phase 2) — the run proceeds
      // normally, but the deaf episode is surfaced in the harness output.
      let recoveredNote: string | undefined
      const mark = (entry: string): void => {
        const last = trace[trace.length - 1]
        if (last?.endsWith(` ${entry}`) || (traceRepeats > 0 && last?.includes(` ${entry} x`))) {
          traceRepeats += 1
          trace[trace.length - 1] = `${last.replace(/ x\d+$/, '')} x${traceRepeats + 1}`
          return
        }
        traceRepeats = 0
        trace.push(`+${((Date.now() - t0) / 1000).toFixed(1)}s ${entry}`)
      }

      const ext = vscode.extensions.all.find((e) => e.packageJSON.name === '@three-flatland/vscode')
      if (ext && !ext.isActive) await withTimeout(ext.activate(), 20_000, 'extension activate()')
      mark('activated')
      const api = ext!.exports as {
        zzfxPlay: {
          getStats: () => Promise<
            { silent: boolean; playing: boolean; contextState: string } | undefined
          >
          shutdown: () => Promise<void>
        }
      }

      const [folder] = vscode.workspace.workspaceFolders ?? []
      const uri = vscode.Uri.joinPath(folder!.uri, 'src/audio-sources.ts')
      const doc = await withTimeout(
        vscode.workspace.openTextDocument(uri),
        10_000,
        'openTextDocument'
      )
      await withTimeout(vscode.window.showTextDocument(doc), 10_000, 'showTextDocument')

      // CodeLenses can take a beat to resolve right after activation —
      // poll for the provider to actually report one, not just a single
      // immediate query.
      const lensDeadline = Date.now() + 15_000
      let playCommand: { command: string; arguments?: unknown[] } | undefined
      while (Date.now() < lensDeadline && !playCommand) {
        const lenses = (await withTimeout(
          vscode.commands.executeCommand('vscode.executeCodeLensProvider', uri, 100),
          5_000,
          'executeCodeLensProvider'
        )) as Array<{ command?: { command: string; arguments?: unknown[]; title?: string } }>
        playCommand = lenses.find((l) => l.command?.title === '▶ Play')?.command
        if (!playCommand) await new Promise((resolve) => setTimeout(resolve, 150))
      }
      mark(playCommand ? `lens found (${playCommand.command})` : 'NO ▶ Play lens within 15s')

      if (playCommand) {
        // getStats() round-trips through the audio-play sidecar's own IPC —
        // on a cold spawn that process has to load a native module and
        // construct a real AudioContext through cpal/ALSA/PulseAudio before
        // it even reads its first stdin message (see audio-play/CLAUDE.md's
        // "hard prototype gate"). That first round-trip can legitimately
        // take several seconds — and PlaySidecarClient.getStats() bounds it
        // itself (rejects after 10s instead of hanging forever, see
        // client.ts's waitForResponse), so no outer withTimeout here. A
        // rejected attempt means "not audible YET", not "warmup failed" —
        // record it and keep polling until the overall deadline; every
        // later call in the real test suite reuses the same already-warm
        // sidecar and is fast, so this generous budget is paid exactly once.
        //
        // RE-PLAY about once a second rather than playing once up front: the
        // fixture's first ▶ Play is a ~0.5s one-shot, so a single play gives
        // the analyser well under a second of nonzero signal — one slow
        // first round trip on a cold, loaded launch is enough to miss that
        // window entirely, after which no amount of further polling can ever
        // succeed because nothing is playing anymore (observed: a real
        // "never audible within 45s" flake with an otherwise-healthy
        // sidecar). Re-playing keeps a live window open for the whole
        // budget, and — because the play route goes through
        // getPlaySidecarClient() — also respawns the sidecar if it crashed.
        const audibleDeadline = Date.now() + 45_000
        let becameAudible = false
        let lastPlayAt = 0
        // Start of the current uninterrupted streak of CLEAN silent stats
        // responses (0 = no streak). Rejections/undefined break the streak —
        // deafness is specifically "protocol healthy, output dead".
        let cleanSilentSince = 0
        // Evidence counters for the environmental-deafness verdict below.
        // `undefined` stats are NOT a disqualifier — the manager legitimately
        // reports undefined between a recycle and the next play's respawn.
        let statsRejections = 0
        let nonRunningCtxPolls = 0
        let playFailures = 0
        let recycles = 0
        while (Date.now() < audibleDeadline) {
          if (Date.now() - lastPlayAt > 1_000) {
            lastPlayAt = Date.now()
            try {
              await withTimeout(
                vscode.commands.executeCommand(
                  playCommand.command,
                  ...(playCommand.arguments ?? [])
                ),
                15_000,
                'executeCommand(play)'
              )
              mark('play')
            } catch (err) {
              playFailures += 1
              mark(`play FAILED: ${err instanceof Error ? err.message : String(err)}`)
            }
          }
          try {
            const stats = await api.zzfxPlay.getStats()
            if (stats && !stats.silent) {
              becameAudible = true
              mark('AUDIBLE')
              break
            }
            mark(
              stats
                ? `silent(playing=${stats.playing},ctx=${stats.contextState})`
                : 'stats undefined (no sidecar client)'
            )
            if (stats && stats.contextState !== 'running' && stats.contextState !== 'closed') {
              nonRunningCtxPolls += 1
            }
            if (!stats) cleanSilentSince = 0
            else if (cleanSilentSince === 0) cleanSilentSince = Date.now()
          } catch (err) {
            statsRejections += 1
            cleanSilentSince = 0
            mark(`stats rejected: ${err instanceof Error ? err.message : String(err)}`)
          }
          // Alive-but-DEAF sidecar: plays executing cleanly, stats round
          // trips fast and healthy, yet the analyser reads silence across
          // many consecutive ~0.5s one-shots — the AudioContext's output
          // stream never started rendering (observed for real: a full 45s
          // of clean plays + clean silent stats, ~1-in-8 spawns on macOS;
          // most likely a cpal/CoreAudio stream-init race). No amount of
          // playing or waiting fixes a deaf context — only a fresh process
          // does. Recycle the sidecar; the next re-play respawns it via
          // getPlaySidecarClient(). The 8s threshold is ~8 clean plays'
          // worth of proof — far beyond any legitimate warm-up delay.
          if (cleanSilentSince !== 0 && Date.now() - cleanSilentSince > 8_000) {
            cleanSilentSince = 0
            try {
              await withTimeout(api.zzfxPlay.shutdown(), 10_000, 'recycle shutdown()')
              recycles += 1
              mark('RECYCLED deaf sidecar')
            } catch (err) {
              mark(`recycle FAILED: ${err instanceof Error ? err.message : String(err)}`)
            }
          }
          await new Promise((resolve) => setTimeout(resolve, 150))
        }
        if (!becameAudible) {
          // ENVIRONMENTAL-DEAFNESS VERDICT. "All spawns deaf" alone cannot
          // distinguish a transiently dead OS audio device (observed for
          // real: ctx=running throughout, every fresh-spawn recycle also
          // deaf, self-recovered minutes later) from a code regression that
          // makes fresh contexts silent — so the verdict has two gates:
          //
          // 1. The ENV SIGNATURE: protocol perfectly healthy (zero stats
          //    rejections, zero play failures, no abnormal context states)
          //    and ≥3 recycles proving fresh sidecar processes are deaf
          //    too. ANY other failure shape is a code/infra signature and
          //    hard-fails with the full trace, exactly as before.
          // 2. The ORACLE: deviceProbe.mjs — zero application code, just
          //    the same pinned node-web-audio-api making its own context +
          //    sine + analyser read — spawned from THIS extension host
          //    (same spawn context / audio session as the real sidecar; a
          //    terminal-context probe stays audible during episodes that
          //    deafen the host's children). If even the oracle is deaf,
          //    no code can make this device produce sound: environmental.
          //    Oracle crash = infra — hard fail. Oracle wedged past its
          //    bound = environmental flavor.
          //
          // 3. An AUDIBLE oracle does NOT immediately mean regression —
          //    conditioned on reaching this point (45s of a live env
          //    episode, recovery timescale of minutes), the device having
          //    JUST recovered at the phase boundary is likely, not rare
          //    (observed on the very first confirming run). "Our stack on
          //    a deaf device vs the oracle on a recovered device" is an
          //    invalid comparison. So: RE-PROBE OUR OWN STACK against the
          //    now-healthy device — recycle first (a deaf-born context
          //    claims 'running', so an existing sidecar never self-heals,
          //    and our own re-plays keep resetting the idle timer that
          //    would otherwise release it), then play through a genuinely
          //    fresh spawn for up to 10s. Audible → the episode was
          //    transient and our stack works: proceed (honest green, warn
          //    banner). Still silent → run the oracle ONCE more to
          //    bracket: audible at both ends of the silent re-probe →
          //    the device stayed healthy while our fresh spawn made no
          //    sound → REAL regression, hard fail with contemporaneous
          //    evidence. Oracle#2 deaf → the device flapped mid-verdict →
          //    environmental (CI's FL_E2E_REQUIRE_AUDIO + stable null
          //    sink is the backstop for a code bug hiding under a flap).
          const failHard = (headline: string): never => {
            throw new Error(`[e2e warmup] ${headline}\n[e2e warmup] trace: ${trace.join(' | ')}`)
          }

          const envSignature =
            recycles >= 3 && statsRejections === 0 && playFailures === 0 && nonRunningCtxPolls === 0
          if (!envSignature) {
            failHard(
              'audio pipeline never reported audible playback within 45s, and the failure shape ' +
                `is NOT environmental deafness (recycles=${recycles}, statsRejections=${statsRejections}, ` +
                `playFailures=${playFailures}, nonRunningCtxPolls=${nonRunningCtxPolls}) — ` +
                'see tools/audio-play/CLAUDE.md "Common pitfalls".'
            )
          }

          const cp = await import('node:child_process')
          const runOracle = (): Promise<{ kind: string; detail: string }> =>
            new Promise((resolve) => {
              const child = cp.spawn(process.execPath, [arg.deviceProbePath], {
                env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
                stdio: ['ignore', 'pipe', 'pipe'],
              })
              let out = ''
              let errTail = ''
              child.stdout.on('data', (d: Buffer) => {
                out += String(d)
              })
              child.stderr.on('data', (d: Buffer) => {
                errTail = (errTail + String(d)).slice(-400)
              })
              const timer = setTimeout(() => {
                child.kill('SIGKILL')
                resolve({ kind: 'wedged', detail: 'no verdict within 5000ms' })
              }, 5_000)
              child.on('error', (err) => {
                clearTimeout(timer)
                resolve({ kind: 'crashed', detail: err.message })
              })
              child.on('exit', (code) => {
                clearTimeout(timer)
                if (out.includes('ORACLE_AUDIBLE')) resolve({ kind: 'audible', detail: out.trim() })
                else if (out.includes('ORACLE_DEAF')) resolve({ kind: 'deaf', detail: out.trim() })
                else resolve({ kind: 'crashed', detail: `exit=${code} stderr=${errTail}` })
              })
            })

          const oracle = await runOracle()
          mark(`oracle: ${oracle.kind} (${oracle.detail})`)

          if (oracle.kind === 'crashed') {
            failHard(
              `the device-oracle probe itself broke (${oracle.detail}) — infra, not environment.`
            )
          }

          if (oracle.kind === 'audible') {
            // Boundary-recovery re-probe (design point 3 above): recycle
            // to force a genuinely fresh sidecar + context, then play our
            // REAL path against the device the oracle just proved healthy.
            try {
              await withTimeout(api.zzfxPlay.shutdown(), 10_000, 're-probe recycle shutdown()')
              mark('RECYCLED for re-probe')
            } catch (err) {
              failHard(
                `oracle audible but the re-probe recycle failed (${err instanceof Error ? err.message : String(err)}) — cannot validate the verdict.`
              )
            }
            const reprobeDeadline = Date.now() + 10_000
            let reprobeAudible = false
            let reprobeLastPlayAt = 0
            while (Date.now() < reprobeDeadline) {
              if (Date.now() - reprobeLastPlayAt > 1_000) {
                reprobeLastPlayAt = Date.now()
                try {
                  await withTimeout(
                    vscode.commands.executeCommand(
                      playCommand.command,
                      ...(playCommand.arguments ?? [])
                    ),
                    15_000,
                    'executeCommand(re-probe play)'
                  )
                  mark('re-probe play')
                } catch (err) {
                  mark(`re-probe play FAILED: ${err instanceof Error ? err.message : String(err)}`)
                }
              }
              const stats = await api.zzfxPlay.getStats().catch(() => undefined)
              if (stats && !stats.silent) {
                reprobeAudible = true
                mark('RE-PROBE AUDIBLE')
                break
              }
              await new Promise((resolve) => setTimeout(resolve, 150))
            }

            if (reprobeAudible) {
              // The episode was transient and ended at the phase boundary;
              // our stack works on the recovered device and the pipeline is
              // warm. Honest green — flow into the normal success tail.
              becameAudible = true
              recoveredNote =
                `recovered from a ~45s environmental deaf episode (${recycles} fresh-sidecar ` +
                'recycles during it); our stack is audible on the recovered device — proceeding'
            } else {
              const oracle2 = await runOracle()
              mark(`oracle#2: ${oracle2.kind} (${oracle2.detail})`)
              if (oracle2.kind === 'audible') {
                failHard(
                  'DEVICE HEALTHY, APPLICATION STACK SILENT — the oracle was audible before AND ' +
                    'after a 10s fresh-spawn re-probe of our real play path that stayed silent ' +
                    `(${oracle.detail} / ${oracle2.detail}). Bracketed, contemporaneous evidence: ` +
                    'this is a regression, not environment.'
                )
              }
              if (oracle2.kind === 'crashed') {
                failHard(`oracle#2 crashed (${oracle2.detail}) — infra, not environment.`)
              }
              return {
                ok: false as const,
                annotation:
                  'environmental: audio device FLAPPING (deaf through 45s of warmup → oracle ' +
                  `audible → 10s fresh-spawn re-probe silent → oracle ${oracle2.kind}). Not ` +
                  'attributable to code — if this appears on a change touching ' +
                  'node-web-audio-api, the lockfile, or sidecar spawn plumbing, treat it as a failure.',
              }
            }
          }

          if (!becameAudible) {
            // deaf or wedged → environmental.
            return {
              ok: false as const,
              annotation:
                `environmental: audio device deaf (${recycles} fresh-sidecar recycles all deaf, ` +
                `ctx=running throughout, oracle probe ${oracle.kind === 'deaf' ? 'silent' : 'wedged'}). ` +
                'Not a code regression — if this appears on a change touching node-web-audio-api, ' +
                'the lockfile, or sidecar spawn plumbing, treat it as a failure.',
            }
          }
        }
      }

      await withTimeout(
        vscode.commands.executeCommand('workbench.action.closeAllEditors'),
        10_000,
        'closeAllEditors'
      )
      return { ok: true as const, ...(recoveredNote ? { recovered: recoveredNote } : {}) }
    },
    { deviceProbePath: path.join(__dirname, 'host-bridge', 'deviceProbe.mjs') }
  )
}

async function teardownWindow(win: CachedWindow | undefined): Promise<void> {
  if (!win) return
  win.bridge.close()
  // The extension's deactivate() awaits its sidecar shutdowns, so a clean
  // app.close() is expected. Defense-in-depth regardless: never let a
  // misbehaving shutdown hang the whole run (a real teardown hang once ran
  // 80+ minutes at 0% CPU with orphaned sidecars). Bound the graceful
  // close, then force-kill the process unconditionally — the window is
  // being discarded, so a SIGKILL after the grace window costs nothing.
  await Promise.race([win.app.close(), new Promise((resolve) => setTimeout(resolve, 5000))])
  try {
    win.app.process().kill('SIGKILL')
  } catch {
    // already exited — nothing to kill
  }
  await Promise.all([
    fs.rm(win.baseDir, { recursive: true, force: true }),
    fs.rm(win.extensionsDir, { recursive: true, force: true }),
    fs.rm(win.userDataDir, { recursive: true, force: true }),
  ])
}

/**
 * Restores isolation for the one long-lived window between every pair of
 * tests — including across spec-file boundaries, which used to be a full
 * teardown + relaunch:
 *
 * 1. Closes every open editor/webview tab, so a stale panel from the
 *    previous test can't satisfy this test's `webviewFrame` lookup.
 * 2. Clears every workspace-level override of this extension's own
 *    configuration keys (read off `packageJSON.contributes.configuration`)
 *    through the real config API. The file recopy in step 3 also restores
 *    `.vscode/settings.json` on disk, but that pickup rides VS Code's file
 *    watcher — asynchronous, no completion signal — while an awaited
 *    `update(key, undefined, Workspace)` is deterministic, and it fires the
 *    same `onDidChangeConfiguration` path the tool registry re-registers
 *    disposed tools from (a failed settings spec can't strand a tool
 *    disabled for every spec after it).
 * 3. Wipes + recopies `baseDir` back to the pristine fixture workspace, so
 *    a previous test's sidecar/encode/merge output can't leak forward.
 *
 * Not called after a fresh `launchWindow` — there's nothing to reset yet.
 */
async function resetWindowWorkspace(win: CachedWindow): Promise<void> {
  await win.bridge.evaluate(async (vscode) => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors')

    const ext = vscode.extensions.all.find((e) => e.packageJSON.name === '@three-flatland/vscode')
    const contributed = ext?.packageJSON?.contributes?.configuration?.properties ?? {}
    const config = vscode.workspace.getConfiguration()
    for (const key of Object.keys(contributed)) {
      if (config.inspect(key)?.workspaceValue !== undefined) {
        await config.update(key, undefined, vscode.ConfigurationTarget.Workspace)
      }
    }
  })
  await fs.rm(win.baseDir, { recursive: true, force: true })
  await fs.mkdir(win.baseDir, { recursive: true })
  await fs.cp(FIXTURE_WORKSPACE, win.baseDir, { recursive: true })
}

export const test = base.extend<Fixtures, WorkerFixtures>({
  // One VS Code download/install per worker — re-downloading per test
  // would dominate the run time for no isolation benefit (the install
  // itself is never mutated by a test; only the workspace folder is).
  vscodeInstallPath: [
    async ({}, use) => {
      const installPath = await downloadAndUnzipVSCode({
        cachePath: VSCODE_TEST_ROOT,
        version: process.env.VSCODE_E2E_VERSION ?? 'stable',
      })
      await use(installPath)
    },
    { scope: 'worker' },
  ],

  // Worker-lifetime box holding the one long-lived window. Its teardown
  // (after `use`) runs once, when the worker itself shuts down — i.e.
  // after the very last test of the very last file this worker ran — and
  // closes whatever's in the box. That's the ONLY teardown: `_sharedWindow`
  // below never closes a window mid-run, it resets the existing one.
  _windowCache: [
    async ({}, use) => {
      const state: { current?: CachedWindow } = {}
      await use(state)
      await teardownWindow(state.current)
    },
    { scope: 'worker' },
  ],

  // One real VS Code window per *worker* — launched for the first test,
  // reused (reset, never relaunched) by every test after it, across spec
  // file boundaries included. Beyond killing the per-file Electron cold
  // starts (and the macOS window flashing they cause when running without
  // xvfb), this matches how the tools are actually used: a real user opens
  // the editor once and swaps between tools in a single session, so
  // panels, sidecars, and settings from one tool genuinely coexist with
  // the next tool's — coverage the relaunch-per-file model never had.
  // Isolation between tests comes from `resetWindowWorkspace` instead.
  _sharedWindow: async ({ vscodeInstallPath, _windowCache }, use, testInfo) => {
    if (_windowCache.current) {
      await resetWindowWorkspace(_windowCache.current)
    } else {
      // First launch of the worker pays the one-time audio warmup cost
      // (up to ~40s worst case, see warmUpAudioPipeline) on TOP of the
      // normal Electron + extension-host launch — comfortably exceeds
      // the per-test 60s budget on its own. Extend just this one test's
      // timeout rather than inflating every test's timeout globally, or
      // shrinking the warmup budget back down to the size that was
      // already proven too tight in CI.
      testInfo.setTimeout(testInfo.timeout + 150_000)
      _windowCache.current = await launchWindow(vscodeInstallPath)
    }
    await use(_windowCache.current)
  },

  baseDir: async ({ _sharedWindow }, use) => {
    await use(_sharedWindow.baseDir)
  },

  electronApp: async ({ _sharedWindow }, use) => {
    await use(_sharedWindow.app)
  },

  workbox: async ({ _sharedWindow }, use) => {
    await use(_sharedWindow.workbox)
  },

  evaluateInVSCode: async ({ _sharedWindow }, use) => {
    await use((fn, arg) => _sharedWindow.bridge.evaluate(fn, arg))
  },

  openCommand: async ({ evaluateInVSCode }, use) => {
    await use(async (commandId, relativeFsPaths) => {
      await evaluateInVSCode(
        async (vscode, args) => {
          const [folder] = vscode.workspace.workspaceFolders ?? []
          if (!folder || args.relativeFsPaths.length === 0) {
            await vscode.commands.executeCommand(args.commandId)
            return
          }
          const uris = args.relativeFsPaths.map((p) => vscode.Uri.joinPath(folder.uri, p))
          await vscode.commands.executeCommand(args.commandId, uris[0], uris)
        },
        { commandId, relativeFsPaths: relativeFsPaths ?? [] }
      )
    })
  },

  webviewFrame: async ({ workbox }, use) => {
    await use(async (panelTitle) => {
      const tab = workbox.getByRole('tab', { name: panelTitle })
      await tab.waitFor({ state: 'visible' })
      // Outer host iframe: className = `webview ${customClasses}`, gains
      // the `ready` class once its service-worker page has booted
      // (vscode src/vs/workbench/contrib/webview/browser/webviewElement.ts
      // WebviewElement.{_createElement,did-load handler}). `.last()` is
      // defensive against a still-disposing previous panel's iframe.
      const outer = workbox.frameLocator('iframe.webview.ready').last()
      // Inner content iframe: id="active-frame" once loaded — this is the
      // extension's actual document, e.g. our Vite-built React app
      // (vscode src/vs/workbench/contrib/webview/browser/pre/index.html).
      const inner = outer.frameLocator('#active-frame')
      await inner.locator('#root').waitFor({ state: 'attached' })
      return inner
    })
  },
})
