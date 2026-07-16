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
const ATLAS_COLUMNS = 16
const BIOME_ROWS = 5

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
const fixtureTiles = await Promise.all(
  fixtureCells.map((_, index) => readFixedAsset(`fixture-${String(index).padStart(2, '0')}.png`))
)

// The concept sheet draws even its "inner" terrain samples as freestanding
// clods. Mask 15 is different at runtime: it is the fully surrounded cell and
// must cover all 16×16 pixels or connected terrain exposes the clear color as
// a grid. Extend the existing pixel art outward without filtering so its
// palette and pixel cadence survive. Edge/corner masks intentionally keep
// their authored transparency.
soilTiles[15] = await fillTransparentInterior(soilTiles[15])
stoneTiles[15] = await fillTransparentInterior(stoneTiles[15])

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
const atlasLayers = [
  { base: soilTiles, transform: (image) => image },
  { base: soilTiles, transform: (image) => image.tint('#885534').modulate({ brightness: 0.82 }) },
  { base: stoneTiles, transform: (image) => image.tint('#9aa0aa') },
  { base: stoneTiles, transform: (image) => image.tint('#8d63bd') },
  { base: stoneTiles, transform: (image) => image.tint('#633a70').modulate({ brightness: 0.82 }) },
  { base: stoneTiles, transform: (image) => image },
  {
    base: stoneTiles,
    transform: (image) => image.modulate({ brightness: 0.74, saturation: 0.82 }),
  },
  { base: stoneTiles, transform: (image) => image.tint('#a4a8b2') },
  { base: stoneTiles, transform: (image) => image.tint('#9869c5') },
  { base: stoneTiles, transform: (image) => image.tint('#74445f').modulate({ brightness: 0.78 }) },
]
const runtimeComposites = []
for (let row = 0; row < atlasLayers.length; row++) {
  const layer = atlasLayers[row]
  for (let column = 0; column < layer.base.length; column++) {
    const input = await layer.transform(sharp(layer.base[column])).png().toBuffer()
    runtimeComposites.push({ input, left: column * TILE_SIZE, top: row * TILE_SIZE })
  }
}
for (let column = 0; column < fixtureTiles.length; column++) {
  const input = await sharp(stoneTiles[15])
    .composite([{ input: fixtureTiles[column] }])
    .png()
    .toBuffer()
  runtimeComposites.push({ input, left: column * TILE_SIZE, top: BIOME_ROWS * 2 * TILE_SIZE })
}
await sharp({
  create: {
    width: ATLAS_COLUMNS * TILE_SIZE,
    height: (BIOME_ROWS * 2 + 1) * TILE_SIZE,
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
        maskBits: { north: 1, south: 2, east: 4, west: 8 },
        maskToColumn: [11, 14, 2, 14, 13, 12, 3, 6, 13, 12, 3, 6, 8, 10, 0, 15],
        flipXMaskValues: [8, 9, 10, 11],
      },
      fixtures: {
        row: 10,
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

// The title is presentation art too, so it goes through Pixel Art Fixer as
// an isolated final cutout before entering the app. The corrected lockup is
// 119x27 at its recovered native grid. Keep only the authored game title and
// helmet here; the docs label and tiny concept-sheet strapline are UI copy,
// not part of the production logo.
const titleSourceRect = manifest.collections?.['title-attract']
if (titleSourceRect) {
  const titleFile = 'title-attract.png'
  const titleWidth = 119
  const titleHeight = 14
  await sharp(await readFixedAsset(titleFile))
    .extract({ left: 0, top: 5, width: titleWidth, height: titleHeight })
    .png({ palette: true, colours: 256 })
    .toFile(join(outDir, titleFile))
  collectionMap['title-attract'] = {
    image: titleFile,
    width: titleWidth,
    height: titleHeight,
    sourceRect: titleSourceRect,
    pixelFixer: { step: 2.75, crop: [0, 5, titleWidth, titleHeight] },
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
