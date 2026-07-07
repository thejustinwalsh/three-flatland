import { expect, test } from '../fixtures'

test('FL Sprite Atlas opens on knight.png and renders', async ({ openCommand, webviewFrame }) => {
  await openCommand('threeFlatland.atlas.openEditor', ['sprites/knight.png'])

  // The custom editor's tab defaults to the document's basename — the
  // provider never overrides panel.title (extension/tools/atlas/provider.ts).
  const frame = await webviewFrame('knight.png')

  // Toolbar is design-system's canonical chrome for every FL tool
  // (tools/design-system/CLAUDE.md "Reference usage") — its presence
  // proves the React tree mounted past the FOUC-guard shell, not just
  // that the iframe loaded an empty document.
  await expect(frame.locator('vscode-toolbar-container')).toBeVisible()
})

// Reopening the same file in a second test in this file exercises the
// window-reuse-per-file fixture's editor-tab reset (../fixtures.ts,
// `resetWindowWorkspace` — `workbench.action.closeAllEditors` between
// tests that share one window). If that reset were broken, the first
// test's tab would still be open and this would find two "knight.png"
// tabs instead of a fresh one.
test('reopening the same file after a reset produces exactly one tab', async ({
  openCommand,
  webviewFrame,
  workbox,
}) => {
  await openCommand('threeFlatland.atlas.openEditor', ['sprites/knight.png'])
  const frame = await webviewFrame('knight.png')
  await expect(frame.locator('vscode-toolbar-container')).toBeVisible()
  await expect(workbox.getByRole('tab', { name: 'knight.png' })).toHaveCount(1)
})
