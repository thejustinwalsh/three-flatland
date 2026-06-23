import type { Baker } from '@three-flatland/bake'
import { bakeAlphaMapFile } from './bake.node.js'

const USAGE = [
  'Usage:',
  '  flatland-bake alpha <input.png> [output.png]',
  '',
  'Extracts the alpha channel from an RGBA PNG into <input>.alpha.png',
  '(alpha stored in R, replicated to G/B). The output is stamped with a',
  '`flatland` tEXt chunk so runtime loaders can invalidate stale bakes.',
  '',
  'Used by hitTestMode: "alpha" for pixel-perfect pointer hit testing.',
].join('\n')

const baker: Baker = {
  name: 'alpha',
  description: 'Bake an alpha hitmask sidecar from a sprite PNG',

  usage() {
    return USAGE
  },

  run(args) {
    if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
      process.stdout.write(USAGE + '\n')
      return Promise.resolve(args.length === 0 ? 1 : 0)
    }
    const [input, output] = args
    const out = bakeAlphaMapFile(input!, output)
    process.stdout.write(`wrote ${out}\n`)
    return Promise.resolve(0)
  },
}

export default baker
