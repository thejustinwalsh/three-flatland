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
