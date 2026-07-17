import { expect, test } from '../fixtures'

test('FL Atlas Merge opens on two fixture sidecars and renders', async ({ openCommand, webviewFrame }) => {
  await openCommand('threeFlatland.merge.openMergeTool', ['sprites/knight.atlas.json', 'sprites/dungeon.atlas.json'])

  // openMergePanel titles the panel `Merge: <label1>, <label2>, …`
  // (extension/tools/merge/host.ts) — match the prefix only so the exact
  // label ordering isn't load-bearing for this smoke spec.
  const frame = await webviewFrame(/^Merge:/)

  await expect(frame.locator('vscode-toolbar-container')).toBeVisible()
})
