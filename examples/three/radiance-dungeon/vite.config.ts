import { defineConfig } from 'vite'
import { benchmarkBuildMetadata } from '../../_shared/benchmark-vite'

export default defineConfig(({ command }) => {
  const benchmark = benchmarkBuildMetadata(command, 'examples/three/radiance-dungeon')
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
    base: command === 'serve' ? '/three/radiance-dungeon/' : './',
    server: {
      strictPort: true,
    },
  }
})
