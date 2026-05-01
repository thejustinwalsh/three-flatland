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
  ],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  bundle: false,
  shims: true,
  onSuccess: async () => {
    const dest = 'dist/vendor/basis'
    mkdirSync(dest, { recursive: true })
    for (const f of readdirSync('vendor/basis')) {
      copyFileSync(join('vendor/basis', f), join(dest, f))
    }
  },
})
