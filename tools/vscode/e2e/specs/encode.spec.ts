import { expect, test } from '../fixtures'

test('FL Image Encoder opens on a fixture PNG and renders', async ({ openCommand, webviewFrame }) => {
  await openCommand('threeFlatland.encode.open', ['sprites/knight.png'])

  // openEncodePanel titles the ad-hoc panel `Encode: <filename>`
  // (extension/tools/encode/host.ts).
  const frame = await webviewFrame('Encode: knight.png')

  await expect(frame.locator('vscode-toolbar-container')).toBeVisible()
})
