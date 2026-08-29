#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises'
import { deflateSync, inflateSync } from 'node:zlib'

function fail(message) {
  console.error(message)
  process.exit(1)
}

function decodePng(bytes) {
  if (bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') fail('Expected PNG input')
  let offset = 8
  let width = 0
  let height = 0
  let bitDepth = 0
  let colorType = 0
  const chunks = []
  while (offset < bytes.length) {
    const length = bytes.readUInt32BE(offset)
    const type = bytes.subarray(offset + 4, offset + 8).toString('ascii')
    const data = bytes.subarray(offset + 8, offset + 8 + length)
    offset += length + 12
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      bitDepth = data[8]
      colorType = data[9]
      if (data[12] !== 0) fail('Interlaced PNGs are unsupported')
    } else if (type === 'IDAT') chunks.push(data)
    else if (type === 'IEND') break
  }
  if (bitDepth !== 8 || ![2, 6].includes(colorType)) fail('Expected 8-bit RGB or RGBA PNG')
  const channels = colorType === 6 ? 4 : 3
  const stride = width * channels
  const raw = inflateSync(Buffer.concat(chunks))
  const pixels = Buffer.alloc(width * height * 4)
  let source = 0
  let prior = Buffer.alloc(stride)
  for (let y = 0; y < height; y++) {
    const filter = raw[source++]
    const row = Buffer.from(raw.subarray(source, source + stride))
    source += stride
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? row[x - channels] : 0
      const up = prior[x]
      const upperLeft = x >= channels ? prior[x - channels] : 0
      if (filter === 1) row[x] = (row[x] + left) & 255
      else if (filter === 2) row[x] = (row[x] + up) & 255
      else if (filter === 3) row[x] = (row[x] + Math.floor((left + up) / 2)) & 255
      else if (filter === 4) {
        const p = left + up - upperLeft
        const distances = [Math.abs(p - left), Math.abs(p - up), Math.abs(p - upperLeft)]
        row[x] = (row[x] + (distances[0] <= distances[1] && distances[0] <= distances[2] ? left : distances[1] <= distances[2] ? up : upperLeft)) & 255
      } else if (filter !== 0) fail(`Unsupported PNG filter ${filter}`)
    }
    for (let x = 0; x < width; x++) {
      const input = x * channels
      const output = (y * width + x) * 4
      pixels[output] = row[input]
      pixels[output + 1] = row[input + 1]
      pixels[output + 2] = row[input + 2]
      pixels[output + 3] = channels === 4 ? row[input + 3] : 255
    }
    prior = row
  }
  return { width, height, pixels }
}

const linear = (value) => {
  const v = value / 255
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}

function summarize(image) {
  const values = []
  let energy = 0
  let red = 0
  let green = 0
  let blue = 0
  let dark = 0
  let clipped = 0
  let edge = 0
  for (let i = 0; i < image.width * image.height; i++) {
    const p = i * 4
    const r = image.pixels[p]
    const g = image.pixels[p + 1]
    const b = image.pixels[p + 2]
    const luminance = 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
    values.push(luminance)
    energy += luminance
    red += r / 255
    green += g / 255
    blue += b / 255
    if (luminance < 0.02) dark++
    if (r >= 250 || g >= 250 || b >= 250) clipped++
    const x = i % image.width
    if (x > 0) edge += Math.abs(luminance - values[i - 1])
    if (i >= image.width) edge += Math.abs(luminance - values[i - image.width])
  }
  values.sort((a, b) => a - b)
  const count = values.length
  const percentile = (q) => values[Math.min(count - 1, Math.floor((count - 1) * q))]
  return {
    width: image.width,
    height: image.height,
    meanLuminance: energy / count,
    totalLuminance: energy,
    p10Luminance: percentile(0.1),
    p50Luminance: percentile(0.5),
    p90Luminance: percentile(0.9),
    darkPixelRatio: dark / count,
    clippedPixelRatio: clipped / count,
    meanRgb: [red / count, green / count, blue / count],
    edgeEnergyPerPixel: edge / count,
  }
}

function compare(a, b) {
  if (a.width !== b.width || a.height !== b.height) fail('PNG dimensions must match')
  const count = a.width * a.height
  let absolute = 0
  let squared = 0
  let changed = 0
  for (let i = 0; i < count; i++) {
    let pixelChanged = false
    for (let channel = 0; channel < 3; channel++) {
      const delta = (a.pixels[i * 4 + channel] - b.pixels[i * 4 + channel]) / 255
      absolute += Math.abs(delta)
      squared += delta * delta
      if (Math.abs(delta) > 2 / 255) pixelChanged = true
    }
    if (pixelChanged) changed++
  }
  return {
    meanAbsoluteError: absolute / (count * 3),
    rootMeanSquareError: Math.sqrt(squared / (count * 3)),
    changedPixelRatio: changed / count,
  }
}

function crc32(bytes) {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return (crc ^ 0xffffffff) >>> 0
}

function pngChunk(type, data) {
  const name = Buffer.from(type)
  const body = Buffer.concat([name, data])
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const checksum = Buffer.alloc(4)
  checksum.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, checksum])
}

function encodePng(width, height, pixels) {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = 6
  const rows = Buffer.alloc(height * (width * 4 + 1))
  for (let y = 0; y < height; y++) {
    const output = y * (width * 4 + 1)
    rows[output] = 0
    pixels.copy(rows, output + 1, y * width * 4, (y + 1) * width * 4)
  }
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(rows)),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

function makeDifferenceImage(a, b) {
  const pixels = Buffer.alloc(a.width * a.height * 4)
  for (let i = 0; i < a.width * a.height; i++) {
    const output = i * 4
    for (let channel = 0; channel < 3; channel++) {
      pixels[output + channel] = Math.min(255, Math.abs(a.pixels[output + channel] - b.pixels[output + channel]) * 4)
    }
    pixels[output + 3] = 255
  }
  return encodePng(a.width, a.height, pixels)
}

const args = process.argv.slice(2)
if (args.length < 2) fail('Usage: compare-png.mjs baseline.png candidate.png [metrics.json] [difference.png]')
const baseline = decodePng(await readFile(args[0]))
const candidate = decodePng(await readFile(args[1]))
const baselineStats = summarize(baseline)
const candidateStats = summarize(candidate)
const relative = (next, prior) => (prior === 0 ? null : (next - prior) / prior)
const output = {
  baseline: baselineStats,
  candidate: candidateStats,
  comparison: {
    ...compare(baseline, candidate),
    meanLuminanceDeltaRatio: relative(candidateStats.meanLuminance, baselineStats.meanLuminance),
    totalLuminanceDeltaRatio: relative(candidateStats.totalLuminance, baselineStats.totalLuminance),
    darkPixelRatioDelta: candidateStats.darkPixelRatio - baselineStats.darkPixelRatio,
    clippedPixelRatioDelta: candidateStats.clippedPixelRatio - baselineStats.clippedPixelRatio,
    edgeEnergyDeltaRatio: relative(candidateStats.edgeEnergyPerPixel, baselineStats.edgeEnergyPerPixel),
  },
}
const json = `${JSON.stringify(output, null, 2)}\n`
if (args[2]) await writeFile(args[2], json)
if (args[3]) await writeFile(args[3], makeDifferenceImage(baseline, candidate))
process.stdout.write(json)
