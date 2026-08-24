import { defineConfig } from '@pmndrs/labs'

const smoke = process.env['FLATLAND_LABS_SMOKE'] === 'true'

export default defineConfig({
  benchDir: 'benches',
  benchMatch: '**/*.bench.ts',
  resultsDir: process.env['FLATLAND_LABS_RESULTS_DIR'] ?? '.labs',
  adaptive: smoke ? false : 0.005,
  minCpuTime: smoke ? 0.05 : 5,
  maxCpuTime: smoke ? 1 : 30,
  minSamples: smoke ? 14 : 100,
  maxSamples: smoke ? 100 : 20_000,
  alpha: 0.05,
  minDelta: 0.03,
  minEffect: 0.474,
})
