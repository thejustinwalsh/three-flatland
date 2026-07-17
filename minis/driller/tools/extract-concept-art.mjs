import { access, readFile, mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const manifestPath = join(ROOT, 'art/extract-manifest.json')
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
const source = join(ROOT, 'art', manifest.source)
const outDir = join(ROOT, 'src/assets/driller')
const fixerInputDir = join(ROOT, 'art/pixel-fixer/input')
const fixerOutputDir = join(ROOT, 'art/pixel-fixer/output')
const frameSize = manifest.frameSize
const atlasPadding = 2
const atlasFrameSize = frameSize + atlasPadding * 2
const columns = Math.max(...Object.values(manifest.animations).map((frames) => frames.length))
const rows = Object.keys(manifest.animations).length

await access(source)

if (process.argv.includes('--check-paths')) {
  console.log(`manifest: ${manifestPath}`)
  console.log(`source: ${source}`)
  console.log(`fixer input: ${fixerInputDir}`)
  console.log(`fixer output: ${fixerOutputDir}`)
  console.log(`runtime output: ${outDir}`)
  process.exit(0)
}

await mkdir(outDir, { recursive: true })

const TILE_SIZE = 16
const TILE_PADDING = 2
const TILE_SLOT_SIZE = TILE_SIZE + TILE_PADDING * 2
const AUTOTILE_SPECS = makeAutotileSpecs()
const ATLAS_COLUMNS = AUTOTILE_SPECS.length
const BIOME_ROWS = 5
const AUTOTILE_MINI_DIR = join(ROOT, 'art/autotile-minis')
await mkdir(AUTOTILE_MINI_DIR, { recursive: true })

// Webtyler's five-tile "minitiles" contract: isolated, vertical,
// horizontal, four-way with every diagonal open, and fully interior.
const WEBTYLER_MINI_SPECS = [
  { cardinalMask: 0, missingCornerMask: 0 },
  { cardinalMask: 3, missingCornerMask: 0 },
  { cardinalMask: 12, missingCornerMask: 0 },
  { cardinalMask: 15, missingCornerMask: 15 },
  { cardinalMask: 15, missingCornerMask: 0 },
]

// Apache-2.0 Webtyler minitile section source indices, compressed from its
// public `minitiles_data` table. Each digit selects one of the five inputs for
// a 3x3 tile section; with zero margin offsets the middle sections are empty.
const WEBTYLER_MINITILE_SECTIONS = [
  '000111111',
  '002002113',
  '222222333',
  '200200311',
  '443443333',
  '222244344',
  '222442443',
  '344344333',
  '002044144',
  '333444444',
  '222444444',
  '200440441',
  '111111111',
  '113113113',
  '333333333',
  '311311311',
  '113144144',
  '344444444',
  '443444444',
  '311441441',
  '144144144',
  '344444443',
  'xxxxxxxxx',
  '443443443',
  '111111000',
  '113002002',
  '333222222',
  '311200200',
  '144144113',
  '444444344',
  '444444443',
  '441441311',
  '344344344',
  '444444444',
  '443444344',
  '441441441',
  '000000000',
  '022022022',
  '222222222',
  '220220220',
  '333443443',
  '344244222',
  '443442222',
  '333344344',
  '144044002',
  '444444222',
  '444444333',
  '441440200',
]

// Godot's official 3x3-minimal atlas positions, read from the canonical
// template. Keys use Driller's `cardinalMask:missingCornerMask` convention.
const WEBTYLER_GODOT_SPECS = [
  '2:0',
  '6:8',
  '14:12',
  '10:4',
  '15:14',
  '14:4',
  '14:8',
  '15:13',
  '6:0',
  '15:3',
  '14:0',
  '10:0',
  '3:0',
  '7:10',
  '15:15',
  '11:5',
  '7:2',
  '15:1',
  '15:2',
  '11:1',
  '7:0',
  '15:9',
  null,
  '15:10',
  '1:0',
  '5:2',
  '13:3',
  '9:1',
  '7:8',
  '15:4',
  '15:8',
  '11:4',
  '15:5',
  '15:0',
  '15:6',
  '11:0',
  '0:0',
  '4:0',
  '12:0',
  '8:0',
  '15:11',
  '13:1',
  '13:2',
  '15:7',
  '5:0',
  '13:0',
  '15:12',
  '9:0',
]

// Presentation-sheet cells are roughly 2× native resolution and separated
// by gutters. Collapse each named source cell to a true 16×16 pixel tile.
// The first 15 cells cover exposed/edge variants; frame 15 is the enclosed
// interior tile from the INNER (SOIL) row.
const soilCells = []
for (const y of [90, 141, 192]) {
  for (const x of [790, 829, 868, 908, 947]) soilCells.push([x, y, 39, 42])
}
soilCells.push([790, 270, 39, 39])

const stoneCells = []
for (const y of [72, 121, 170, 219, 268]) {
  for (const x of [1009, 1057, 1105]) stoneCells.push([x, y, 45, 43])
}
// The sheet presents 15 stone shapes; repeat the full block for mask 15.
stoneCells.push(stoneCells[14])

const fixtureCells = [
  [1173, 80, 48, 60],
  [1216, 80, 48, 60],
  [1259, 80, 48, 60],
  [1305, 80, 56, 60],
  [1173, 174, 48, 62],
  [1217, 174, 48, 62],
  [1261, 174, 48, 62],
  [1305, 174, 56, 62],
  [1173, 260, 48, 51],
  [1217, 260, 48, 51],
  [1261, 260, 48, 51],
  [1305, 260, 56, 51],
  [790, 535, 55, 72], // stone pillar prop
  [1024, 474, 60, 58], // crate prop
  [1019, 403, 53, 65], // torch / explosive stand-in
  [1019, 403, 53, 65],
]

const GEM_CELL_SIZE = 24
const GEM_RENDERED_SIZES = [8, 11, 16, 22]
const gemRows = [382, 436, 489, 542]
const gemColumns = [
  [1221, 30],
  [1287, 40],
  [1358, 48],
  [1427, 76],
]

const actionCells = [
  { name: 'add-support', rect: [829, 950, 32, 36] },
  { name: 'boost-drill', rect: [889, 950, 32, 36] },
  { name: 'shield', rect: [952, 950, 32, 36] },
  { name: 'drop-rocks', rect: [1014, 950, 32, 36] },
  { name: 'chaos-quake', rect: [1076, 950, 32, 36] },
]

if (process.argv.includes('--stage-fixer-inputs')) {
  await emitFixerInputs()
  process.exit(0)
}
if (process.argv.includes('--preview-fixed-character')) {
  await previewFixedCharacters()
  process.exit(0)
}

const soilTiles = await Promise.all(
  soilCells.map((_, index) => readFixedAsset(`tile-soil-${String(index).padStart(2, '0')}.png`))
)
const stoneTiles = await Promise.all(
  stoneCells.map((_, index) => readFixedAsset(`tile-stone-${String(index).padStart(2, '0')}.png`))
)
// The concept's inner samples are freestanding clods with transparent outer
// pixels. Runtime interior cells must be opaque; this is the same nearest-pixel
// extension used by the original 16-frame atlas that established the look.
soilTiles[15] = await fillTransparentInterior(soilTiles[15])
stoneTiles[15] = await fillTransparentInterior(stoneTiles[15])
const fixtureTiles = await Promise.all(
  fixtureCells.map((_, index) => readFixedAsset(`fixture-${String(index).padStart(2, '0')}.png`))
)

const gemComposites = []
for (let row = 0; row < gemRows.length; row++) {
  for (let column = 0; column < gemColumns.length; column++) {
    const input = await readFixedAsset(
      `gem-${String(row).padStart(2, '0')}-${String(column).padStart(2, '0')}.png`
    )
    const metadata = await sharp(input).metadata()
    gemComposites.push({
      input,
      left: column * GEM_CELL_SIZE + Math.floor((GEM_CELL_SIZE - (metadata.width ?? 0)) / 2),
      top: row * GEM_CELL_SIZE + Math.floor((GEM_CELL_SIZE - (metadata.height ?? 0)) / 2),
    })
  }
}
await sharp({
  create: {
    width: gemColumns.length * GEM_CELL_SIZE,
    height: gemRows.length * GEM_CELL_SIZE,
    channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  },
})
  .composite(gemComposites)
  .png({ palette: true, colours: 256 })
  .toFile(join(outDir, 'gem-pickups-atlas.png'))
await writeFile(
  join(outDir, 'gem-pickups-atlas.json'),
  `${JSON.stringify(
    {
      image: 'gem-pickups-atlas.png',
      cellSize: GEM_CELL_SIZE,
      columns: ['small', 'medium', 'large', 'huge'],
      rows: ['emerald', 'topaz', 'ruby', 'amethyst'],
      renderedSizes: GEM_RENDERED_SIZES,
      frames: 'tight-alpha-bounds',
    },
    null,
    2
  )}\n`
)

const actionComposites = []
for (let column = 0; column < actionCells.length; column++) {
  const input = await readFixedAsset(`action-${actionCells[column].name}.png`)
  const metadata = await sharp(input).metadata()
  const width = metadata.width ?? 0
  const height = metadata.height ?? 0
  if (width > TILE_SIZE || height > TILE_SIZE) {
    throw new Error(
      `Fixed action icon ${actionCells[column].name} exceeds ${TILE_SIZE}x${TILE_SIZE}`
    )
  }
  actionComposites.push({
    input,
    left: column * TILE_SLOT_SIZE + TILE_PADDING + Math.floor((TILE_SIZE - width) / 2),
    top: TILE_PADDING + Math.floor((TILE_SIZE - height) / 2),
  })
}
await sharp({
  create: {
    width: actionCells.length * TILE_SLOT_SIZE,
    height: TILE_SLOT_SIZE,
    channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  },
})
  .composite(actionComposites)
  .png({ palette: true, colours: 256 })
  .toFile(join(outDir, 'action-icons.png'))
await writeFile(
  join(outDir, 'action-icons.json'),
  `${JSON.stringify(
    {
      image: 'action-icons.png',
      tileSize: TILE_SIZE,
      padding: TILE_PADDING,
      slotSize: TILE_SLOT_SIZE,
      columns: actionCells.map(({ name }) => name),
      source: 'help-sabotage-actions',
      frames: 'pixel-fixer-output-centered-with-transparent-bleed',
    },
    null,
    2
  )}\n`
)
const atlasLayerDefinitions = [
  { name: 'topsoil-soil', base: soilTiles, transform: (image) => image },
  {
    name: 'deep-dirt-soil',
    base: soilTiles,
    transform: (image) => image.tint('#885534').modulate({ brightness: 0.82 }),
  },
  { name: 'stoneworks-soil', base: stoneTiles, transform: (image) => image.tint('#9aa0aa') },
  {
    name: 'crystal-caverns-soil',
    base: stoneTiles,
    transform: (image) => image.tint('#8d63bd'),
  },
  {
    name: 'core-soil',
    base: stoneTiles,
    transform: (image) => image.tint('#633a70').modulate({ brightness: 0.82 }),
  },
  { name: 'topsoil-stone', base: stoneTiles, transform: (image) => image },
  {
    name: 'deep-dirt-stone',
    base: stoneTiles,
    transform: (image) => image.modulate({ brightness: 0.74, saturation: 0.82 }),
  },
  {
    name: 'stoneworks-stone',
    base: stoneTiles,
    transform: (image) => image.tint('#a4a8b2'),
  },
  {
    name: 'crystal-caverns-stone',
    base: stoneTiles,
    transform: (image) => image.tint('#9869c5'),
  },
  {
    name: 'core-stone',
    base: stoneTiles,
    transform: (image) => image.tint('#74445f').modulate({ brightness: 0.78 }),
  },
]
const atlasLayers = await Promise.all(
  atlasLayerDefinitions.map(async (layer) => ({
    name: layer.name,
    kind: layer.base === soilTiles ? 'soil' : 'stone',
    sources: await Promise.all(
      layer.base.map((input) => layer.transform(sharp(input)).png().toBuffer())
    ),
  }))
)
const runtimeComposites = []
for (let row = 0; row < atlasLayers.length; row++) {
  const layer = atlasLayers[row]
  // Cell 15 is the concept sheet's authored interior texture and stays
  // pixel-for-pixel untouched. Webtyler's four boundary roles are derived by
  // cutting only their exposed sides/corners with the concept's rough edge
  // silhouettes. This preserves the original texture instead of repainting it.
  const miniTiles = []
  for (const spec of WEBTYLER_MINI_SPECS) {
    if (spec.cardinalMask === 15 && spec.missingCornerMask === 0) {
      miniTiles.push(layer.sources[15])
      continue
    }
    miniTiles.push(
      await buildTopologyTile(
        layer.sources[15],
        spec,
        conceptEdgeReferences(layer.sources, layer.kind, row === 0),
        row === 0 && (spec.cardinalMask & 1) === 0 ? layer.sources[0] : undefined
      )
    )
  }
  const miniAtlas = await sharp({
    create: {
      width: WEBTYLER_MINI_SPECS.length * TILE_SIZE,
      height: TILE_SIZE,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(miniTiles.map((input, index) => ({ input, left: index * TILE_SIZE, top: 0 })))
    .png({ palette: true, colours: 256 })
    .toBuffer()
  await writeFile(join(AUTOTILE_MINI_DIR, `${layer.name}.png`), miniAtlas)

  const webtylerFrames = await generateWebtylerFrames(miniTiles)
  for (let column = 0; column < AUTOTILE_SPECS.length; column++) {
    const spec = AUTOTILE_SPECS[column]
    const input = webtylerFrames.get(`${spec.cardinalMask}:${spec.missingCornerMask}`)
    if (!input) throw new Error(`Webtyler did not emit topology ${JSON.stringify(spec)}`)
    runtimeComposites.push({
      input,
      left: column * TILE_SLOT_SIZE + TILE_PADDING,
      top: row * TILE_SLOT_SIZE + TILE_PADDING,
    })
  }
}
for (let column = 0; column < fixtureTiles.length; column++) {
  runtimeComposites.push({
    input: fixtureTiles[column],
    left: column * TILE_SLOT_SIZE + TILE_PADDING,
    top: BIOME_ROWS * 2 * TILE_SLOT_SIZE + TILE_PADDING,
  })
}
await sharp({
  create: {
    width: ATLAS_COLUMNS * TILE_SLOT_SIZE,
    height: (BIOME_ROWS * 2 + 1) * TILE_SLOT_SIZE,
    channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  },
})
  .composite(runtimeComposites)
  .png({ palette: true, colours: 256 })
  .toFile(join(outDir, 'world-tiles.png'))

await writeFile(
  join(outDir, 'world-tiles.json'),
  `${JSON.stringify(
    {
      image: 'world-tiles.png',
      tileSize: TILE_SIZE,
      padding: TILE_PADDING,
      slotSize: TILE_SLOT_SIZE,
      columns: ATLAS_COLUMNS,
      rows: BIOME_ROWS * 2 + 1,
      biomes: {
        topsoil: { soilRow: 0, stoneRow: 5 },
        'deep-dirt': { soilRow: 1, stoneRow: 6 },
        stoneworks: { soilRow: 2, stoneRow: 7 },
        'crystal-caverns': { soilRow: 3, stoneRow: 8 },
        core: { soilRow: 4, stoneRow: 9 },
      },
      autotile: {
        generator: 'wareya/webtyler:minitiles',
        miniInputs: atlasLayers.map(({ name }) => `art/autotile-minis/${name}.png`),
        maskBits: { north: 1, south: 2, east: 4, west: 8 },
        cornerBits: { northwest: 1, northeast: 2, southwest: 4, southeast: 8 },
        frameCount: AUTOTILE_SPECS.length,
        frames: AUTOTILE_SPECS,
      },
      fixtures: {
        row: 10,
        renderMode: 'biome-stone-base-with-decoration-overlay',
        boneColumns: [0, 1, 2, 3],
        mushroomColumns: [4, 5, 6, 7],
        crystalColumns: [8, 9, 10, 11],
        pillarColumn: 12,
        crateColumn: 13,
        torchColumn: 14,
        explosiveColumn: 15,
      },
    },
    null,
    2
  )}\n`
)

const collectionMap = {}
for (const [name, [left, top, width, height]] of Object.entries(manifest.collections ?? {})) {
  const { data, info } = await sharp(source)
    .extract({ left, top, width, height })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  removeConnectedBackdrop(data, info.width, info.height)
  const file = `${name}.png`
  await sharp(data, { raw: info }).png({ palette: true, colours: 256 }).toFile(join(outDir, file))
  collectionMap[name] = { image: file, width, height, sourceRect: [left, top, width, height] }
}

// The complete footer panel is the authored title billboard. It goes through
// Pixel Art Fixer as an isolated final cutout; connected backdrop removal
// makes only the area outside its rounded sign silhouette transparent.
const titleSourceRect = manifest.collections?.['title-attract']
if (titleSourceRect) {
  const titleFile = 'title-attract.png'
  const titleInput = await readFixedAsset(titleFile)
  const titleMetadata = await sharp(titleInput).metadata()
  const titleWidth = titleMetadata.width ?? 0
  const titleHeight = titleMetadata.height ?? 0
  await sharp(titleInput).png({ palette: true, colours: 256 }).toFile(join(outDir, titleFile))
  collectionMap['title-attract'] = {
    image: titleFile,
    width: titleWidth,
    height: titleHeight,
    sourceRect: titleSourceRect,
    pixelFixer: { step: 2.75, crop: null },
  }
}

const extracted = []
const animationMap = {}
let row = 0

for (const [name, frames] of Object.entries(manifest.animations)) {
  animationMap[name] = {
    row,
    frames: frames.length,
    frameSize: atlasFrameSize,
    padding: atlasPadding,
    anchor: manifest.characterAnchor.map((value) => value + atlasPadding),
  }
  for (let column = 0; column < frames.length; column++) {
    const file = join(fixerOutputDir, `character-${name}-${String(column).padStart(2, '0')}.png`)
    const input = await readFile(file)
    const metadata = await sharp(input).metadata()
    const anchor = await characterAnchor(file, name, column)
    const left = column * atlasFrameSize + atlasPadding + manifest.characterAnchor[0] - anchor.x
    const top = row * atlasFrameSize + atlasPadding + manifest.characterAnchor[1] - anchor.y
    if (
      left < column * atlasFrameSize + atlasPadding ||
      top < row * atlasFrameSize + atlasPadding ||
      left + (metadata.width ?? 0) > (column + 1) * atlasFrameSize - atlasPadding ||
      top + (metadata.height ?? 0) > (row + 1) * atlasFrameSize - atlasPadding
    ) {
      throw new Error(
        `Character frame ${name}:${column} violates its ${atlasPadding}px atlas padding`
      )
    }
    extracted.push({ input, left, top })
  }
  row++
}

const atlas = sharp({
  create: {
    width: columns * atlasFrameSize,
    height: rows * atlasFrameSize,
    channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  },
})
  .composite(extracted)
  .png({ palette: true, colours: 256 })

await atlas.toFile(join(outDir, 'driller-animations.png'))
await writeFile(
  join(outDir, 'driller-animations.json'),
  `${JSON.stringify({ image: 'driller-animations.png', width: columns * atlasFrameSize, height: rows * atlasFrameSize, animations: animationMap }, null, 2)}\n`
)
await writeFile(
  join(outDir, 'world-art.json'),
  `${JSON.stringify({ source: manifest.source, collections: collectionMap }, null, 2)}\n`
)

function removeConnectedBackdrop(data, width, height) {
  const visited = new Uint8Array(width * height)
  const queue = []
  for (let x = 0; x < width; x++) {
    queue.push(x, (height - 1) * width + x)
  }
  for (let y = 0; y < height; y++) {
    queue.push(y * width, y * width + width - 1)
  }
  for (let head = 0; head < queue.length; head++) {
    const index = queue[head]
    if (visited[index]) continue
    visited[index] = 1
    const p = index * 4
    const r = data[p]
    const g = data[p + 1]
    const b = data[p + 2]
    // The sheet backdrop is blue-black. Flood-fill only backdrop-like
    // pixels connected to a crop edge so black character outlines survive.
    if (!(b < 45 && g < 32 && r < 28 && b >= g)) continue
    data[p + 3] = 0
    const x = index % width
    const y = Math.floor(index / width)
    if (x > 0) queue.push(index - 1)
    if (x + 1 < width) queue.push(index + 1)
    if (y > 0) queue.push(index - width)
    if (y + 1 < height) queue.push(index + width)
  }
}

async function emitFixerInputs() {
  await mkdir(fixerInputDir, { recursive: true })
  const titleRect = manifest.collections?.['title-attract']
  if (titleRect) await saveRawCutout('title-attract.png', titleRect, 0, false)
  for (const action of actionCells) {
    await saveRawCutout(`action-${action.name}.png`, action.rect)
  }
  for (const [name, frames] of Object.entries(manifest.animations)) {
    for (let index = 0; index < frames.length; index++) {
      await saveRawCutout(`character-${name}-${String(index).padStart(2, '0')}.png`, frames[index])
    }
  }
  for (let index = 0; index < soilCells.length; index++) {
    await saveRawCutout(
      `tile-soil-${String(index).padStart(2, '0')}.png`,
      soilCells[index],
      0,
      false
    )
  }
  for (let index = 0; index < stoneCells.length; index++) {
    await saveRawCutout(
      `tile-stone-${String(index).padStart(2, '0')}.png`,
      stoneCells[index],
      0,
      false
    )
  }
  for (let index = 0; index < fixtureCells.length; index++) {
    await saveRawCutout(
      `fixture-${String(index).padStart(2, '0')}.png`,
      fixtureCells[index],
      0,
      false
    )
  }
  for (let row = 0; row < gemRows.length; row++) {
    for (let column = 0; column < gemColumns.length; column++) {
      const [left, width] = gemColumns[column]
      await saveRawCutout(
        `gem-${String(row).padStart(2, '0')}-${String(column).padStart(2, '0')}.png`,
        [left, gemRows[row], width, 51],
        (row === 1 || row === 2) && column < 3 ? 7 : 0,
        false
      )
    }
  }
  console.log(`Staged isolated assets in ${fixerInputDir}`)
}

async function previewFixedCharacters() {
  const previewScale = 3
  // Mirror the real 64px atlas cell exactly. The previous 160px preview
  // clipped drillLeft's one-tile reach even though the production atlas was
  // valid, which made the anchor QA sheet report a false boundary failure.
  const cellSize = atlasFrameSize * previewScale
  const previewColumns = columns
  const previewRows = rows
  const anchorX = (manifest.characterAnchor[0] + atlasPadding) * previewScale
  const baselineY = (manifest.characterAnchor[1] + atlasPadding) * previewScale
  const background = await sharp({
    create: {
      width: previewColumns * cellSize,
      height: previewRows * cellSize,
      channels: 4,
      background: { r: 11, g: 18, b: 29, alpha: 1 },
    },
  })
    .png()
    .toBuffer()
  const guides = Buffer.from(
    `<svg width="${previewColumns * cellSize}" height="${previewRows * cellSize}" xmlns="http://www.w3.org/2000/svg">` +
      Array.from({ length: previewRows }, (_, row) =>
        Array.from({ length: previewColumns }, (_, column) => {
          const x = column * cellSize
          const y = row * cellSize
          return `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" fill="none" stroke="#24364a"/><path d="M${x + anchorX} ${y + 8}V${y + cellSize - 8}M${x + 8} ${y + baselineY}H${x + cellSize - 8}" stroke="#ff3fb4" stroke-opacity=".7"/>`
        }).join('')
      ).join('') +
      '</svg>'
  )
  const composites = [{ input: guides }]
  let row = 0
  for (const [name, frames] of Object.entries(manifest.animations)) {
    for (let column = 0; column < frames.length; column++) {
      const file = join(fixerOutputDir, `character-${name}-${String(column).padStart(2, '0')}.png`)
      const metadata = await sharp(file).metadata()
      const anchor = await characterAnchor(file, name, column)
      const width = (metadata.width ?? 1) * previewScale
      const height = (metadata.height ?? 1) * previewScale
      const input = await sharp(file).resize({ width, height, kernel: 'nearest' }).png().toBuffer()
      composites.push({
        input,
        left: column * cellSize + anchorX - anchor.x * previewScale,
        top: row * cellSize + baselineY - anchor.y * previewScale,
      })
    }
    row++
  }
  const previewFile = join(ROOT, 'art/pixel-fixer/character-anchor-preview.png')
  await sharp(background).composite(composites).png().toFile(previewFile)
  console.log(`Wrote ${previewFile}`)
}

async function readFixedAsset(file) {
  return readFile(join(fixerOutputDir, file))
}

async function fillTransparentInterior(input) {
  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const pixelCount = info.width * info.height
  const nearest = new Int32Array(pixelCount)
  nearest.fill(-1)
  const queue = new Int32Array(pixelCount)
  let head = 0
  let tail = 0

  for (let index = 0; index < pixelCount; index++) {
    if (data[index * 4 + 3] === 0) continue
    nearest[index] = index
    queue[tail++] = index
  }
  if (tail === 0) throw new Error('Cannot extend an empty interior tile')

  while (head < tail) {
    const index = queue[head++]
    const x = index % info.width
    const y = Math.floor(index / info.width)
    const neighbors = []
    if (x > 0) neighbors.push(index - 1)
    if (x + 1 < info.width) neighbors.push(index + 1)
    if (y > 0) neighbors.push(index - info.width)
    if (y + 1 < info.height) neighbors.push(index + info.width)
    for (const neighbor of neighbors) {
      if (nearest[neighbor] !== -1) continue
      nearest[neighbor] = nearest[index]
      queue[tail++] = neighbor
    }
  }

  for (let index = 0; index < pixelCount; index++) {
    if (data[index * 4 + 3] !== 0) continue
    const sourceOffset = nearest[index] * 4
    const targetOffset = index * 4
    data[targetOffset] = data[sourceOffset]
    data[targetOffset + 1] = data[sourceOffset + 1]
    data[targetOffset + 2] = data[sourceOffset + 2]
    data[targetOffset + 3] = 255
  }
  return sharp(data, { raw: info }).png().toBuffer()
}

function makeAutotileSpecs() {
  const frames = []
  for (let cardinalMask = 0; cardinalMask < 16; cardinalMask++) {
    const north = (cardinalMask & 1) !== 0
    const south = (cardinalMask & 2) !== 0
    const east = (cardinalMask & 4) !== 0
    const west = (cardinalMask & 8) !== 0
    let eligible = 0
    if (north && west) eligible |= 1
    if (north && east) eligible |= 2
    if (south && west) eligible |= 4
    if (south && east) eligible |= 8
    for (let missingCornerMask = 0; missingCornerMask < 16; missingCornerMask++) {
      if ((missingCornerMask & ~eligible) !== 0) continue
      frames.push({ cardinalMask, missingCornerMask })
    }
  }
  if (frames.length !== 47)
    throw new Error(`Expected 47 valid autotile frames, got ${frames.length}`)
  return frames
}

/** Generate Webtyler's canonical 12x4 Godot atlas, then expose its 47 tiles by topology. */
async function generateWebtylerFrames(miniTiles) {
  const sourceData = await Promise.all(
    miniTiles.map((input) => sharp(input).ensureAlpha().raw().toBuffer())
  )
  const atlasWidth = 12 * TILE_SIZE
  const atlas = Buffer.alloc(atlasWidth * 4 * TILE_SIZE * 4)
  for (let targetIndex = 0; targetIndex < WEBTYLER_MINITILE_SECTIONS.length; targetIndex++) {
    const pattern = WEBTYLER_MINITILE_SECTIONS[targetIndex]
    if (pattern[0] === 'x') continue
    const targetColumn = targetIndex % 12
    const targetRow = Math.floor(targetIndex / 12)
    for (const sectionY of [0, 2]) {
      for (const sectionX of [0, 2]) {
        const sourceIndex = Number(pattern[sectionY * 3 + sectionX])
        const source = sourceData[sourceIndex]
        const offsetX = sectionX === 0 ? 0 : TILE_SIZE / 2
        const offsetY = sectionY === 0 ? 0 : TILE_SIZE / 2
        for (let y = 0; y < TILE_SIZE / 2; y++) {
          const sourceOffset = ((offsetY + y) * TILE_SIZE + offsetX) * 4
          const targetOffset =
            ((targetRow * TILE_SIZE + offsetY + y) * atlasWidth +
              targetColumn * TILE_SIZE +
              offsetX) *
            4
          source.copy(atlas, targetOffset, sourceOffset, sourceOffset + (TILE_SIZE / 2) * 4)
        }
      }
    }
  }

  const frames = new Map()
  for (let sourceIndex = 0; sourceIndex < WEBTYLER_GODOT_SPECS.length; sourceIndex++) {
    const key = WEBTYLER_GODOT_SPECS[sourceIndex]
    if (!key) continue
    const sourceColumn = sourceIndex % 12
    const sourceRow = Math.floor(sourceIndex / 12)
    const frame = Buffer.alloc(TILE_SIZE * TILE_SIZE * 4)
    for (let y = 0; y < TILE_SIZE; y++) {
      const sourceOffset = ((sourceRow * TILE_SIZE + y) * atlasWidth + sourceColumn * TILE_SIZE) * 4
      atlas.copy(frame, y * TILE_SIZE * 4, sourceOffset, sourceOffset + TILE_SIZE * 4)
    }
    frames.set(
      key,
      await sharp(frame, {
        raw: { width: TILE_SIZE, height: TILE_SIZE, channels: 4 },
      })
        .png()
        .toBuffer()
    )
  }
  if (frames.size !== AUTOTILE_SPECS.length) {
    throw new Error(`Expected ${AUTOTILE_SPECS.length} Webtyler frames, got ${frames.size}`)
  }
  return frames
}

/**
 * Reassemble pixel-fixed concept tiles into the placeholder SVG's topology
 * contract. Every frame starts with an authored soil/stone texture, borrows
 * its rough perimeter profiles from the concept edge pieces, and only uses
 * integer pixel copies. Connected sides remain tileable; exposed sides keep
 * the concept's chipped silhouette; missing diagonals form concave corners.
 * The surrounding atlas slot supplies transparent bleed padding.
 */
async function buildTopologyTile(baseInput, spec, edgeInputs, grassInput) {
  const { data, info } = await sharp(baseInput)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  if (info.width !== TILE_SIZE || info.height !== TILE_SIZE) {
    throw new Error(`Autotile base must be ${TILE_SIZE}x${TILE_SIZE}`)
  }

  if (grassInput && (spec.cardinalMask & 1) === 0) {
    const grass = await sharp(grassInput).ensureAlpha().raw().toBuffer()
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < TILE_SIZE; x++) {
        const offset = (y * TILE_SIZE + x) * 4
        if (grass[offset + 3] === 0) continue
        data[offset] = grass[offset]
        data[offset + 1] = grass[offset + 1]
        data[offset + 2] = grass[offset + 2]
      }
    }
  }

  const clear = (x, y) => {
    data[(y * TILE_SIZE + x) * 4 + 3] = 0
  }
  const copyColor = (targetX, targetY, sourceData, sourceX, sourceY) => {
    const sourceOffset = (sourceY * TILE_SIZE + sourceX) * 4
    const targetOffset = (targetY * TILE_SIZE + targetX) * 4
    if (sourceData[sourceOffset + 3] === 0) return
    data[targetOffset] = sourceData[sourceOffset]
    data[targetOffset + 1] = sourceData[sourceOffset + 1]
    data[targetOffset + 2] = sourceData[sourceOffset + 2]
    data[targetOffset + 3] = 255
  }
  const edgeSources = {}
  for (const [side, input] of Object.entries(edgeInputs)) {
    edgeSources[side] = await sharp(input).ensureAlpha().raw().toBuffer()
  }
  const edgeDepth = (side, position) => {
    const sourceData = edgeSources[side]
    for (let depth = 0; depth <= 3; depth++) {
      const x = side === 'west' ? depth : side === 'east' ? TILE_SIZE - 1 - depth : position
      const y = side === 'north' ? depth : side === 'south' ? TILE_SIZE - 1 - depth : position
      if (sourceData[(y * TILE_SIZE + x) * 4 + 3] !== 0) return depth
    }
    return 2
  }
  const copyEdgeColor = (side, position, depth) => {
    const sourceData = edgeSources[side]
    const x = side === 'west' ? depth : side === 'east' ? TILE_SIZE - 1 - depth : position
    const y = side === 'north' ? depth : side === 'south' ? TILE_SIZE - 1 - depth : position
    copyColor(
      side === 'west' ? depth : side === 'east' ? TILE_SIZE - 1 - depth : position,
      side === 'north' ? depth : side === 'south' ? TILE_SIZE - 1 - depth : position,
      sourceData,
      x,
      y
    )
  }

  const north = (spec.cardinalMask & 1) !== 0
  const south = (spec.cardinalMask & 2) !== 0
  const east = (spec.cardinalMask & 4) !== 0
  const west = (spec.cardinalMask & 8) !== 0

  if (!north) {
    const start = west ? 2 : 0
    const end = east ? TILE_SIZE - 2 : TILE_SIZE
    for (let x = start; x < end; x++) {
      const depth = edgeDepth('north', x)
      for (let y = 0; y < depth; y++) clear(x, y)
      copyEdgeColor('north', x, depth)
    }
  }
  if (!south) {
    const start = west ? 2 : 0
    const end = east ? TILE_SIZE - 2 : TILE_SIZE
    for (let x = start; x < end; x++) {
      const depth = edgeDepth('south', x)
      for (let offset = 0; offset < depth; offset++) clear(x, TILE_SIZE - 1 - offset)
      copyEdgeColor('south', x, depth)
    }
  }
  if (!west) {
    const start = north ? 2 : 0
    const end = south ? TILE_SIZE - 2 : TILE_SIZE
    for (let y = start; y < end; y++) {
      const depth = edgeDepth('west', y)
      for (let x = 0; x < depth; x++) clear(x, y)
      copyEdgeColor('west', y, depth)
    }
  }
  if (!east) {
    const start = north ? 2 : 0
    const end = south ? TILE_SIZE - 2 : TILE_SIZE
    for (let y = start; y < end; y++) {
      const depth = edgeDepth('east', y)
      for (let offset = 0; offset < depth; offset++) clear(TILE_SIZE - 1 - offset, y)
      copyEdgeColor('east', y, depth)
    }
  }

  const carveCorner = (corner) => {
    const right = corner === 2 || corner === 8
    const bottom = corner === 4 || corner === 8
    const x0 = right ? TILE_SIZE - 1 : 0
    const y0 = bottom ? TILE_SIZE - 1 : 0
    const dx = right ? -1 : 1
    const dy = bottom ? -1 : 1
    clear(x0, y0)
    clear(x0 + dx, y0)
    clear(x0, y0 + dy)
    const cornerSource = edgeSources.north
    copyColor(x0 + dx * 2, y0, cornerSource, x0 + dx * 2, y0)
    copyColor(x0 + dx, y0 + dy, cornerSource, x0 + dx, y0 + dy)
    copyColor(x0, y0 + dy * 2, cornerSource, x0, y0 + dy * 2)
  }
  for (const corner of [1, 2, 4, 8]) {
    if ((spec.missingCornerMask & corner) !== 0) carveCorner(corner)
  }

  return sharp(data, { raw: info }).png().toBuffer()
}

function conceptEdgeReferences(sources, kind, hasGrass = false) {
  if (kind === 'soil') {
    return {
      north: sources[hasGrass ? 0 : 10],
      south: sources[10],
      west: sources[1],
      east: sources[4],
    }
  }
  // Stone cell 0 is the cleanest authored freestanding block and carries
  // a distinct hand-drawn contour on every side.
  return { north: sources[0], south: sources[0], west: sources[0], east: sources[0] }
}

async function characterAnchor(file, animation, frameIndex) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const blueXs = []
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const offset = (y * info.width + x) * 4
      const r = data[offset]
      const g = data[offset + 1]
      const b = data[offset + 2]
      const alpha = data[offset + 3]
      if (alpha > 127 && b > r * 1.25 && b > g * 1.1 && b > 45) blueXs.push(x)
    }
  }
  blueXs.sort((a, b) => a - b)
  let x = blueXs.length > 0 ? blueXs[Math.floor(blueXs.length / 2)] : Math.floor(info.width / 2)
  let y = info.height

  if (animation === 'drillDown') y = Math.max(1, info.height - 16)
  if (animation === 'drillLeft' && frameIndex === 0) x = info.width - 8
  if (animation === 'drillRight' && frameIndex === 2) x = 8
  if (animation === 'dodge') x = [10, 32, 15, 12][frameIndex] ?? x

  return { x, y }
}

async function saveRawCutout(file, [left, top, width, height], clearBottom = 0, trim = true) {
  const { data, info } = await sharp(source)
    .extract({ left, top, width, height })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  removeConnectedBackdrop(data, info.width, info.height)
  removeIsolatedPixels(data, info.width, info.height)
  for (let y = Math.max(0, info.height - clearBottom); y < info.height; y++) {
    for (let x = 0; x < info.width; x++) data[(y * info.width + x) * 4 + 3] = 0
  }
  let image = sharp(data, { raw: info })
  if (trim) image = image.trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 1 })
  await image.png().toFile(join(fixerInputDir, file))
}

async function extractTile([left, top, width, height], contain) {
  const { data, info } = await sharp(source)
    .extract({ left, top, width, height })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  removeConnectedBackdrop(data, info.width, info.height)
  removeIsolatedPixels(data, info.width, info.height)
  let image = sharp(data, { raw: info }).trim({
    background: { r: 0, g: 0, b: 0, alpha: 0 },
    threshold: 1,
  })
  image = contain
    ? image.resize({
        width: TILE_SIZE,
        height: TILE_SIZE,
        fit: 'contain',
        position: 'south',
        kernel: 'nearest',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
    : image.resize({ width: TILE_SIZE, height: TILE_SIZE, fit: 'fill', kernel: 'nearest' })
  return image.png().toBuffer()
}

async function extractSprite([left, top, width, height], targetSize, clearBottom = 0) {
  const { data, info } = await sharp(source)
    .extract({ left, top, width, height })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  removeConnectedBackdrop(data, info.width, info.height)
  removeIsolatedPixels(data, info.width, info.height)
  for (let y = Math.max(0, info.height - clearBottom); y < info.height; y++) {
    for (let x = 0; x < info.width; x++) data[(y * info.width + x) * 4 + 3] = 0
  }
  return sharp(data, { raw: info })
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 1 })
    .resize({
      width: targetSize - 2,
      height: targetSize - 2,
      fit: 'contain',
      position: 'centre',
      kernel: 'nearest',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .extend({ top: 1, bottom: 1, left: 1, right: 1, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer()
}

/** Drop only fully isolated single pixels; multi-pixel dust and drill debris are intentional art. */
function removeIsolatedPixels(data, width, height) {
  const remove = []
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const index = y * width + x
      if (data[index * 4 + 3] === 0) continue
      let neighbors = 0
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          if ((ox !== 0 || oy !== 0) && data[((y + oy) * width + x + ox) * 4 + 3] !== 0) neighbors++
        }
      }
      if (neighbors === 0) remove.push(index)
    }
  }
  for (const index of remove) data[index * 4 + 3] = 0
}
