import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { readPngTextChunk } from '@three-flatland/bake'
import { expect, test } from '../fixtures'

test('FL Normal Baker opens on a PNG and renders', async ({ openCommand, webviewFrame }) => {
  await openCommand('threeFlatland.normalBaker.open', ['sprites/Dungeon_Tileset.png'])

  // openNormalBakerPanel titles the ad-hoc panel `Normal Baker: <filename>`
  // (extension/tools/normal-baker/host.ts).
  const frame = await webviewFrame('Normal Baker: Dungeon_Tileset.png')

  await expect(frame.locator('vscode-toolbar-container')).toBeVisible()
})

test('Save re-bakes .normal.png and re-stamps its content-hash', async ({
  baseDir,
  openCommand,
  webviewFrame,
}) => {
  // Delete only the baked PNG output — a successful assertion below then
  // proves Save actually (re)created it (host service ran
  // bakeNormalMapFile), not that it merely survived untouched from the
  // fixture. `.normal.json` stays in place: it's the SOURCE descriptor the
  // webview loads on open, not just an output — deleting it here would
  // start the editor from an empty document instead of exercising a real
  // load → save round-trip.
  const pngOut = path.join(baseDir, 'sprites', 'Dungeon_Tileset.normal.png')
  const jsonOut = path.join(baseDir, 'sprites', 'Dungeon_Tileset.normal.json')
  await fs.rm(pngOut, { force: true })

  await openCommand('threeFlatland.normalBaker.open', ['sprites/Dungeon_Tileset.png'])
  const frame = await webviewFrame('Normal Baker: Dungeon_Tileset.png')
  await expect(frame.locator('vscode-toolbar-container')).toBeVisible()

  await frame.getByTitle('Save (.normal.png + .normal.json)').click()

  // The bake itself is synchronous Node fs inside the host's bridge
  // handler, but the bridge round-trip (webview request → host → response)
  // is async — poll for the output file rather than asserting immediately.
  await expect
    .poll(
      () =>
        fs
          .stat(pngOut)
          .then(() => true)
          .catch(() => false),
      { timeout: 15_000 }
    )
    .toBe(true)

  const pngBytes = await fs.readFile(pngOut)
  expect(Array.from(pngBytes.subarray(0, 8))).toEqual([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ])

  // Confirms bakeNormalMapFile's tEXt stamp round-trip (see
  // extension/tools/normal-baker/sidecar.ts's saveNormalDescriptor doc
  // comment on "Risk 3: Hash re-stamp on Save") — not just that some bytes
  // got written, but that the flatland metadata chunk with a content hash
  // landed in the output.
  const stampJSON = readPngTextChunk(Uint8Array.from(pngBytes).buffer, 'flatland')
  expect(stampJSON).not.toBeNull()
  const stamp = JSON.parse(stampJSON!) as { hash?: string; v?: number }
  expect(typeof stamp.hash).toBe('string')
  expect(stamp.hash).toMatch(/^[0-9a-f]{16}$/)

  // .normal.json is rewritten too (same descriptor object baked the PNG
  // and got written as JSON — see saveNormalDescriptor) — round-trips the
  // region count the webview loaded from the untouched fixture sidecar
  // (examples/react/lighting/public/sprites/Dungeon_Tileset.normal.json
  // ships 122 regions), not an empty stub.
  const descriptor = JSON.parse(await fs.readFile(jsonOut, 'utf8')) as {
    version?: number
    regions?: unknown[]
  }
  expect(descriptor.version).toBe(1)
  expect(descriptor.regions).toHaveLength(122)
})
