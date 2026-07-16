import { expect, test } from '../fixtures'
import type { FrameLocator, Locator } from '@playwright/test'

// Reads a workspace-relative file's text content through the real
// extension host, straight off disk. Uses vscode.workspace.fs rather than
// openTextDocument because this suite reads the same sidecar path multiple
// times per test as it evolves across a save — openTextDocument caches the
// TextDocument on first open and won't see a later out-of-band
// vscode.workspace.fs.writeFile from the sidecar writer.
async function readFile(
  evaluateInVSCode: <R, Arg = undefined>(
    fn: (vscodeModule: typeof import('vscode'), arg: Arg) => R | Promise<R>,
    arg?: Arg
  ) => Promise<R>,
  file: string
): Promise<string> {
  return evaluateInVSCode(
    async (vscode, arg) => {
      const [folder] = vscode.workspace.workspaceFolders ?? []
      const uri = vscode.Uri.joinPath(folder!.uri, arg.file)
      const bytes = await vscode.workspace.fs.readFile(uri)
      return Buffer.from(bytes).toString('utf-8')
    },
    { file }
  )
}

// The canvas image (a lazy-loaded chunk decoding a texture) can still be
// mid-load right after the toolbar mounts — a Save clicked before then
// correctly refuses with "image not loaded yet" rather than silently
// racing. Rather than retrying the click until it happens to land (timing-
// dependent, and it masks the "image not loaded yet" refusal path instead
// of avoiding it), wait for the "Image size" badge App.tsx renders once
// CanvasStage's onImageReady fires — the same `imageSize` signal
// handleSave itself gates on — then click exactly once.
async function saveAndWaitForSaved(frame: FrameLocator, button: Locator): Promise<void> {
  await expect(frame.getByTitle('Image size')).toBeVisible()
  await button.click()
  await expect(frame.getByText(/Saved/)).toBeVisible()
}

test('opening a bare TexturePacker-shaped sidecar shows the TexturePacker badge', async ({
  openCommand,
  webviewFrame,
}) => {
  await openCommand('threeFlatland.atlas.openEditor', ['sprites/knight-tp.png'])
  const frame = await webviewFrame('knight-tp.png')
  await expect(frame.locator('vscode-toolbar-container')).toBeVisible()

  // knight-tp.atlas.json is a genuine TexturePacker JSON-Hash export with
  // no meta.app at all — detectAtlasFormat's "bare + TP-shaped = treat as
  // TexturePacker" rule, exercised for real rather than just at the
  // tools/io unit-test layer.
  await expect(frame.getByText('TexturePacker', { exact: true })).toBeVisible()
})

test('opening a real Aseprite export shows the Aseprite badge, and an untouched save round-trips frameTags + duration', async ({
  openCommand,
  webviewFrame,
  evaluateInVSCode,
}) => {
  await openCommand('threeFlatland.atlas.openEditor', ['sprites/knight-aseprite.png'])
  const frame = await webviewFrame('knight-aseprite.png')
  await expect(frame.locator('vscode-toolbar-container')).toBeVisible()
  await expect(frame.getByText('Aseprite', { exact: true })).toBeVisible()

  await saveAndWaitForSaved(frame, frame.getByTitle(/Save Atlas/))

  const written = JSON.parse(
    await readFile(evaluateInVSCode, 'sprites/knight-aseprite.atlas.json')
  ) as {
    meta: { image?: string; sources?: unknown; animations?: unknown; frameTags?: unknown[] }
    frames: Record<string, { duration?: number }>
  }
  // Still genuinely Aseprite-shaped — meta.image (not our meta.sources),
  // no meta.animations, frameTags preserved, per-frame duration preserved.
  expect(written.meta.image).toBe('knight-aseprite.png')
  expect(written.meta.sources).toBeUndefined()
  expect(written.meta.animations).toBeUndefined()
  expect(written.meta.frameTags).toEqual([{ name: 'idle', from: 0, to: 1, direction: 'forward' }])
  expect(written.frames.idle_0?.duration).toBe(100)
  expect(written.frames.idle_1?.duration).toBe(100)
})

test('switching the output format to native requires a two-step confirm before saving, and the badge disappears once switched', async ({
  openCommand,
  webviewFrame,
  evaluateInVSCode,
}) => {
  await openCommand('threeFlatland.atlas.openEditor', ['sprites/knight-tp.png'])
  const frame = await webviewFrame('knight-tp.png')
  await expect(frame.locator('vscode-toolbar-container')).toBeVisible()
  await expect(frame.getByText('TexturePacker', { exact: true })).toBeVisible()

  // Open the hamburger menu and switch Export Format to native. Export
  // Format is a CompactSelect (button + listbox), not a Segmented radio
  // group — the other Display-options rows (Filter/Style/Color/Coords)
  // stayed Segmented, only this one row was swapped for CompactSelect to
  // fix overflow (see AtlasMenu.tsx).
  await frame.getByTitle('Display options').click()
  await frame.getByRole('button', { name: 'Export format' }).click()
  await frame.getByRole('option', { name: 'native' }).click()
  // Closing the popover isn't required for the rest of the test, but
  // clicking elsewhere mirrors how a user would actually dismiss it.
  await frame.locator('body').click({ position: { x: 4, y: 4 } })

  // Badge disappears — 'native' never gets the warning-badge treatment.
  await expect(frame.getByText('TexturePacker', { exact: true })).not.toBeVisible()

  const before = await readFile(evaluateInVSCode, 'sprites/knight-tp.atlas.json')

  // First Save click arms the warning instead of saving — the file must
  // not change yet.
  const saveButton = frame.getByTitle(/Save Atlas/)
  await saveButton.click()
  await expect(frame.getByTitle(/Click again to save as FL Atlas/)).toBeVisible()
  const afterFirstClick = await readFile(evaluateInVSCode, 'sprites/knight-tp.atlas.json')
  expect(afterFirstClick).toBe(before)

  // Second click actually saves, now in native format.
  await frame.getByTitle(/Click again to save as FL Atlas/).click()
  await expect(frame.getByText(/Saved/)).toBeVisible()
  const written = JSON.parse(await readFile(evaluateInVSCode, 'sprites/knight-tp.atlas.json')) as {
    meta: { app?: string; sources?: unknown; image?: string }
  }
  expect(written.meta.app).toBe('fl-sprite-atlas')
  expect(written.meta.sources).toBeDefined()
  expect(written.meta.image).toBeUndefined()
})

test('opening our own native format never shows a badge and Save is a single, unconfirmed click', async ({
  openCommand,
  webviewFrame,
}) => {
  await openCommand('threeFlatland.atlas.openEditor', ['sprites/knight.png'])
  const frame = await webviewFrame('knight.png')
  await expect(frame.locator('vscode-toolbar-container')).toBeVisible()
  await expect(frame.getByText('TexturePacker', { exact: true })).not.toBeVisible()
  await expect(frame.getByText('Aseprite', { exact: true })).not.toBeVisible()

  await saveAndWaitForSaved(frame, frame.getByTitle('Save Atlas  (⌘S)'))
})
