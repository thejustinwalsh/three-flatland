import { expect, test } from '../fixtures'

test('FL Sprite Atlas opens on knight.png and renders', async ({ openCommand, webviewFrame }) => {
  await openCommand('threeFlatland.atlas.openEditor', ['sprites/knight.png'])

  // The custom editor's tab defaults to the document's basename — the
  // provider never overrides panel.title (extension/tools/atlas/provider.ts).
  const frame = await webviewFrame('knight.png')

  // Toolbar is design-system's canonical chrome for every FL tool
  // (tools/design-system/AGENTS.md "Reference usage") — its presence
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

// C2 item 1 — stakeholder: "anchors so big at default scale you can't
// even edit the box... typically editors just make the handles the
// same size regardless of scale." Proves the fix live, not just via
// Viewport.test.ts's isolated scale math: select a frame, measure a
// resize handle's REAL on-screen (viewport) pixel size via Playwright's
// boundingBox(), zoom in several steps, and assert the on-screen size
// stayed roughly constant — the pre-fix behavior (handles fixed at 4
// image-px) would have made this size grow ~1.25x per zoomIn() click.
test('resize handles stay a roughly constant on-screen size across zoom levels', async ({
  openCommand,
  webviewFrame,
}) => {
  await openCommand('threeFlatland.atlas.openEditor', ['sprites/knight.png'])
  const frame = await webviewFrame('knight.png')
  await expect(frame.locator('vscode-toolbar-container')).toBeVisible()

  // Select the one frame — RectOverlay only renders handles when
  // exactly one rect is selected (see RectOverlay.tsx's comment on why
  // multi-select suppresses them).
  await frame.locator('[data-frame-id]').first().click()
  const handle = frame.locator('[data-testid="rect-handle"]').first()
  await expect(handle).toBeVisible()

  const baseline = await handle.boundingBox()
  expect(baseline).not.toBeNull()

  // zoomIn() steps ×1.25 per click (CanvasStage.tsx's ViewportController)
  // — 6 clicks ≈ 3.8× zoom, comfortably past "default scale" toward the
  // stakeholder's high-zoom complaint.
  for (let i = 0; i < 6; i++) {
    await frame.getByTitle('Zoom In').click()
  }
  const zoomedIn = await handle.boundingBox()
  expect(zoomedIn).not.toBeNull()

  // Allow a generous tolerance (rounding to whole image-px at low zoom,
  // sub-pixel viewport rendering) — the assertion that matters is "did
  // NOT scale with zoom like the old fixed-image-px handle would have."
  // A regression back to fixed image-px sizing would show ~3.8x growth
  // here, far outside this tolerance.
  const ratio = zoomedIn!.width / baseline!.width
  expect(ratio).toBeGreaterThan(0.5)
  expect(ratio).toBeLessThan(2)
})
