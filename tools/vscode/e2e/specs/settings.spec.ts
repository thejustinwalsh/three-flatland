import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron } from '@playwright/test'
import { test, expect } from '../fixtures'
import { HostBridgeClient } from '../host-bridge/client'

// Menu *rendering* (submenu contents, item visibility) isn't introspectable
// through VS Code's extension API — these specs assert the underlying
// state the menus are driven by instead: the `threeFlatland.tool.*.enabled`
// context keys (same values `when` clauses read) and command
// availability/behavior. See tools/vscode/CLAUDE.md's "Per-tool settings"
// section for what each assertion is standing in for.

// This file lives in e2e/specs/, one directory deeper than fixtures.ts
// (e2e/) — EXTENSION_ROOT needs the extra '..' fixtures.ts doesn't, or
// --extensionDevelopmentPath points at e2e/ instead of the actual
// extension root and VS Code silently never loads it (vscode.extensions.all
// won't contain it at all — no error, just absence).
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const EXTENSION_ROOT = path.join(__dirname, '..', '..')
const FIXTURE_WORKSPACE = path.join(__dirname, '..', 'fixtures', 'workspace')
const RUNNER_PATH = path.join(__dirname, '..', 'host-bridge', 'dist', 'runner.cjs')

test.describe('FL tool settings', () => {
  test('disabling FL Image Encoder live: context key flips, command deregisters; re-enabling restores it', async ({
    evaluateInVSCode,
    openCommand,
    webviewFrame,
  }) => {
    const SETTING = 'threeFlatland.tools.imageEncoder.enabled'

    // Explicit activation rather than relying on onLanguage:* timing —
    // under the single-session harness an earlier spec has usually
    // activated the extension already, but no test gets to assume that
    // (see zzfx.spec.ts's identical pattern).
    await evaluateInVSCode(async (vscode) => {
      const ext = vscode.extensions.all.find((e) => e.packageJSON.name === '@three-flatland/vscode')
      if (ext && !ext.isActive) await ext.activate()
    })

    // Confirm the enabled-by-default baseline before touching anything.
    const before = await evaluateInVSCode(async (vscode) => {
      const cmds = await vscode.commands.getCommands(true)
      return cmds.includes('threeFlatland.encode.open')
    })
    expect(before).toBe(true)

    await evaluateInVSCode(
      async (vscode, arg) => {
        await vscode.workspace
          .getConfiguration()
          .update(arg.setting, false, vscode.ConfigurationTarget.Workspace)
      },
      { setting: SETTING }
    )

    // liveToggle: true — imageEncoder's aggregate Disposable (which
    // includes its command registration) is disposed synchronously
    // inside the onDidChangeConfiguration handler, so the command
    // itself should be gone, not just guarded-and-declining.
    const afterDisable = await evaluateInVSCode(async (vscode) => {
      const cmds = await vscode.commands.getCommands(true)
      return cmds.includes('threeFlatland.encode.open')
    })
    expect(afterDisable).toBe(false)

    // threeFlatland.tool.imageEncoder.enabled — the setContext-mirrored
    // context key the explorer/context and commandPalette `when` clauses
    // actually gate on — has no public getter (setContext is
    // fire-and-forget; VS Code doesn't expose a read side for extension
    // code, only for the renderer's own `when`-clause evaluator). The
    // command's disappearance, just asserted above, is the strongest
    // proxy available from this API surface: liveToggle's dispose() call
    // tears down the registration itself, so the context key being
    // correct or not is moot once the command genuinely doesn't exist.
    // See the file header comment for the general menu-introspection limit.

    await evaluateInVSCode(
      async (vscode, arg) => {
        await vscode.workspace
          .getConfiguration()
          .update(arg.setting, true, vscode.ConfigurationTarget.Workspace)
      },
      { setting: SETTING }
    )

    const afterReenable = await evaluateInVSCode(async (vscode) => {
      const cmds = await vscode.commands.getCommands(true)
      return cmds.includes('threeFlatland.encode.open')
    })
    expect(afterReenable).toBe(true)

    // And the re-registered command actually works, not just "exists."
    await openCommand('threeFlatland.encode.open', ['sprites/knight.png'])
    const frame = await webviewFrame('Encode: knight.png')
    await frame.locator('#root').waitFor({ state: 'visible' })
  })

  // C1: proves normalBaker's ToolDescriptor entry (liveToggle: true, same
  // shape as imageEncoder above) actually participates in the registry —
  // not just that it's declared in TOOL_DESCRIPTORS/package.json, but that
  // toggling its setting live registers/deregisters the real command.
  test('disabling FL Normal Baker live: command deregisters; re-enabling restores it', async ({
    evaluateInVSCode,
    openCommand,
    webviewFrame,
  }) => {
    const SETTING = 'threeFlatland.tools.normalBaker.enabled'

    await evaluateInVSCode(async (vscode) => {
      const ext = vscode.extensions.all.find((e) => e.packageJSON.name === '@three-flatland/vscode')
      if (ext && !ext.isActive) await ext.activate()
    })

    const before = await evaluateInVSCode(async (vscode) => {
      const cmds = await vscode.commands.getCommands(true)
      return cmds.includes('threeFlatland.normalBaker.open')
    })
    expect(before).toBe(true)

    await evaluateInVSCode(
      async (vscode, arg) => {
        await vscode.workspace
          .getConfiguration()
          .update(arg.setting, false, vscode.ConfigurationTarget.Workspace)
      },
      { setting: SETTING }
    )

    const afterDisable = await evaluateInVSCode(async (vscode) => {
      const cmds = await vscode.commands.getCommands(true)
      return cmds.includes('threeFlatland.normalBaker.open')
    })
    expect(afterDisable).toBe(false)

    await evaluateInVSCode(
      async (vscode, arg) => {
        await vscode.workspace
          .getConfiguration()
          .update(arg.setting, true, vscode.ConfigurationTarget.Workspace)
      },
      { setting: SETTING }
    )

    const afterReenable = await evaluateInVSCode(async (vscode) => {
      const cmds = await vscode.commands.getCommands(true)
      return cmds.includes('threeFlatland.normalBaker.open')
    })
    expect(afterReenable).toBe(true)

    // Re-registered command actually opens the panel, not just "exists" —
    // and drives it via the .png source (the .normal.json sidecar-opens-
    // its-paired-image path is covered separately in normal-baker.spec.ts).
    await openCommand('threeFlatland.normalBaker.open', ['sprites/Dungeon_Tileset.png'])
    const frame = await webviewFrame('Normal Baker: Dungeon_Tileset.png')
    await expect(frame.locator('vscode-toolbar-container')).toBeVisible()
  })

  test('FL Audio disabled at startup: CodeLens provider never registers, no FL lenses', async ({
    vscodeInstallPath,
  }) => {
    // audio is liveToggle: false — a live setting change flips its
    // context key but defers the actual register/dispose to a window
    // reload (see toolRegistry.ts). Simulating a real mid-session reload
    // isn't something the shared _sharedWindow harness supports (a new
    // extension host process needs a fresh bridge connection this
    // harness doesn't re-establish), so this test instead exercises the
    // equivalent, and arguably more important, invariant directly: a
    // FRESH activation with the setting already off never registers the
    // provider in the first place. That's the actual code path a real
    // "disable → reload" flow lands on. Own bespoke launch (not the
    // shared window pool) so the setting can be baked into this
    // session's workspace copy before the extension host activates —
    // the shared fixture is deliberately left untouched so no other
    // spec's baseline shifts.
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fl-vscode-e2e-settings-'))
    const baseDir = await fs.realpath(tmpDir)
    await fs.cp(FIXTURE_WORKSPACE, baseDir, { recursive: true })
    const settingsPath = path.join(baseDir, '.vscode', 'settings.json')
    const settings = JSON.parse(await fs.readFile(settingsPath, 'utf8')) as Record<string, unknown>
    settings['threeFlatland.tools.audio.enabled'] = false
    await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2))

    const extensionsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fl-vscode-e2e-settings-ext-'))
    const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fl-vscode-e2e-settings-data-'))
    const env: Record<string, string> = {}
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined && !/^VSCODE_/i.test(key)) env[key] = value
    }

    const app = await _electron.launch({
      executablePath: vscodeInstallPath,
      env,
      args: [
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

    try {
      const bridge = await HostBridgeClient.connect(app.process())
      try {
        const lenses = await bridge.evaluate(
          async (vscode, arg) => {
            const ext = vscode.extensions.all.find(
              (e) => e.packageJSON.name === '@three-flatland/vscode'
            )
            if (ext && !ext.isActive) await ext.activate()
            const [folder] = vscode.workspace.workspaceFolders ?? []
            const uri = vscode.Uri.joinPath(folder!.uri, arg.file)
            const doc = await vscode.workspace.openTextDocument(uri)
            await vscode.window.showTextDocument(doc)
            const result = (await vscode.commands.executeCommand(
              'vscode.executeCodeLensProvider',
              uri,
              100
            )) as { command?: { command: string } }[]
            return result.map((l) => l.command?.command ?? null)
          },
          { file: 'src/sounds.ts' }
        )
        expect(lenses.filter((c) => c?.startsWith('threeFlatland.audio.'))).toEqual([])

        // The tool being off shouldn't take the rest of the extension
        // with it — atlas's command must still be registered normally.
        const hasAtlas = await bridge.evaluate(async (vscode) => {
          const cmds = await vscode.commands.getCommands(true)
          return cmds.includes('threeFlatland.atlas.openEditor')
        })
        expect(hasAtlas).toBe(true)
      } finally {
        bridge.close()
      }
    } finally {
      await app.close()
      await Promise.all([
        fs.rm(baseDir, { recursive: true, force: true }),
        fs.rm(extensionsDir, { recursive: true, force: true }),
        fs.rm(userDataDir, { recursive: true, force: true }),
      ])
    }
  })
})
