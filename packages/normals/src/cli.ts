import { resolve } from 'node:path'
import { existsSync, readFileSync } from 'node:fs'
import type { Baker } from '@three-flatland/bake'
import {
  directionToAngle,
  type NormalDirection,
  type NormalSourceDescriptor,
} from './descriptor.js'
import { bakeNormalMapFile } from './bake.node.js'

const USAGE = [
  'Usage:',
  '  flatland-bake normal <input.png> [output.png] [options]',
  '',
  'Reads an RGBA PNG, derives a tangent-space normal map, and writes',
  '<input>.normal.png (or the given output path). The output PNG is',
  "stamped with the descriptor's content hash under a `flatland` tEXt chunk",
  'so runtime loaders can invalidate stale siblings.',
  '',
  'Options:',
  '  --descriptor <path>  JSON descriptor file — region-aware control',
  '                       (frames, tiles, cap/face splits, per-region tilt)',
  '  --direction <dir>    Single-region tilt: flat|up|down|left|right|',
  '                       north|south|east|west|up-left|… (default: flat)',
  '  --pitch <radians>    Tilt angle from flat (default: π/4)',
  '  --bump <mode>        alpha|none (default: alpha)',
  '  --strength <n>       Gradient multiplier before normalization (default: 1)',
  '',
  'Flat flags build a zero-region descriptor whose defaults apply to the',
  'whole texture. When --descriptor is also provided, flat flags override',
  'the descriptor-level defaults; existing regions are untouched.',
].join('\n')

const baker: Baker = {
  name: 'normal',
  description: 'Bake a tangent-space normal map from a sprite PNG',

  usage() {
    return USAGE
  },

  run(args) {
    if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
      process.stdout.write(USAGE + '\n')
      return Promise.resolve(args.length === 0 ? 1 : 0)
    }

    const flags: {
      strength?: number
      direction?: NormalDirection
      pitch?: number
      bump?: 'alpha' | 'none'
      descriptorPath?: string
    } = {}
    const positional: string[] = []

    for (let i = 0; i < args.length; i++) {
      const arg = args[i]!
      if (arg === '--strength') {
        const raw = args[++i]
        const n = Number(raw)
        if (raw === undefined || !Number.isFinite(n)) {
          process.stderr.write('--strength requires a number\n')
          return Promise.resolve(1)
        }
        flags.strength = n
      } else if (arg === '--direction') {
        const raw = args[++i]
        if (raw === undefined) {
          process.stderr.write('--direction requires a name\n')
          return Promise.resolve(1)
        }
        try {
          directionToAngle(raw as NormalDirection)
        } catch (err) {
          process.stderr.write(
            `--direction: ${err instanceof Error ? err.message : String(err)}\n`
          )
          return Promise.resolve(1)
        }
        flags.direction = raw as NormalDirection
      } else if (arg === '--pitch') {
        const raw = args[++i]
        const n = Number(raw)
        if (raw === undefined || !Number.isFinite(n)) {
          process.stderr.write('--pitch requires a number (radians)\n')
          return Promise.resolve(1)
        }
        flags.pitch = n
      } else if (arg === '--bump') {
        const raw = args[++i]
        if (raw !== 'alpha' && raw !== 'none') {
          process.stderr.write('--bump must be "alpha" or "none"\n')
          return Promise.resolve(1)
        }
        flags.bump = raw
      } else if (arg === '--descriptor' || arg === '-d') {
        const raw = args[++i]
        if (raw === undefined) {
          process.stderr.write('--descriptor requires a path\n')
          return Promise.resolve(1)
        }
        flags.descriptorPath = resolve(raw)
        if (!existsSync(flags.descriptorPath)) {
          process.stderr.write(`descriptor not found: ${flags.descriptorPath}\n`)
          return Promise.resolve(1)
        }
      } else {
        positional.push(arg)
      }
    }

    const [inputArg, outputArg] = positional
    if (!inputArg) {
      process.stderr.write(
        'missing <input.png>. Run `flatland-bake normal --help`.\n'
      )
      return Promise.resolve(1)
    }

    const inputPath = resolve(inputArg)
    if (!existsSync(inputPath)) {
      process.stderr.write(`input not found: ${inputPath}\n`)
      return Promise.resolve(1)
    }

    // Build the effective descriptor: start from the file (if any),
    // then overlay flat flags as top-level defaults. Existing regions
    // inside the descriptor are preserved verbatim.
    const descriptor: NormalSourceDescriptor = flags.descriptorPath
      ? (JSON.parse(readFileSync(flags.descriptorPath, 'utf8')) as NormalSourceDescriptor)
      : {}

    if (flags.direction !== undefined) descriptor.direction = flags.direction
    if (flags.pitch !== undefined) descriptor.pitch = flags.pitch
    if (flags.bump !== undefined) descriptor.bump = flags.bump
    if (flags.strength !== undefined) descriptor.strength = flags.strength

    const outputPath = outputArg ? resolve(outputArg) : undefined
    const written = bakeNormalMapFile(inputPath, descriptor, outputPath)
    process.stdout.write(`wrote ${written}\n`)
    return Promise.resolve(0)
  },
}

export default baker
