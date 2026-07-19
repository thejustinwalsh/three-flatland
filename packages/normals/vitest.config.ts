import { mergeConfig, defineConfig } from 'vitest/config'
import { baseTestConfig } from '../../vitest.base'

export default mergeConfig(baseTestConfig, defineConfig({ test: {} }))
