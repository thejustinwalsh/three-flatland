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
}

type WorkerFixtures = {
  vscodeInstallPath: string
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

  // Fresh copy of the fixture workspace for every test — tests mutate
  // files (sidecars, encoded outputs, merged atlases) and must never share
  // state with each other.
  baseDir: async ({}, use) => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fl-vscode-e2e-'))
    // realpath: macOS resolves os.tmpdir() through a /tmp -> /private/tmp
    // symlink. VS Code reports workspaceFolders[0].uri.fsPath through the
    // resolved path, so comparing against the un-resolved tmpDir would
    // fail the workspace-identity assertion every time, not flakily.
    const dir = await fs.realpath(tmpDir)
    await fs.cp(FIXTURE_WORKSPACE, dir, { recursive: true })
    await use(dir)
    await fs.rm(dir, { recursive: true, force: true })
  },

  electronApp: async ({ vscodeInstallPath, baseDir }, use) => {
    const extensionsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fl-vscode-e2e-ext-'))
    const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fl-vscode-e2e-userdata-'))

    // Removing VSCODE_* env vars avoids a known failure mode where a
    // nested VS Code (this test running inside a VS Code integrated
    // terminal, or a prior run's leaked env) makes custom webviews fail
    // to register their service worker
    // ("InvalidStateError: Failed to register a ServiceWorker …").
    const env: Record<string, string> = {}
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined && !/^VSCODE_/i.test(key)) env[key] = value
    }

    const app = await _electron.launch({
      executablePath: vscodeInstallPath,
      env,
      args: [
        // Same flag set @vscode/test-electron's own runTests() launcher
        // uses (see its lib/runTest.ts) — sandboxing and first-run
        // dialogs are the well-known ways Electron-under-automation hangs
        // or crashes.
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

    await use(app)

    await app.close()
    await fs.rm(extensionsDir, { recursive: true, force: true })
    await fs.rm(userDataDir, { recursive: true, force: true })
  },

  workbox: async ({ electronApp }, use) => {
    await use(await electronApp.firstWindow())
  },

  evaluateInVSCode: async ({ electronApp }, use) => {
    // Attached immediately once the process exists, before any other
    // fixture setup — extension host activation (and so the bridge
    // starting) reliably takes longer than that, but a listener attached
    // any later risks missing already-flushed output.
    const bridge = await HostBridgeClient.connect(electronApp.process())
    await use((fn, arg) => bridge.evaluate(fn, arg))
    bridge.close()
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
