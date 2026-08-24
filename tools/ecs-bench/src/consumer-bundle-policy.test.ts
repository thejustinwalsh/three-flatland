import { describe, expect, it } from 'vitest'
import {
  assertAcceptedConsumerBudget,
  classifyHistoricalComparison,
  createConsumerBudgetCandidate,
  evaluateAcceptedConsumerBudget,
  type AcceptedConsumerBudget,
  type BundleSize,
  type CurrentConsumerObservation,
} from './consumer-bundle-policy.ts'

const hashA = 'a'.repeat(64)
const hashB = 'b'.repeat(64)

function size(minifiedBytes: number, gzipBytes = minifiedBytes, brotliBytes = gzipBytes): BundleSize {
  return { brotliBytes, gzipBytes, minifiedBytes }
}

const observations: readonly CurrentConsumerObservation[] = [
  {
    fixture: { id: 'basic', source: 'fixtures/basic.ts' },
    size: size(100, 80, 70),
    sourceSha256: hashA,
  },
  {
    fixture: { id: 'stress', source: 'fixtures/stress.ts' },
    size: size(200, 160, 140),
    sourceSha256: hashB,
  },
]

const provenance = {
  captureStatus: 'measured-unreviewed',
  lockfileSha256: hashA,
  productionSourceSha256: hashB,
  revision: 'c'.repeat(40),
  sourceTreeDirty: false,
  toolVersions: { esbuild: '1.0.0', node: 'v24.0.0' },
} as const

function acceptedBudget(): AcceptedConsumerBudget {
  return createConsumerBudgetCandidate(observations, provenance)
}

describe('historical consumer comparison', () => {
  it('classifies exact smaller, larger, unchanged, and mixed outcomes without enforcing them', () => {
    expect(classifyHistoricalComparison([{ historicalDifference: size(1) }])).toBe('all-smaller')
    expect(classifyHistoricalComparison([{ historicalDifference: size(-1) }])).toBe('all-larger')
    expect(classifyHistoricalComparison([{ historicalDifference: size(0) }])).toBe('unchanged')
    expect(classifyHistoricalComparison([{ historicalDifference: size(1) }, { historicalDifference: size(-1) }])).toBe(
      'mixed'
    )
    expect(classifyHistoricalComparison([{ historicalDifference: size(1, -1, 0) }])).toBe('mixed')
    expect(() => classifyHistoricalComparison([])).toThrow(/at least one consumer fixture/)
  })
})

describe('accepted-current consumer budgets', () => {
  it('passes exact sizes and reductions without mutating or silently ratcheting the accepted maxima', () => {
    const budget = acceptedBudget()
    const before = structuredClone(budget)
    expect(evaluateAcceptedConsumerBudget(budget, observations)).toMatchObject({ status: 'passed', violations: [] })
    const reduced = observations.map((observation) => ({
      ...observation,
      size: size(observation.size.minifiedBytes - 1, observation.size.gzipBytes - 1, observation.size.brotliBytes - 1),
    }))
    expect(evaluateAcceptedConsumerBudget(budget, reduced)).toMatchObject({ status: 'passed', violations: [] })
    expect(budget).toEqual(before)
  })

  it.each(['minifiedBytes', 'gzipBytes', 'brotliBytes'] as const)('fails when %s grows by one byte', (metric) => {
    const changed = observations.map((observation, index) =>
      index === 0
        ? { ...observation, size: { ...observation.size, [metric]: observation.size[metric] + 1 } }
        : observation
    )
    const evaluation = evaluateAcceptedConsumerBudget(acceptedBudget(), changed)
    expect(evaluation.status).toBe('failed')
    expect(evaluation.violations.join('\n')).toMatch(new RegExp(`exceeds ${metric} by 1 byte`))
  })

  it('fails missing, extra, source, and source-hash mismatches', () => {
    const missing = acceptedBudget()
    delete (missing.fixtures as Record<string, unknown>).basic
    expect(evaluateAcceptedConsumerBudget(missing, observations).violations).toContain(
      "Accepted consumer budget is missing fixture 'basic'"
    )

    const extra = acceptedBudget()
    const extraFixtures = extra.fixtures as Record<string, unknown>
    extraFixtures.extra = {
      maximum: size(1),
      source: 'fixtures/extra.ts',
      sourceSha256: hashA,
    }
    expect(evaluateAcceptedConsumerBudget(extra, observations).violations).toContain(
      "Accepted consumer budget contains extra fixture 'extra'"
    )

    const changedSource = [
      { ...observations[0]!, fixture: { id: 'basic', source: 'fixtures/moved.ts' } },
      observations[1]!,
    ]
    expect(evaluateAcceptedConsumerBudget(acceptedBudget(), changedSource).violations.join('\n')).toMatch(
      /source changed/
    )
    const changedHash = [{ ...observations[0]!, sourceSha256: hashB }, observations[1]!]
    expect(evaluateAcceptedConsumerBudget(acceptedBudget(), changedHash).violations.join('\n')).toMatch(
      /source hash does not match/
    )
  })

  it.each(['minifiedBytes', 'gzipBytes', 'brotliBytes'] as const)(
    'rejects an accepted maximum missing %s instead of producing a NaN delta',
    (metric) => {
      const budget = acceptedBudget()
      delete (budget.fixtures.basic!.maximum as unknown as Record<string, unknown>)[metric]
      const evaluation = evaluateAcceptedConsumerBudget(budget, observations)
      expect(evaluation.status).toBe('failed')
      expect(evaluation.violations).toContain(`fixtures.basic.maximum is missing key '${metric}'`)
      expect(evaluation.deltas.basic).toBeUndefined()
    }
  )

  it('rejects null, unexpected top-level, fixture, and metric keys', () => {
    expect(evaluateAcceptedConsumerBudget(null as unknown as AcceptedConsumerBudget, observations)).toEqual({
      deltas: {},
      status: 'failed',
      violations: ['Accepted consumer budget must be an object'],
    })

    const nullProvenance = acceptedBudget() as unknown as Record<string, unknown>
    nullProvenance.provenance = null
    expect(
      evaluateAcceptedConsumerBudget(nullProvenance as unknown as AcceptedConsumerBudget, observations).violations
    ).toContain('Accepted consumer budget provenance must be an object')

    const nullFixtures = acceptedBudget() as unknown as Record<string, unknown>
    nullFixtures.fixtures = null
    expect(
      evaluateAcceptedConsumerBudget(nullFixtures as unknown as AcceptedConsumerBudget, observations).violations
    ).toContain('Accepted consumer budget fixtures must be an object')

    const extraTopLevel = acceptedBudget() as unknown as Record<string, unknown>
    extraTopLevel.note = 'not part of schema v1'
    expect(
      evaluateAcceptedConsumerBudget(extraTopLevel as unknown as AcceptedConsumerBudget, observations).violations
    ).toContain("budget has unexpected key 'note'")

    const extraFixtureKey = acceptedBudget()
    const fixture = extraFixtureKey.fixtures.basic as unknown as Record<string, unknown>
    fixture.note = 'unexpected'
    expect(evaluateAcceptedConsumerBudget(extraFixtureKey, observations).violations).toContain(
      "fixtures.basic has unexpected key 'note'"
    )

    const extraMetric = acceptedBudget()
    const maximum = extraMetric.fixtures.basic!.maximum as unknown as Record<string, unknown>
    maximum.rawBytes = 123
    expect(evaluateAcceptedConsumerBudget(extraMetric, observations).violations).toContain(
      "fixtures.basic.maximum has unexpected key 'rawBytes'"
    )
  })

  it('rejects a dirty candidate and treats an absent accepted artifact as pending', () => {
    const dirty = createConsumerBudgetCandidate(observations, { ...provenance, sourceTreeDirty: true })
    expect(evaluateAcceptedConsumerBudget(dirty, observations).violations).toContain(
      'Accepted consumer budget was captured from a dirty source tree'
    )
    expect(evaluateAcceptedConsumerBudget(undefined, observations)).toMatchObject({ status: 'pending' })
  })

  it('rejects a smoke candidate even when the source tree was clean', () => {
    const smoke = createConsumerBudgetCandidate(observations, {
      ...provenance,
      captureStatus: 'smoke-dirty',
    })
    expect(evaluateAcceptedConsumerBudget(smoke, observations).violations).toContain(
      'Accepted consumer budget must come from a definitive measured-unreviewed capture'
    )
  })

  it('enforces pending and failed budgets only for definitive captures', () => {
    const pending = evaluateAcceptedConsumerBudget(undefined, observations)
    const failed = evaluateAcceptedConsumerBudget(acceptedBudget(), [
      { ...observations[0]!, size: size(101, 80, 70) },
      observations[1]!,
    ])
    const passed = evaluateAcceptedConsumerBudget(acceptedBudget(), observations)
    expect(() => assertAcceptedConsumerBudget('smoke-dirty', pending)).not.toThrow()
    expect(() => assertAcceptedConsumerBudget('measured-unreviewed', pending)).toThrow(/pending/)
    expect(() => assertAcceptedConsumerBudget('measured-unreviewed', failed)).toThrow(/failed/)
    expect(() => assertAcceptedConsumerBudget('measured-unreviewed', passed)).not.toThrow()
  })
})
