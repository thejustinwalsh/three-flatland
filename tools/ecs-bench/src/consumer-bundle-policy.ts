import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export const ACCEPTED_CONSUMER_BUDGET_PATH = 'planning/internal-ecs/results/consumer-bundle-budget.json' as const

export interface BundleSize {
  readonly brotliBytes: number
  readonly gzipBytes: number
  readonly minifiedBytes: number
}

export interface ConsumerBudgetProvenance {
  readonly captureStatus: 'measured-unreviewed' | 'smoke-dirty'
  readonly lockfileSha256: string
  readonly productionSourceSha256: string
  readonly revision: string
  readonly sourceTreeDirty: boolean
  readonly toolVersions: Readonly<Record<string, string>>
}

export interface CurrentConsumerObservation {
  readonly fixture: {
    readonly id: string
    readonly source: string
  }
  readonly size: BundleSize
  readonly sourceSha256: string
}

export interface AcceptedConsumerBudget {
  readonly fixtures: Readonly<
    Record<
      string,
      {
        readonly maximum: BundleSize
        readonly source: string
        readonly sourceSha256: string
      }
    >
  >
  readonly provenance: ConsumerBudgetProvenance
  readonly schemaVersion: 1
}

export interface AcceptedConsumerBudgetEvaluation {
  readonly deltas: Readonly<Record<string, BundleSize>>
  readonly status: 'failed' | 'passed' | 'pending'
  readonly violations: readonly string[]
}

export type HistoricalComparisonClassification = 'all-larger' | 'all-smaller' | 'mixed' | 'unchanged'

function sizeDirection(size: BundleSize): -1 | 0 | 1 | 2 {
  const values = [size.minifiedBytes, size.gzipBytes, size.brotliBytes]
  if (values.every((value) => value === 0)) return 0
  if (values.every((value) => value >= 0)) return 1
  if (values.every((value) => value <= 0)) return -1
  return 2
}

/** Positive historical differences mean the current bundle is smaller. */
export function classifyHistoricalComparison(
  captures: readonly { readonly historicalDifference: BundleSize }[]
): HistoricalComparisonClassification {
  if (captures.length === 0) throw new Error('Historical comparison requires at least one consumer fixture')
  const directions = captures.map(({ historicalDifference }) => sizeDirection(historicalDifference))
  if (directions.every((direction) => direction === 0)) return 'unchanged'
  if (directions.every((direction) => direction === 1)) return 'all-smaller'
  if (directions.every((direction) => direction === -1)) return 'all-larger'
  return 'mixed'
}

export function createConsumerBudgetCandidate(
  observations: readonly CurrentConsumerObservation[],
  provenance: ConsumerBudgetProvenance
): AcceptedConsumerBudget {
  const fixtures: Record<string, AcceptedConsumerBudget['fixtures'][string]> = {}
  for (const observation of observations) {
    if (observation.fixture.id in fixtures) {
      throw new Error(`Duplicate consumer fixture '${observation.fixture.id}'`)
    }
    fixtures[observation.fixture.id] = {
      maximum: { ...observation.size },
      source: observation.fixture.source,
      sourceSha256: observation.sourceSha256,
    }
  }
  return { fixtures, provenance, schemaVersion: 1 }
}

export function readAcceptedConsumerBudget(root: string): AcceptedConsumerBudget | undefined {
  const path = resolve(root, ACCEPTED_CONSUMER_BUDGET_PATH)
  if (!existsSync(path)) return undefined
  return JSON.parse(readFileSync(path, 'utf8')) as AcceptedConsumerBudget
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validateExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  label: string,
  violations: string[]
): void {
  const actual = Object.keys(value).sort()
  const wanted = [...expected].sort()
  for (const key of wanted) {
    if (!(key in value)) violations.push(`${label} is missing key '${key}'`)
  }
  for (const key of actual) {
    if (!wanted.includes(key)) violations.push(`${label} has unexpected key '${key}'`)
  }
}

function validateHash(value: unknown, label: string, violations: string[]): void {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) {
    violations.push(`${label} must be a lowercase SHA-256 digest`)
  }
}

function validateMaximum(value: unknown, label: string, violations: string[]): BundleSize | undefined {
  if (!isRecord(value)) {
    violations.push(`${label} must be an object`)
    return undefined
  }
  const metrics = ['brotliBytes', 'gzipBytes', 'minifiedBytes'] as const
  validateExactKeys(value, metrics, label, violations)
  let valid = true
  for (const metric of metrics) {
    const metricValue = value[metric]
    if (!Number.isSafeInteger(metricValue) || (metricValue as number) < 0) {
      valid = false
      violations.push(`${label}.${metric} must be a non-negative safe integer`)
    }
  }
  if (!valid || Object.keys(value).length !== metrics.length) return undefined
  return value as unknown as BundleSize
}

function validateToolVersions(value: unknown, violations: string[]): void {
  if (
    !isRecord(value) ||
    Object.keys(value).length === 0 ||
    Object.values(value).some((version) => typeof version !== 'string' || version.length === 0)
  ) {
    violations.push('Accepted consumer budget must record non-empty tool versions')
  }
}

function validateObservationSize(size: BundleSize, label: string, violations: string[]): boolean {
  let valid = true
  for (const [metric, value] of Object.entries(size)) {
    if (!Number.isSafeInteger(value) || value < 0) {
      valid = false
      violations.push(`${label}.${metric} must be a non-negative safe integer`)
    }
  }
  return valid
}

function subtract(current: BundleSize, maximum: BundleSize): BundleSize {
  return {
    brotliBytes: current.brotliBytes - maximum.brotliBytes,
    gzipBytes: current.gzipBytes - maximum.gzipBytes,
    minifiedBytes: current.minifiedBytes - maximum.minifiedBytes,
  }
}

export function evaluateAcceptedConsumerBudget(
  budget: AcceptedConsumerBudget | undefined,
  observations: readonly CurrentConsumerObservation[]
): AcceptedConsumerBudgetEvaluation {
  if (budget === undefined) {
    return {
      deltas: {},
      status: 'pending',
      violations: [`No accepted budget exists at ${ACCEPTED_CONSUMER_BUDGET_PATH}`],
    }
  }

  const violations: string[] = []
  const deltas: Record<string, BundleSize> = {}
  const untrustedBudget: unknown = budget
  if (!isRecord(untrustedBudget)) {
    return {
      deltas,
      status: 'failed',
      violations: ['Accepted consumer budget must be an object'],
    }
  }
  validateExactKeys(untrustedBudget, ['fixtures', 'provenance', 'schemaVersion'], 'budget', violations)
  if (untrustedBudget.schemaVersion !== 1) {
    violations.push(`Unsupported consumer budget schema ${String(untrustedBudget.schemaVersion)}`)
  }
  const provenanceValue = untrustedBudget.provenance
  const provenance = isRecord(provenanceValue) ? provenanceValue : undefined
  if (!provenance) {
    violations.push('Accepted consumer budget provenance must be an object')
  } else {
    validateExactKeys(
      provenance,
      ['captureStatus', 'lockfileSha256', 'productionSourceSha256', 'revision', 'sourceTreeDirty', 'toolVersions'],
      'provenance',
      violations
    )
  }
  if (provenance?.sourceTreeDirty === true) {
    violations.push('Accepted consumer budget was captured from a dirty source tree')
  } else if (provenance?.sourceTreeDirty !== false) {
    violations.push('Accepted consumer budget provenance.sourceTreeDirty must be false')
  }
  if (provenance?.captureStatus !== 'measured-unreviewed') {
    violations.push('Accepted consumer budget must come from a definitive measured-unreviewed capture')
  }
  if (typeof provenance?.revision !== 'string' || !/^[0-9a-f]{40}$/.test(provenance.revision)) {
    violations.push('Accepted consumer budget revision must be a full Git revision')
  }
  validateHash(provenance?.lockfileSha256, 'provenance.lockfileSha256', violations)
  validateHash(provenance?.productionSourceSha256, 'provenance.productionSourceSha256', violations)
  validateToolVersions(provenance?.toolVersions, violations)

  const fixturesValue = untrustedBudget.fixtures
  const fixtures = isRecord(fixturesValue) ? fixturesValue : undefined
  if (!fixtures) violations.push('Accepted consumer budget fixtures must be an object')

  const observedIds = new Set<string>()
  for (const observation of observations) {
    const { id, source } = observation.fixture
    if (observedIds.has(id)) {
      violations.push(`Current observations contain duplicate fixture '${id}'`)
      continue
    }
    observedIds.add(id)
    const acceptedValue = fixtures?.[id]
    const accepted = isRecord(acceptedValue) ? acceptedValue : undefined
    if (!accepted) {
      violations.push(`Accepted consumer budget is missing fixture '${id}'`)
      continue
    }
    validateExactKeys(accepted, ['maximum', 'source', 'sourceSha256'], `fixtures.${id}`, violations)
    if (accepted.source !== source) {
      violations.push(`Fixture '${id}' source changed from '${String(accepted.source)}' to '${source}'`)
    }
    validateHash(accepted.sourceSha256, `fixtures.${id}.sourceSha256`, violations)
    if (accepted.sourceSha256 !== observation.sourceSha256) {
      violations.push(`Fixture '${id}' source hash does not match its accepted budget`)
    }
    const maximum = validateMaximum(accepted.maximum, `fixtures.${id}.maximum`, violations)
    if (!maximum || !validateObservationSize(observation.size, `observations.${id}.size`, violations)) continue
    const delta = subtract(observation.size, maximum)
    deltas[id] = delta
    for (const [metric, value] of Object.entries(delta)) {
      if (value > 0) violations.push(`Fixture '${id}' exceeds ${metric} by ${value} byte${value === 1 ? '' : 's'}`)
    }
  }
  for (const id of Object.keys(fixtures ?? {})) {
    if (!observedIds.has(id)) violations.push(`Accepted consumer budget contains extra fixture '${id}'`)
  }

  return {
    deltas,
    status: violations.length === 0 ? 'passed' : 'failed',
    violations,
  }
}

export function assertAcceptedConsumerBudget(
  captureStatus: 'measured-unreviewed' | 'smoke-dirty',
  evaluation: AcceptedConsumerBudgetEvaluation
): void {
  if (captureStatus === 'smoke-dirty') return
  if (evaluation.status !== 'passed') {
    throw new Error(`Accepted-current consumer budget ${evaluation.status}: ${evaluation.violations.join('; ')}`)
  }
}
