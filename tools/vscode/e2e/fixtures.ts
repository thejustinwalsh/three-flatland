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

  await warmUpAudioPipeline(bridge)

  return { app, workbox, bridge, baseDir, extensionsDir, userDataDir }
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
async function warmUpAudioPipeline(bridge: HostBridgeClient): Promise<void> {
  await bridge.evaluate(async (vscode) => {
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
      while (Date.now() < audibleDeadline) {
        if (Date.now() - lastPlayAt > 1_000) {
          lastPlayAt = Date.now()
          try {
            await withTimeout(
              vscode.commands.executeCommand(playCommand.command, ...(playCommand.arguments ?? [])),
              15_000,
              'executeCommand(play)'
            )
            mark('play')
          } catch (err) {
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
          if (!stats) cleanSilentSince = 0
          else if (cleanSilentSince === 0) cleanSilentSince = Date.now()
        } catch (err) {
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
            mark('RECYCLED deaf sidecar')
          } catch (err) {
            mark(`recycle FAILED: ${err instanceof Error ? err.message : String(err)}`)
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 150))
      }
      if (!becameAudible) {
        // Fail loudly at setup time with a clear cause — and the full
        // phase trace — rather than silently letting the first real test
        // eat this as a mysterious stats.silent failure.
        throw new Error(
          '[e2e warmup] audio pipeline never reported audible playback within 45s — ' +
            'the sidecar/audio-device chain is likely broken in this environment, ' +
            'not a per-test race (see tools/audio-play/CLAUDE.md "Common pitfalls").\n' +
            `[e2e warmup] trace: ${trace.join(' | ')}`
        )
      }
    }

    await withTimeout(
      vscode.commands.executeCommand('workbench.action.closeAllEditors'),
      10_000,
      'closeAllEditors'
    )
  })
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
