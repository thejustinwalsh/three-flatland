import type { Baker } from '@three-flatland/bake'
import { glob } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { encodeImageFile, encodeImageBatch } from './encode.node.js'
import type { EncodeFormat, ImageEncodeOptions } from './types'

const USAGE = `flatland-bake encode <input> [output] [options]

Options:
  --format <fmt>         png | webp | avif | ktx2  (required)
  --quality <n>          0..100 (WebP/AVIF) or BasisU quality (KTX2 ETC1S)
  --mode <m>             lossy | lossless (WebP/AVIF)
  --basis-mode <m>       etc1s | uastc (KTX2)
  --uastc-level <0..4>   UASTC pack level (KTX2)
  --mipmaps              Generate mipmap pyramid (KTX2)
  --batch                Treat <input> as a glob pattern
  --out-dir <path>       Batch output directory
  --force                Overwrite existing targets
`

const FORMATS: EncodeFormat[] = ['png', 'webp', 'avif', 'ktx2']

interface Args {
  positional: string[]
  format?: EncodeFormat
  quality?: number
  mode?: 'lossy' | 'lossless'
  basisMode?: 'etc1s' | 'uastc'
  uastcLevel?: 0 | 1 | 2 | 3 | 4
  mipmaps: boolean
  batch: boolean
  outDir?: string
  force: boolean
  help: boolean
}

function parseArgs(argv: string[]): Args {
  const args: Args = { positional: [], mipmaps: false, batch: false, force: false, help: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!
    const next = (): string => {
      const v = argv[++i]
      if (v === undefined) throw new Error(`missing value for ${a}`)
      return v
    }
    if (a === '--help' || a === '-h') args.help = true
    else if (a === '--mipmaps') args.mipmaps = true
    else if (a === '--batch') args.batch = true
    else if (a === '--force') args.force = true
    else if (a === '--format') args.format = next() as EncodeFormat
    else if (a === '--quality') args.quality = Number(next())
    else if (a === '--mode') args.mode = next() as 'lossy' | 'lossless'
    else if (a === '--basis-mode') args.basisMode = next() as 'etc1s' | 'uastc'
    else if (a === '--uastc-level') args.uastcLevel = Number(next()) as 0 | 1 | 2 | 3 | 4
    else if (a === '--out-dir') args.outDir = next()
    else args.positional.push(a)
  }
  return args
}

const baker: Baker = {
  name: 'encode',
  description: 'Encode image to PNG/WebP/AVIF/KTX2',
  usage() { return USAGE },

  async run(rawArgs) {
    let args: Args
    try {
      args = parseArgs(rawArgs)
    } catch (err) {
      process.stderr.write(`[encode] ${(err as Error).message}\n${USAGE}`)
      return 1
    }
    if (args.help) {
      process.stdout.write(USAGE)
      return 0
    }
    if (!args.format || !FORMATS.includes(args.format)) {
      process.stderr.write(`[encode] --format <png|webp|avif|ktx2> is required\n`)
      return 1
    }
    const opts: ImageEncodeOptions = {
      format: args.format,
      quality: args.quality,
      mode: args.mode,
      basis: args.basisMode || args.uastcLevel !== undefined || args.mipmaps
        ? { mode: args.basisMode, mipmaps: args.mipmaps, uastcLevel: args.uastcLevel }
        : undefined,
    }

    if (args.batch) {
      if (!args.positional[0] || !args.outDir) {
        process.stderr.write(`[encode] --batch requires <pattern> and --out-dir\n`)
        return 1
      }
      const files: string[] = []
      try {
        for await (const f of glob(args.positional[0])) files.push(f as string)
      } catch {
        // Glob error: treat the pattern as a single literal path so missing-file batch tests work.
        files.push(args.positional[0])
      }
      if (files.length === 0) files.push(args.positional[0])
      const items = files.map((f) => ({
        input: f,
        output: join(args.outDir!, basename(f, extname(f)) + '.' + args.format),
        opts,
      }))
      let okCount = 0, errCount = 0
      for await (const r of encodeImageBatch(items, 4)) {
        const tag = r.status === 'ok' ? 'ok' : 'err'
        process.stdout.write(`[encode] ${tag} ${r.input} ${r.error ?? r.output ?? ''}\n`)
        if (r.status === 'ok') okCount++
        else errCount++
      }
      process.stdout.write(`[encode] done: ${okCount} ok, ${errCount} err\n`)
      return errCount === 0 ? 0 : 1
    }

    const [input, output] = args.positional
    if (!input) {
      process.stderr.write(`[encode] missing <input>\n${USAGE}`)
      return 1
    }
    try {
      const out = await encodeImageFile(input, output ?? null, opts, { force: args.force })
      process.stdout.write(`[encode] ok ${input} → ${out}\n`)
      return 0
    } catch (err) {
      process.stderr.write(`[encode] err ${(err as Error).message}\n`)
      return 1
    }
  },
}

export default baker
