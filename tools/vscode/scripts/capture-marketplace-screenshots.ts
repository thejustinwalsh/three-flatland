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
 *
 * Set FL_SHOTS_ONLY=atlas-merge,audio to run a subset of shots (comma-
 * separated names) instead of the full set — useful when only one or two
 * assets need to be redone and the rest are already accepted.
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

  // Synthetic second atlas source for the 'atlas-merge' shot below — a
  // visually distinct image (Dungeon_Tileset.png, already in the fixture
  // workspace) that happens to reuse the SAME frame name ("knight") as
  // sprites/knight.atlas.json, so merging the two produces a real
  // frame-name conflict for the screenshot to show: two unrelated sprite
  // sheets that collided on a generic name, which is exactly the case
  // this tool exists for. (knight-aseprite.png / knight-tp.png are the
  // SAME underlying character art as knight.png under different export
  // formats — visually identical, so they'd make a confusing merge demo.)
  // Written into the scratch copy only; the tracked e2e fixtures are
  // untouched.
  await fs.writeFile(
    path.join(baseDir, 'sprites', 'knight-variant.atlas.json'),
    JSON.stringify(
      {
        $schema: 'https://three-flatland.dev/schemas/atlas.v1.json',
        meta: {
          app: 'fl-sprite-atlas',
          version: '1.0',
          sources: [{ format: 'png', uri: 'Dungeon_Tileset.png' }],
          size: { w: 160, h: 160 },
          scale: '1',
          image: 'Dungeon_Tileset.png',
        },
        frames: {
          knight: {
            frame: { x: 0, y: 0, w: 160, h: 160 },
            rotated: false,
            trimmed: false,
            spriteSourceSize: { x: 0, y: 0, w: 160, h: 160 },
            sourceSize: { w: 160, h: 160 },
          },
        },
      },
      null,
      2
    ) + '\n'
  )

  const settingsPath = path.join(baseDir, '.vscode', 'settings.json')
  const settings = JSON.parse(await fs.readFile(settingsPath, 'utf8')) as Record<string, unknown>
  settings['workbench.colorTheme'] = THEME_ID
  // Display-only, scoped to this scratch copy — the fixture's audio.file
  // varRef test cases (see audio-sources.ts's own doc comment) deliberately
  // call zzfxm() against a simplified ambient `declare function zzfxm`
  // signature that doesn't match, which is real and correct for what the
  // codelens-service scanner is testing but reads as squiggly-red-error
  // noise in a marketing screenshot. Tracked fixtures stay untouched.
  settings['typescript.validate.enable'] = false
  settings['javascript.validate.enable'] = false
  settings['problems.decorations.enabled'] = false
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

      const shots: Array<{ name: string; capture: () => Promise<void>; settleMs?: number }> = [
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
            await workbox.getByRole('tab', { name: 'Encode: knight.png' }).waitFor({ state: 'visible' })
          },
        },
        {
          name: 'normal-baker',
          capture: async () => {
            await openCommand('threeFlatland.normalBaker.open', ['sprites/Dungeon_Tileset.png'])
            await workbox.getByRole('tab', { name: 'Normal Baker: Dungeon_Tileset.png' }).waitFor({ state: 'visible' })
          },
        },
        {
          name: 'audio',
          // The real FL Audio experience: inline ▶ Play / ⏹ Stop CodeLenses
          // rendered directly above zzfx()/zzfxm()/Tone.*/Wad(...) call
          // sites — no panel opens. audio-sources.ts's zzfx.call +
          // zzfxm.song section (its own doc comment has the full coverage
          // map) gives two different call kinds close together in one
          // screen. (The ZzFX Studio tuner panel has its own screenshot:
          // zzfx-studio.png.)
          settleMs: 4000, // codelens-service (Rust sidecar) cold-start scan
          capture: async () => {
            await bridge.evaluate(async (vscode) => {
              const [folder] = vscode.workspace.workspaceFolders ?? []
              const uri = vscode.Uri.joinPath(folder!.uri, 'src/audio-sources.ts')
              const doc = await vscode.workspace.openTextDocument(uri)
              const editor = await vscode.window.showTextDocument(doc)
              editor.revealRange(new vscode.Range(93, 0, 93, 0), vscode.TextEditorRevealType.AtTop)
            })
            await workbox.getByRole('tab', { name: 'audio-sources.ts' }).waitFor({ state: 'visible' })
          },
        },
        {
          name: 'atlas-merge',
          capture: async () => {
            await openCommand('threeFlatland.merge.openMergeTool', [
              'sprites/knight.atlas.json',
              'sprites/knight-variant.atlas.json',
            ])
            await workbox.getByRole('tab', { name: /^Merge:/ }).waitFor({ state: 'visible' })
          },
        },
      ]

      const only = process.env.FL_SHOTS_ONLY?.split(',')
        .map((s) => s.trim())
        .filter(Boolean)

      for (const { name, capture, settleMs } of shots) {
        if (only && !only.includes(name)) continue
        console.log(`[screenshots] capturing ${name}…`)
        await capture()
        // Generous, fixed settle time rather than a tight poll — this is
        // a one-off asset script, not a latency-sensitive e2e test. Atlas
        // specifically needs the longest margin: it's the first tool
        // opened this session, so its lazy-loaded canvas chunk (see
        // tools/vscode/CLAUDE.md's "Bundle size & loading") is a genuine
        // cold start; every tool after it reuses the already-warm chunk.
        // Individual shots can override via settleMs (e.g. audio's
        // codelens-service sidecar cold-start).
        await workbox.waitForTimeout(settleMs ?? 2000)
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

      const captured = only ? shots.filter((s) => only.includes(s.name)) : shots
      console.log(`[screenshots] done — wrote ${captured.length} screenshots to ${OUT_DIR}`)
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
