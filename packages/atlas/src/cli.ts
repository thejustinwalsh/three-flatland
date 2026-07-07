#!/usr/bin/env node
/**
 * flatland-atlas — pack a directory of PNGs into an atlas with tight
 * polygon meshes.
 *
 *   flatland-atlas pack ./sprites -o ./dist/atlas.json
 *   flatland-atlas pack ./sprites -o ./dist/atlas.json --verts 12 --threshold 16 --no-polygons
 *
 * Writes `<out>.json` plus the sibling page image named in the JSON's
 * `meta.image` (defaults to the JSON basename with `.png`).
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { bakeAtlas, decodePng, encodePng } from './bake'

interface CliArgs {
  command: string
  input: string
  out: string
  vertexBudget: number
  alphaThreshold: number
  spacing: number
  polygons: boolean
}

function parseArgs(argv: string[]): CliArgs {
  const [command, input] = argv
  if (command !== 'pack' || !input) {
    usage()
    process.exit(1)
  }
  const args: CliArgs = {
    command,
    input,
    out: 'atlas.json',
    vertexBudget: 8,
    alphaThreshold: 8,
    spacing: 2,
    polygons: true,
  }
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i]!
    if (arg === '-o' || arg === '--out') args.out = argv[++i]!
    else if (arg === '--verts') args.vertexBudget = Number(argv[++i])
    else if (arg === '--threshold') args.alphaThreshold = Number(argv[++i])
    else if (arg === '--spacing') args.spacing = Number(argv[++i])
    else if (arg === '--no-polygons') args.polygons = false
    else {
      console.error(`flatland-atlas: unknown option '${arg}'`)
      usage()
      process.exit(1)
    }
  }
  return args
}

function usage(): void {
  console.error(
    'Usage: flatland-atlas pack <dir> [-o out.json] [--verts N] [--threshold N] [--spacing N] [--no-polygons]'
  )
}

export function run(argv: string[]): void {
  const args = parseArgs(argv)
  const inputDir = resolve(args.input)
  const files = readdirSync(inputDir)
    .filter((f) => extname(f).toLowerCase() === '.png')
    .sort()
  if (files.length === 0) {
    console.error(`flatland-atlas: no .png files in ${inputDir}`)
    process.exit(1)
  }

  const sources = files.map((f) =>
    decodePng(basename(f, extname(f)), readFileSync(join(inputDir, f)))
  )

  const outJson = resolve(args.out)
  const imageName = basename(outJson, extname(outJson)) + '.png'
  const baked = bakeAtlas(sources, {
    vertexBudget: args.vertexBudget,
    alphaThreshold: args.alphaThreshold,
    spacing: args.spacing,
    polygons: args.polygons,
    imageName,
  })

  mkdirSync(dirname(outJson), { recursive: true })
  writeFileSync(outJson, JSON.stringify(baked.json, null, 2))
  writeFileSync(join(dirname(outJson), imageName), encodePng(baked.page))

  const meshed = Object.values(baked.json.frames).filter((f) => f.mesh).length
  console.log(
    `flatland-atlas: packed ${files.length} frame(s) into ${baked.page.width}×${baked.page.height} ` +
      `(${meshed} with polygon mesh) → ${outJson}`
  )
}

// Invoked as a bin
if (import.meta.url === `file://${process.argv[1]}`) {
  run(process.argv.slice(2))
}
