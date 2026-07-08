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

// Follow-up #33 / C1: right-clicking the .normal.json sidecar (not just its
// source .png) also opens the baker — register.ts's resolveImageForCommand
// resolves the sidecar path to its paired source image via
// pngPathFromNormalJson. The panel title still reads the PNG's filename
// (host.ts titles by the resolved image, not the clicked file), proving the
// resolution actually happened rather than the command silently no-oping.
test('FL Normal Baker opens from the .normal.json sidecar, resolving to its paired image', async ({
  openCommand,
  webviewFrame,
}) => {
  await openCommand('threeFlatland.normalBaker.open', ['sprites/Dungeon_Tileset.normal.json'])

  const frame = await webviewFrame('Normal Baker: Dungeon_Tileset.png')

  await expect(frame.locator('vscode-toolbar-container')).toBeVisible()
})

// #38 pair-open safety: a baked X.normal.png ends in .png, so before the
// fix it fell into the generic image branch and opened AS the source —
// the wrong half of the pair. resolveImageForCommand now checks
// .normal.png before plain .png and hot-swaps to the source tileset
// (sourcePngFromNormalPng, verified on disk). The panel title is the
// HOST-level proof: it reads the resolved image's filename, so
// `Dungeon_Tileset.png` (not `…normal.png`) means the resolution ran —
// deliberately no webview-internals assertions here, so this survives
// the baker webview redesign.
test('FL Normal Baker opens from the baked .normal.png, resolving to its SOURCE tileset', async ({
  openCommand,
  webviewFrame,
}) => {
  await openCommand('threeFlatland.normalBaker.open', ['sprites/Dungeon_Tileset.normal.png'])

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

// ── Grid slice + split (C3) ───────────────────────────────────────────────

test('grid slice: Generate creates one region per aligned tile on Dungeon_Tileset', async ({
  openCommand,
  webviewFrame,
}) => {
  await openCommand('threeFlatland.normalBaker.open', ['sprites/Dungeon_Tileset.png'])
  const frame = await webviewFrame('Normal Baker: Dungeon_Tileset.png')

  // Document loaded (the fixture's 122 regions) before driving anything —
  // same init-landed discipline as the zzfx suite's Save tests.
  await expect(frame.getByText('Regions (122)')).toBeVisible()

  await frame.getByTitle('Grid Slice').click()

  // Default 16px tiles on the 160×160 tileset = a full 10×10 grid. The
  // button label carries the exact count (the count-confirm), and only
  // reads 100 once the image has decoded and the grid materialized — so
  // this locator doubles as the image-ready wait.
  const generate = frame.getByText('Generate 100 regions', { exact: true })
  await expect(generate).toBeVisible()
  await generate.click()

  await expect(frame.getByText('Regions (222)')).toBeVisible()
})

test('split: 2×2 on a tilted region replaces it with 4 children inheriting exactly its explicit fields', async ({
  baseDir,
  openCommand,
  webviewFrame,
}) => {
  await openCommand('threeFlatland.normalBaker.open', ['sprites/Dungeon_Tileset.png'])
  const frame = await webviewFrame('Normal Baker: Dungeon_Tileset.png')
  await expect(frame.getByText('Regions (122)')).toBeVisible()

  // Select the fixture's {x:16, y:4, w:16, h:12, direction:'south',
  // elevation:0.5} region via its (unique) coords text in the list.
  await frame.getByText('16,4 16×12', { exact: true }).click()

  // Split section defaults to 2×2 → 4 pieces for this 16×12 region.
  await frame.getByText('Split into 4 regions', { exact: true }).click()
  await expect(frame.getByText('Regions (125)')).toBeVisible()

  // Persist and assert the fidelity semantics on the actual sidecar JSON:
  // children carry what the parent EXPLICITLY had (direction, elevation)
  // and nothing it merely inherited (pitch/bump/strength stay omitted so
  // they keep tracking the descriptor default live).
  await frame.getByTitle('Save (.normal.png + .normal.json)').click()
  const jsonOut = path.join(baseDir, 'sprites', 'Dungeon_Tileset.normal.json')
  await expect
    .poll(async () => {
      try {
        const d = JSON.parse(await fs.readFile(jsonOut, 'utf8')) as NormalSourceDescriptor
        return d.regions?.length ?? 0
      } catch {
        return 0
      }
    })
    .toBe(125)

  const descriptor = JSON.parse(await fs.readFile(jsonOut, 'utf8')) as NormalSourceDescriptor
  const children = descriptor.regions!.filter((r) => r.w === 8 && r.h === 6)
  expect(children).toHaveLength(4)
  expect(children.map((r) => `${r.x},${r.y}`).sort()).toEqual(['16,10', '16,4', '24,10', '24,4'])
  for (const child of children) {
    expect(child.direction).toBe('south')
    expect(child.elevation).toBe(0.5)
    expect('pitch' in child).toBe(false)
    expect('bump' in child).toBe(false)
    expect('strength' in child).toBe(false)
  }
  // The parent is gone — replaced, not duplicated.
  expect(descriptor.regions!.some((r) => r.x === 16 && r.y === 4 && r.w === 16 && r.h === 12)).toBe(
    false
  )
})
