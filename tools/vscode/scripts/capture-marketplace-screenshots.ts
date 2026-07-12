#!/usr/bin/env -S npx tsx
/**
 * One-off asset generator — NOT part of the e2e regression suite (lives
 * under scripts/, not e2e/specs/, so `pnpm test:e2e` never picks it up).
 * Launches a real VS Code instance with the Bearded Theme installed and
 * active (Black & Gold — matches the docs site's own gem-palette design
 * language, see the design-system CLAUDE.md's "bearded-theme/black"
 * citation), opens each FL tool against real fixture data, and captures
 * a full-window screenshot of each for the marketplace README.
 *
 * Reuses the same launch shape as e2e/fixtures.ts's launchWindow() +
 * e2e/host-bridge/client.ts's HostBridgeClient — duplicated rather than
 * imported-and-parameterized so this stays fully isolated from the real
 * test harness (zero risk to CI, zero added complexity there for a
 * marketing-asset task).
 *
 * Prereq: the Bearded Theme extension must already be installed into
 * BEARDED_THEME_EXT_DIR — see the error this throws if it's missing for
 * the exact one-time install command.
 *
 * Usage: npx tsx scripts/capture-marketplace-screenshots.ts
 * Output: docs/marketplace/*.png
 */
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron } from '@playwright/test'
import { downloadAndUnzipVSCode } from '@vscode/test-electron'
import sharp from 'sharp'
import { HostBridgeClient } from '../e2e/host-bridge/client'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const VSCODE_ROOT = path.join(__dirname, '..')
const FIXTURE_WORKSPACE = path.join(VSCODE_ROOT, 'e2e', 'fixtures', 'workspace')
const RUNNER_PATH = path.join(VSCODE_ROOT, 'e2e', 'host-bridge', 'dist', 'runner.cjs')
const VSCODE_TEST_ROOT = path.join(VSCODE_ROOT, '.vscode-test')
const OUT_DIR = path.join(VSCODE_ROOT, 'docs', 'marketplace')

// A fixed, reusable path (not os.tmpdir()-derived) — this is a standing
// install meant to survive across repeated runs of this script, not an
// ephemeral per-run scratch dir like the workspace/userData dirs below.
const BEARDED_THEME_EXT_DIR = '/tmp/fl-bearded-theme-ext-dir'
const THEME_ID = 'Bearded Theme Black & Gold'

// macOS's title bar (traffic lights + the "[Extension Development Host]
// <folder>" label VS Code always shows in dev mode) reads as an
// unpolished dev-tool artifact in a marketing screenshot — crop it off
// the final PNGs. Measured against a real 2x/2880-wide capture; adjust
// if the title bar's rendered height ever changes.
const TITLE_BAR_CROP_PX = 92

async function main() {
  const beardedThemeInstalled = await fs
    .access(path.join(BEARDED_THEME_EXT_DIR, 'extensions.json'))
    .then(() => true)
    .catch(() => false)
  if (!beardedThemeInstalled) {
    throw new Error(
      `Bearded Theme not found at ${BEARDED_THEME_EXT_DIR} — install it first:\n` +
        `  code --extensions-dir ${BEARDED_THEME_EXT_DIR} --install-extension BeardedBear.beardedtheme`
    )
  }

  await fs.mkdir(OUT_DIR, { recursive: true })

  const vscodeInstallPath = await downloadAndUnzipVSCode({
    cachePath: VSCODE_TEST_ROOT,
    version: 'stable',
  })

  // Fixed, presentable leaf folder name — VS Code's Explorer header shows
  // the workspace folder's own last path segment, and a random mkdtemp
  // suffix there reads as an obvious throwaway test dir in a screenshot.
  // The mkdtemp parent still gives each run its own isolated scratch space.
  const scratchParent = await fs.mkdtemp(path.join(os.tmpdir(), 'fl-vscode-screenshots-'))
  const baseDir = path.join(await fs.realpath(scratchParent), 'sprite-project')
  await fs.cp(FIXTURE_WORKSPACE, baseDir, { recursive: true })

  const settingsPath = path.join(baseDir, '.vscode', 'settings.json')
  const settings = JSON.parse(await fs.readFile(settingsPath, 'utf8')) as Record<string, unknown>
  settings['workbench.colorTheme'] = THEME_ID
  await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2))

  const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fl-vscode-screenshots-userdata-'))

  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && !/^VSCODE_/i.test(key)) env[key] = value
  }

  console.log('[screenshots] launching VS Code with Bearded Theme active…')
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
      `--extensions-dir=${BEARDED_THEME_EXT_DIR}`,
      `--user-data-dir=${userDataDir}`,
      `--extensionDevelopmentPath=${VSCODE_ROOT}`,
      `--extensionTestsPath=${RUNNER_PATH}`,
      baseDir,
    ],
  })

  try {
    const workbox = await app.firstWindow()
    const bridge = await HostBridgeClient.connect(app.process())

    try {
      // The AI chat panel (secondary side bar) is on by default and adds
      // nothing to a tool screenshot — close it once, up front.
      await bridge.evaluate(async (vscode) => {
        await vscode.commands.executeCommand('workbench.action.closeAuxiliaryBar')
      })

      const openCommand = async (commandId: string, relativeFsPaths: string[] = []) => {
        await bridge.evaluate(
          async (vscode, args) => {
            const [folder] = vscode.workspace.workspaceFolders ?? []
            if (!folder || args.relativeFsPaths.length === 0) {
              await vscode.commands.executeCommand(args.commandId)
              return
            }
            const uris = args.relativeFsPaths.map((p) => vscode.Uri.joinPath(folder.uri, p))
            await vscode.commands.executeCommand(args.commandId, uris[0], uris)
          },
          { commandId, relativeFsPaths }
        )
      }

      const shots: Array<{ name: string; capture: () => Promise<void> }> = [
        {
          name: 'atlas',
          capture: async () => {
            await openCommand('threeFlatland.atlas.openEditor', ['sprites/knight.png'])
            await workbox.getByRole('tab', { name: 'knight.png' }).waitFor({ state: 'visible' })
          },
        },
        {
          name: 'encode',
          capture: async () => {
            await openCommand('threeFlatland.encode.open', ['sprites/knight.png'])
            await workbox
              .getByRole('tab', { name: 'Encode: knight.png' })
              .waitFor({ state: 'visible' })
          },
        },
        {
          name: 'normal-baker',
          capture: async () => {
            await openCommand('threeFlatland.normalBaker.open', ['sprites/Dungeon_Tileset.png'])
            await workbox
              .getByRole('tab', { name: 'Normal Baker: Dungeon_Tileset.png' })
              .waitFor({ state: 'visible' })
          },
        },
        {
          name: 'audio',
          capture: async () => {
            await bridge.evaluate(async (vscode) => {
              const [folder] = vscode.workspace.workspaceFolders ?? []
              const uri = vscode.Uri.joinPath(folder!.uri, 'src/sounds.ts')
              const doc = await vscode.workspace.openTextDocument(uri)
              await vscode.window.showTextDocument(doc)
              const lenses = (await vscode.commands.executeCommand(
                'vscode.executeCodeLensProvider',
                uri,
                100
              )) as { command?: { command: string; arguments?: unknown[] } }[]
              const editLens = lenses.find(
                (l) => l.command?.command === 'threeFlatland.audio.openEditor'
              )
              await vscode.commands.executeCommand(
                editLens!.command!.command,
                ...(editLens!.command!.arguments ?? [])
              )
            })
            await workbox.getByRole('tab', { name: /^ZzFX:/ }).waitFor({ state: 'visible' })
          },
        },
      ]

      for (const { name, capture } of shots) {
        console.log(`[screenshots] capturing ${name}…`)
        await capture()
        // Generous, fixed settle time rather than a tight poll — this is
        // a one-off asset script, not a latency-sensitive e2e test. Atlas
        // specifically needs the longest margin: it's the first tool
        // opened this session, so its lazy-loaded canvas chunk (see
        // tools/vscode/CLAUDE.md's "Bundle size & loading") is a genuine
        // cold start; every tool after it reuses the already-warm chunk.
        await workbox.waitForTimeout(2000)
        // A workspace-settings write races this launch (harmless, but a
        // visible toast in every screenshot) — clear it right before
        // capturing rather than root-causing it, since this script only
        // cares about the resulting image.
        await bridge.evaluate(async (vscode) => {
          await vscode.commands.executeCommand('notifications.clearAll')
        })
        const rawPath = path.join(OUT_DIR, `${name}.raw.png`)
        await workbox.screenshot({ path: rawPath })
        await sharp(rawPath)
          .extract({
            left: 0,
            top: TITLE_BAR_CROP_PX,
            width: (await sharp(rawPath).metadata()).width!,
            height: (await sharp(rawPath).metadata()).height! - TITLE_BAR_CROP_PX,
          })
          .toFile(path.join(OUT_DIR, `${name}.png`))
        await fs.rm(rawPath)
        await bridge.evaluate(async (vscode) => {
          await vscode.commands.executeCommand('workbench.action.closeAllEditors')
        })
      }

      console.log(`[screenshots] done — wrote ${shots.length} screenshots to ${OUT_DIR}`)
    } finally {
      bridge.close()
    }
  } finally {
    await Promise.race([app.close(), new Promise((resolve) => setTimeout(resolve, 5000))])
    try {
      app.process().kill('SIGKILL')
    } catch {
      // already exited
    }
    await Promise.all([
      fs.rm(scratchParent, { recursive: true, force: true }),
      fs.rm(userDataDir, { recursive: true, force: true }),
    ])
  }
}

await main()
