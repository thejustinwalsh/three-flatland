import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from '../fixtures'

/**
 * Z8 design-audit harness — NOT a regression suite. Captures full-window
 * screenshots of every tool webview plus native VS Code reference surfaces
 * (Settings editor, Extensions view) into `test-results/<FL_AUDIT_DIR>`
 * for a manual side-by-side idiom comparison. Run explicitly, always
 * setting FL_AUDIT_DIR:
 *
 *   FL_AUDIT_DIR=design-audit-before pnpm --filter @three-flatland/vscode \
 *     exec playwright test --config=e2e/playwright.config.ts design-audit
 *
 * The default (unset) dir is deliberately neither `-before` nor `-after`
 * — Playwright's `outputDir` is wiped on every invocation of ANY spec
 * (not just this file's), so capturing straight into a baseline name
 * without copying it out immediately after is a footgun: the next
 * unrelated e2e run (or a second design-audit capture) silently deletes
 * it. Copy whatever this produces out of `test-results/` right away.
 *
 * Screenshots are gitignored (test-results/) — they're delivered to the
 * stakeholder as an Artifact gallery, not committed.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const AUDIT_DIR = process.env.FL_AUDIT_DIR ?? 'design-audit'
const OUT_DIR = path.join(__dirname, '..', 'test-results', AUDIT_DIR)

test.describe('Z8 design audit screenshots', () => {
  // Screenshots are MANUAL artifacts, not a determinism gate: this harness
  // captures full-window images for a human side-by-side idiom comparison,
  // and native-workbench surfaces (Settings/Extensions) can't be pinned to a
  // deterministic "content settled" signal anyway. CI never sets
  // FL_AUDIT_DIR, so skip the whole harness there; run it explicitly with
  // FL_AUDIT_DIR set (see the file header) to capture.
  test.skip(!process.env.FL_AUDIT_DIR, 'manual screenshot capture harness — set FL_AUDIT_DIR to run')

  test('zzfx tuner', async ({ evaluateInVSCode, webviewFrame, workbox }) => {
    await evaluateInVSCode(async (vscode) => {
      const ext = vscode.extensions.all.find((e) => e.packageJSON.name === '@three-flatland/vscode')
      if (ext && !ext.isActive) await ext.activate()
      const [folder] = vscode.workspace.workspaceFolders ?? []
      const uri = vscode.Uri.joinPath(folder!.uri, 'src/sounds.ts')
      const doc = await vscode.workspace.openTextDocument(uri)
      await vscode.window.showTextDocument(doc)
      const lenses = (await vscode.commands.executeCommand('vscode.executeCodeLensProvider', uri, 100)) as {
        command?: { command: string; arguments?: unknown[] }
      }[]
      const editLens = lenses.find((l) => l.command?.command === 'threeFlatland.audio.openEditor')
      await vscode.commands.executeCommand(editLens!.command!.command, ...(editLens!.command!.arguments ?? []))
    })
    const frame = await webviewFrame(/^ZzFX:/)
    await frame.locator('text=Category').first().waitFor({ state: 'visible' })
    await workbox.screenshot({ path: path.join(OUT_DIR, 'zzfx.png') })
  })

  test('atlas editor', async ({ openCommand, webviewFrame, workbox }) => {
    await openCommand('threeFlatland.atlas.openEditor', ['sprites/knight.png'])
    const frame = await webviewFrame('knight.png')
    await frame.locator('#root').waitFor({ state: 'visible' })
    await workbox.screenshot({ path: path.join(OUT_DIR, 'atlas.png') })
  })

  test('encode tool', async ({ openCommand, webviewFrame, workbox }) => {
    await openCommand('threeFlatland.encode.open', ['sprites/knight.png'])
    const frame = await webviewFrame('Encode: knight.png')
    await frame.locator('#root').waitFor({ state: 'visible' })
    await workbox.screenshot({ path: path.join(OUT_DIR, 'encode.png') })
  })

  test('merge tool', async ({ openCommand, webviewFrame, workbox }) => {
    await openCommand('threeFlatland.merge.openMergeTool', ['sprites/knight.atlas.json', 'sprites/dungeon.atlas.json'])
    const frame = await webviewFrame(/^Merge:/)
    await frame.locator('#root').waitFor({ state: 'visible' })
    await workbox.screenshot({ path: path.join(OUT_DIR, 'merge.png') })
  })

  test('normal baker', async ({ openCommand, webviewFrame, workbox }) => {
    await openCommand('threeFlatland.normalBaker.open', ['sprites/Dungeon_Tileset.png'])
    const frame = await webviewFrame('Normal Baker: Dungeon_Tileset.png')
    await frame.locator('#root').waitFor({ state: 'visible' })
    await workbox.screenshot({ path: path.join(OUT_DIR, 'normal-baker.png') })
  })

  test('native: settings editor', async ({ evaluateInVSCode, workbox }) => {
    await evaluateInVSCode(async (vscode) => {
      await vscode.commands.executeCommand('workbench.action.openSettings', 'volume')
    })
    await workbox.locator('.settings-editor').waitFor({ state: 'visible' })
    // `.settings-editor` becomes visible before the (filtered, virtualized)
    // settings tree has actually rendered any rows into it — wait for a
    // real `.setting-item` row (VS Code's own workbench class, confirmed
    // against the bundled workbench.desktop.main.js) instead of guessing
    // how long that takes with a fixed delay.
    await workbox.locator('.settings-editor .setting-item').first().waitFor({ state: 'visible' })
    await workbox.screenshot({ path: path.join(OUT_DIR, 'native-settings.png') })
  })

  test('native: extensions view', async ({ evaluateInVSCode, workbox }) => {
    await evaluateInVSCode(async (vscode) => {
      await vscode.commands.executeCommand('workbench.view.extensions')
    })
    await workbox.locator('.extensions-viewlet').waitFor({ state: 'visible' })
    // Same idea as the settings editor above: the viewlet container mounts
    // before the installed-extensions query resolves and the list actually
    // renders rows. Wait for a real `.extension-list-item` row instead of a
    // fixed delay.
    await workbox.locator('.extensions-viewlet .extension-list-item').first().waitFor({ state: 'visible' })
    await workbox.screenshot({ path: path.join(OUT_DIR, 'native-extensions.png') })
  })
})
