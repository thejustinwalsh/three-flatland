import { describe, expect, it } from 'vitest'
import { gitMergeBase } from './provenance.ts'
import { parseRendererEvidenceArgs, runRendererEvidence, type RendererEvidenceCase } from './renderer-evidence.ts'

const cases: RendererEvidenceCase[] = [
  'static',
  'moving-alpha-depth',
  'transparent-sort',
  'routing-12000',
  'add-remove-churn',
  'dynamic-effect-churn',
  'mixed-scene',
  'multi-world',
]

describe('renderer evidence CLI', () => {
  it('uses the canonical scale unless quick mode or 60k is requested', () => {
    expect(parseRendererEvidenceArgs([]).counts).toEqual([16_384])
    expect(parseRendererEvidenceArgs(['--quick']).counts).toEqual([64])
    expect(parseRendererEvidenceArgs(['--include-60000']).counts).toEqual([16_384, 60_000])
  })

  it('rejects unknown cases and invalid sample sizes', () => {
    expect(() => parseRendererEvidenceArgs(['--case=nope'])).toThrow(/Unknown renderer evidence case/)
    expect(() => parseRendererEvidenceArgs(['--samples=0'])).toThrow(/positive safe integer/)
  })
})

describe('production renderer evidence smoke harness', () => {
  it.each(['mixed-scene', 'multi-world'] as const)(
    'does not count the empty side of an odd one-sprite %s split as a batch',
    async (scenario) => {
      const report = await runRendererEvidence({
        cases: [scenario],
        counts: [1],
        memoryCycles: 1,
        quick: true,
        samples: 1,
        warmups: 0,
      })

      expect(report.cases[0]!.initialBatches).toEqual({ actual: 1, expected: 1, mode: 'quick-fixed' })
      expect(report.cases[0]!.samples[0]!.owners).toMatchObject({ occupiedRows: 1, members: 1, batches: 1 })
    }
  )

  it('runs all accepted cases through production SpriteGroup and validates every owner', async () => {
    const count = 32
    const report = await runRendererEvidence({
      cases,
      counts: [count],
      memoryCycles: 1,
      quick: true,
      samples: 1,
      warmups: 0,
    })

    expect(report.status).toEqual({
      definitiveCapture: 'pending',
      observation: 'smoke-measured',
      peak60000: 'pending',
    })
    expect(report.cases.map((result) => result.case)).toEqual(cases)
    expect(report.provenance.git.mergeBase).toBe(gitMergeBase())
    expect(report.provenance.sources).toContainEqual(
      expect.objectContaining({ path: 'tools/ecs-bench/src/provenance.ts' })
    )
    for (const result of report.cases) {
      expect(result.initialBatches).toEqual({ actual: 4, expected: 4, mode: 'quick-fixed' })
      expect(result.samples).toHaveLength(1)
      const sample = result.samples[0]!
      expect(sample.systems['ecs:run']).toBeGreaterThanOrEqual(0)
      expect(sample.systems).not.toHaveProperty('rebuildEffectTraits')
      expect(sample.owners.occupiedRows).toBe(count)
      expect(sample.owners.members).toBe(count)
      const traversalTransitions = result.topology.filter(
        (transition) =>
          transition.system === 'transformSync' ||
          transition.system === 'batchSort' ||
          transition.system === 'flushDirtyRanges'
      )
      expect(traversalTransitions.length).toBeGreaterThan(0)
      expect(traversalTransitions.every((transition) => transition.batchLocal)).toBe(true)
      expect(result.memory.status === 'measured' || result.memory.status === 'unavailable').toBe(true)
    }
  })

  it('removes and clears the topology probe before timed updates and retained-heap observation', async () => {
    const timedProbeStates: boolean[] = []
    const afterDestroyProbeStates: Array<{
      probeActive: boolean
      probeEvents: number
      topologySummaries: number
      samples: number
      performanceMeasures: number
    }> = []

    const previousGc = Reflect.get(globalThis, 'gc')
    Reflect.set(globalThis, 'gc', () => {})
    let report: Awaited<ReturnType<typeof runRendererEvidence>>
    try {
      report = await runRendererEvidence(
        {
          cases: ['moving-alpha-depth'],
          counts: [16],
          memoryCycles: 1,
          quick: true,
          samples: 2,
          warmups: 0,
        },
        {
          beforeAfterDestroyHeap: (state) => afterDestroyProbeStates.push(state),
          beforeTimedUpdate: ({ probeActive }) => timedProbeStates.push(probeActive),
        }
      )
    } finally {
      if (previousGc === undefined) Reflect.deleteProperty(globalThis, 'gc')
      else Reflect.set(globalThis, 'gc', previousGc)
    }

    expect(report.cases[0]!.topology.length).toBeGreaterThan(0)
    expect(timedProbeStates).toEqual([false, false])
    expect(afterDestroyProbeStates).toEqual([
      {
        performanceMeasures: 0,
        probeActive: false,
        probeEvents: 0,
        samples: 0,
        topologySummaries: 0,
      },
    ])
  })
})
