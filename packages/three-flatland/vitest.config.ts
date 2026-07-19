import { mergeConfig, defineConfig } from 'vitest/config'
import { baseTestConfig } from '../../vitest.base'

export default mergeConfig(
  baseTestConfig,
  defineConfig({
    test: {
      // `*.test-d.ts` type-level tests (expectTypeOf) run in the same `vitest run`
      // as the runtime suite — this is the only package with them, so they live
      // here rather than in a root config.
      typecheck: {
        enabled: true,
        include: ['src/**/*.test-d.ts'],
        tsconfig: './tsconfig.json',
      },
    },
  })
)
