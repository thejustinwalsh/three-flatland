import { defineConfig } from 'tsup'
import { mkdirSync, copyFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/types.ts',
    'src/encode.ts',
    'src/decode.ts',
    'src/memory.ts',
    'src/codecs/png.ts',
    'src/codecs/webp.ts',
    'src/codecs/avif.ts',
    'src/codecs/ktx2.ts',
    'src/runtime/wasi-shim.ts',
    'src/runtime/basis-loader.ts',
    'src/runtime/basis-encoder-worker.ts',
    'src/runtime/transcoder-loader.ts',
    'src/encode.node.ts',
    'src/node.ts',
    'src/cli.ts',
    'src/loaders/Ktx2Loader.ts',
    'src/loaders/ktx2-transcode.ts',
    'src/loaders/ktx2-worker.ts',
  ],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  bundle: false,
  shims: true,
  onSuccess: async () => {
    const dest = 'dist/libs/basis'
    mkdirSync(dest, { recursive: true })
    for (const f of readdirSync('libs/basis')) {
      copyFileSync(join('libs/basis', f), join(dest, f))
    }
  },
})
