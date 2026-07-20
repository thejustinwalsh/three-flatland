import { mergeConfig, defineConfig } from 'vitest/config'
import { baseTestConfig } from '../../vitest.base'

// templates/ ship their own vitest + playwright configs and are exercised by the
// consumer smoke, not from here.
export default mergeConfig(baseTestConfig, defineConfig({ test: { exclude: ['templates/**'] } }))
