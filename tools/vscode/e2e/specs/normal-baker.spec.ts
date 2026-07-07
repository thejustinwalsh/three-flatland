import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { PNG } from 'pngjs'
import { hashDescriptor, readPngTextChunk } from '@three-flatland/bake'
import { bakeNormalMap, type NormalSourceDescriptor } from '@three-flatland/normals'
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

  // .normal.json is rewritten too (same descriptor object baked the PNG
  // and got written as JSON — see saveNormalDescriptor) — round-trips the
  // region count the webview loaded from the untouched fixture sidecar
  // (examples/react/lighting/public/sprites/Dungeon_Tileset.normal.json
  // ships 122 regions), not an empty stub.
  const descriptor = JSON.parse(await fs.readFile(jsonOut, 'utf8')) as NormalSourceDescriptor
  expect(descriptor.version).toBe(1)
  expect(descriptor.regions).toHaveLength(122)

  // Confirms bakeNormalMapFile's tEXt stamp round-trip (see
  // extension/tools/normal-baker/sidecar.ts's saveNormalDescriptor doc
  // comment on "Risk 3: Hash re-stamp on Save") — EXACT equality against
  // hashDescriptor(descriptor) computed independently in this test
  // process, not just "looks like a hash." A shape-only check (right
  // length, right character set) would pass even if the host hashed the
  // wrong descriptor or a stale one.
  const stampJSON = readPngTextChunk(Uint8Array.from(pngBytes).buffer, 'flatland')
  expect(stampJSON).not.toBeNull()
  const stamp = JSON.parse(stampJSON!) as { hash?: string; v?: number }
  expect(stamp.hash).toBe(hashDescriptor(descriptor))

  // Bake correctness, not just "a plausible-looking file exists": decode
  // the SOURCE PNG and independently run the exact same `bakeNormalMap`
  // (browser-safe, pure — @three-flatland/normals's root export) the host
  // service's `bakeNormalMapFile` calls internally, using the descriptor
  // that was actually saved. The disk-baked output must match this
  // independently-computed result byte-for-byte — the bake is
  // deterministic integer math, so anything short of exact equality means
  // the host baked against a different image, a different/stale
  // descriptor, or the pipeline diverged from what packages/normals
  // actually implements.
  const pngIn = path.join(baseDir, 'sprites', 'Dungeon_Tileset.png')
  const sourcePng = PNG.sync.read(await fs.readFile(pngIn))
  const expectedBake = bakeNormalMap(
    new Uint8Array(sourcePng.data.buffer, sourcePng.data.byteOffset, sourcePng.data.byteLength),
    sourcePng.width,
    sourcePng.height,
    descriptor
  )
  const bakedPng = PNG.sync.read(pngBytes)
  expect(bakedPng.width).toBe(sourcePng.width)
  expect(bakedPng.height).toBe(sourcePng.height)
  expect(Array.from(bakedPng.data)).toEqual(Array.from(expectedBake))

  // A second, independently-DERIVED check (not just "re-ran the same
  // function and compared") on one concrete region — picked from the
  // descriptor that was actually loaded/saved, not a magic index: the
  // first region with an explicit non-flat direction AND an explicit
  // elevation. Its baked pixel must (a) differ from the flat encoding
  // (128, 128) in R/G — it's tilted, so it can't encode as flat — and
  // (b) equal EXACTLY the elevation's B-channel encoding
  // (round(elevation * 255), per packages/normals/src/bake.ts's encode
  // comment), computed here from the region's own field, not read back
  // from the bake output.
  const tiltedRegion = descriptor.regions!.find(
    (r) => r.direction !== undefined && r.direction !== 'flat' && r.elevation !== undefined
  )
  expect(
    tiltedRegion,
    'fixture must contain at least one tilted+elevated region to sample'
  ).toBeDefined()
  const sampleX = tiltedRegion!.x + Math.floor(tiltedRegion!.w / 2)
  const sampleY = tiltedRegion!.y + Math.floor(tiltedRegion!.h / 2)
  const sampleIdx = (sampleY * bakedPng.width + sampleX) * 4
  const [r, g, b] = [
    bakedPng.data[sampleIdx]!,
    bakedPng.data[sampleIdx + 1]!,
    bakedPng.data[sampleIdx + 2]!,
  ]
  expect(
    r !== 128 || g !== 128,
    `region ${JSON.stringify(tiltedRegion)} sampled as flat (128,128) in R/G`
  ).toBe(true)
  expect(b).toBe(Math.round(tiltedRegion!.elevation! * 255))
})
