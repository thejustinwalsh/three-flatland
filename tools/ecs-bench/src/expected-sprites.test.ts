import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

interface HarnessReport {
  cases: Record<string, { expectedSprites: number | null }>
  gc: { collectionsPerBoundary: number; exposed: boolean; timed: boolean }
  observations: Record<
    string,
    {
      raw: Array<{
        checksum: number
        phasesMs: Record<string, number>
        topology: { batches: number; sprites: number; visibleSprites: number }
      }>
    }
  >
}

describe('expectedSprites evidence harness', () => {
  it('records raw, GC-controlled under/exact/over observations for one workload', () => {
    const output = execFileSync(
      process.execPath,
      [
        '--disable-warning=DEP0205',
        '--import',
        'tsx',
        '--expose-gc',
        resolve(import.meta.dirname, 'expected-sprites.ts'),
        '--quick',
        '--count',
        '8',
        '--samples',
        '2',
        '--warmups',
        '1',
      ],
      { encoding: 'utf8' }
    )
    const report = JSON.parse(output) as HarnessReport

    expect(report.cases).toEqual({
      unhinted: { expectedSprites: null },
      under: { expectedSprites: 4 },
      exact: { expectedSprites: 8 },
      over: { expectedSprites: 16 },
    })
    expect(report.gc).toEqual({ collectionsPerBoundary: 2, exposed: true, timed: false })

    const checksums = new Set<number>()
    for (const name of ['unhinted', 'under', 'exact', 'over']) {
      const observations = report.observations[name]!.raw
      expect(observations).toHaveLength(2)
      for (const observation of observations) {
        checksums.add(observation.checksum)
        expect(Object.keys(observation.phasesMs)).toEqual(['construction', 'enrollment', 'firstUpdate', 'total'])
        expect(observation.topology).toEqual({ batches: 1, sprites: 8, visibleSprites: 8 })
      }
    }
    expect(checksums.size).toBe(1)
  })
})
