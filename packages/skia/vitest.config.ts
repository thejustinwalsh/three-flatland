import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    setupFiles: ['./test/setup.ts'],
    coverage: {
      provider: 'v8',
      include: [
        'src/ts/context.ts',
        'src/ts/paint.ts',
        'src/ts/path.ts',
        'src/ts/font.ts',
        'src/ts/image.ts',
        'src/ts/image-filter.ts',
        'src/ts/color-filter.ts',
        'src/ts/path-effect.ts',
        'src/ts/shader.ts',
        'src/ts/path-measure.ts',
        'src/ts/text-blob.ts',
        'src/ts/picture.ts',
        'src/ts/drawing-context.ts',
        'src/ts/init.ts',
        'src/ts/preload.ts',
      ],
      exclude: ['**/*.test.ts'],
    },
  },
})
