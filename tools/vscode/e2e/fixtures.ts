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

  return { app, workbox, bridge, baseDir, extensionsDir, userDataDir }
}

async function teardownWindow(win: CachedWindow | undefined): Promise<void> {
  if (!win) return
  win.bridge.close()
  await win.app.close()
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
  _sharedWindow: async ({ vscodeInstallPath, _windowCache }, use) => {
    if (_windowCache.current) {
      await resetWindowWorkspace(_windowCache.current)
    } else {
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
