import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import labsConfig from '../labs.config.ts'
import { resolveLabsInstallation } from './labs-run-support.ts'

const NODE_MAJOR = Number.parseInt(process.versions.node.split('.')[0] ?? '0', 10)
const PACKAGE_ROOT = resolve(import.meta.dirname, '..')
const contractRoot = mkdtempSync(resolve(tmpdir(), 'three-flatland-labs-contract-'))
const marker = resolve(contractRoot, 'teardown-marker')
const installation = resolveLabsInstallation(createRequire(import.meta.url).resolve('@pmndrs/labs'))
symlinkSync(resolve(PACKAGE_ROOT, 'node_modules'), resolve(contractRoot, 'node_modules'), 'dir')
writeFileSync(resolve(contractRoot, 'package.json'), JSON.stringify({ private: true, type: 'module' }))

writeFileSync(
  resolve(contractRoot, 'labs.config.ts'),
  `import { defineConfig } from '@pmndrs/labs'

export default defineConfig({
  benchDir: '.',
  benchMatch: '**/*.bench.ts',
  resultsDir: '.labs',
  adaptive: false,
  minCpuTime: 0.001,
  maxCpuTime: 0.1,
  minSamples: 14,
  maxSamples: 14,
  alpha: 0.05,
  minDelta: 0.03,
  minEffect: 0.474,
})
`
)
writeFileSync(
  resolve(contractRoot, 'contract.bench.ts'),
  `import { writeFileSync } from 'node:fs'
import { bench, group } from '@pmndrs/labs'

group('selected generator @contract', () => {
  bench('lifecycle', function* () {
    let samples = 0
    yield {
      bench: () => samples++,
      after: () => undefined,
    }
    if (samples === 0) throw new Error('generator benchmark callback never ran')
    writeFileSync(process.env['LABS_CONTRACT_MARKER']!, 'teardown')
  }).gc('inner')
})

group('unselected generator', () => {
  bench('must stay filtered', () => {
    throw new Error('Labs tag filter did not isolate @contract')
  })
})
`
)

afterAll(() => {
  rmSync(contractRoot, { force: true, recursive: true })
})

function runLabs(args: readonly string[]): ReturnType<typeof spawnSync> {
  return spawnSync(process.execPath, [installation.cli, ...args], {
    cwd: contractRoot,
    encoding: 'utf8',
    env: { ...process.env, LABS_CONTRACT_MARKER: marker },
  })
}

function expectSuccess(result: ReturnType<typeof spawnSync>): void {
  expect(result.error).toBeUndefined()
  expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0)
}

describe('installed Labs 0.6.0 contract', () => {
  it('exposes the config API used by the renderer harness', async () => {
    const api: unknown = await import('@pmndrs/labs')
    expect(api).toMatchObject({
      bench: expect.any(Function),
      defineConfig: expect.any(Function),
      group: expect.any(Function),
    })
    expect(labsConfig).toMatchObject({
      adaptive: 0.005,
      alpha: 0.05,
      benchDir: 'benches',
      benchMatch: '**/*.bench.ts',
      maxCpuTime: 30,
      minDelta: 0.03,
      minEffect: 0.474,
      minSamples: 100,
      resultsDir: '.labs',
    })
  })

  it.runIf(NODE_MAJOR >= 25)(
    'honors tag filters, generator lifecycle, run isolation, baseline/compare flags, and result layout',
    () => {
      const unsaved = runLabs(['run', '@contract'])
      expectSuccess(unsaved)
      expect(readFileSync(marker, 'utf8')).toBe('teardown')
      expect(existsSync(resolve(contractRoot, '.labs'))).toBe(false)

      const baseline = runLabs(['@contract', '-n', 'contract-baseline', '--baseline', '-m', 'baseline'])
      expectSuccess(baseline)
      expect(readFileSync(resolve(contractRoot, '.labs/baseline'), 'utf8')).toBe('contract-baseline')
      const baselineResult: unknown = JSON.parse(
        readFileSync(resolve(contractRoot, '.labs/results/contract-baseline.json'), 'utf8')
      )
      expect(baselineResult).toMatchObject({
        description: 'baseline',
        files: expect.any(Array),
        hardware: { cpu: expect.any(String), runtime: 'node' },
        name: 'contract-baseline',
      })

      const candidate = runLabs(['@contract', '-n', 'contract-candidate', '--compare', '-m', 'candidate'])
      expectSuccess(candidate)
      expect(existsSync(resolve(contractRoot, '.labs/results/contract-candidate.json'))).toBe(true)
      expect(JSON.parse(readFileSync(resolve(contractRoot, '.labs/last-compare.json'), 'utf8'))).toEqual({
        baselineName: 'contract-baseline',
        candidateName: 'contract-candidate',
      })
    },
    60_000
  )
})
