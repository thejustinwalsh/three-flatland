import { resolve } from 'node:path'
import { existsSync } from 'node:fs'
import { bakeNormalMapFile } from './bake.js'
import type { Baker } from '@three-flatland/bake'

const baker: Baker = {
  name: 'normal',
  description: 'Bake a tangent-space normal map from a sprite PNG',

  usage() {
    return [
      'Usage:',
      '  flatland-bake normal <input.png> [output.png] [--strength <n>]',
      '',
      'Reads an RGBA PNG, derives a normal map from the alpha gradient, and',
      'writes <input>.normal.png (or the given output path).',
      '',
      'Options:',
      '  --strength <n>   Gradient multiplier before normalization (default 1)',
    ].join('\n')
  },

  run(args) {
    // Body is synchronous — wrap result so the Baker contract's async
    // signature holds. The require-await lint rule forbids async methods
    // that never await, so this non-async shape is the clean alternative.
    if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
      process.stdout.write(this.usage!() + '\n')
      return Promise.resolve(args.length === 0 ? 1 : 0)
    }

    let strength: number | undefined
    const positional: string[] = []

    for (let i = 0; i < args.length; i++) {
      const arg = args[i]!
      if (arg === '--strength') {
        const next = args[i + 1]
        if (!next) {
          process.stderr.write('--strength requires a number\n')
          return Promise.resolve(1)
        }
        const parsed = Number(next)
        if (!Number.isFinite(parsed)) {
          process.stderr.write(`--strength value "${next}" is not a number\n`)
          return Promise.resolve(1)
        }
        strength = parsed
        i++
      } else {
        positional.push(arg)
      }
    }

    const [inputArg, outputArg] = positional
    if (!inputArg) {
      process.stderr.write('missing <input.png>. Run `flatland-bake normal --help`.\n')
      return Promise.resolve(1)
    }

    const inputPath = resolve(inputArg)
    if (!existsSync(inputPath)) {
      process.stderr.write(`input not found: ${inputPath}\n`)
      return Promise.resolve(1)
    }

    const outputPath = outputArg ? resolve(outputArg) : undefined
    const written = bakeNormalMapFile(inputPath, outputPath, { strength })
    process.stdout.write(`wrote ${written}\n`)
    return Promise.resolve(0)
  },
}

export default baker
