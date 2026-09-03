import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { benchmarkBuildMetadata } from '../../_shared/benchmark-vite'

export default defineConfig(({ command }) => {
  const benchmark = benchmarkBuildMetadata(command, 'examples/react/radiance-dungeon')
  return {
    resolve: { conditions: ['source'] },
    define: {
      'process.env.FL_DEVTOOLS': JSON.stringify(String(benchmark.devtoolsEnabled)),
      'process.env.FL_PROFILE': JSON.stringify(String(benchmark.profileEnabled)),
      'import.meta.env.VITE_FLATLAND_BENCHMARK_REVISION': JSON.stringify(benchmark.revision),
      'import.meta.env.VITE_FLATLAND_BENCHMARK_FIXTURE_SHA256': JSON.stringify(benchmark.fixtureSourceSha256),
      'import.meta.env.VITE_FLATLAND_BENCHMARK_DEVTOOLS': JSON.stringify(String(benchmark.devtoolsEnabled)),
      'import.meta.env.VITE_FLATLAND_BENCHMARK_PROFILE': JSON.stringify(String(benchmark.profileEnabled)),
    },
    plugins: [react()],
    base: command === 'serve' ? '/react/radiance-dungeon/' : './',
    server: {
      strictPort: true,
    },
  }
})
