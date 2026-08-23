import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  MINIMUM_REPRESENTATIVE_SAVING,
  PRE_MIGRATION_REVISION,
  RECORDED_KOOTA_BASELINE,
  assertCaptureClean,
  assertMinimumNetSaving,
  captureConsumerBundleEvidence,
  consumerFixtures,
  resolveEvidenceOutputDirectory,
  scanPublishedOutputForKoota,
  type ConsumerBundleEvidenceReport,
} from './consumer-bundle-evidence.ts'

const repositoryRoot = resolve(import.meta.dirname, '../../..')
const captureDirectory = mkdtempSync(join(tmpdir(), 'three-flatland-consumer-evidence-test-'))

let report: ConsumerBundleEvidenceReport

beforeAll(async () => {
  ;({ report } = await captureConsumerBundleEvidence({
    allowDirty: true,
    outputDirectory: captureDirectory,
    repositoryRoot,
    requirePublishedOutput: false,
  }))
}, 120_000)

afterAll(() => {
  rmSync(captureDirectory, { force: true, recursive: true })
})

describe('representative consumer bundle evidence', () => {
  it('keeps the isolated Koota number as a labeled diagnostic', () => {
    expect(report.isolatedKootaDiagnostic).toMatchObject(RECORDED_KOOTA_BASELINE)
    expect(report.isolatedKootaDiagnostic.kootaInputs.length).toBeGreaterThan(0)
    expect(report.isolatedKootaDiagnostic.kootaBytesInOutput).toBeGreaterThan(0)
    expect(report.isolatedKootaDiagnostic.runtimeInputs).toEqual([])
    expect(report.gate.recordedKootaDiagnosticMatched).toBe(true)
  })

  it('covers every required consumer shape and reports the net-saving floor honestly', () => {
    expect(report.captures.map(({ fixture }) => fixture.id)).toEqual(consumerFixtures.map(({ id }) => id))

    for (const capture of report.captures) {
      expect(capture.baseline.kootaInputs.length).toBeGreaterThan(0)
      expect(capture.baseline.kootaBytesInOutput).toBeGreaterThan(0)
      expect(capture.baseline.runtimeInputs).toEqual([])
    }
    expect(report.gate.baselineIncludesKoota).toBe(true)
    expect(report.gate.baselineOmitsPrivateRuntime).toBe(true)
    expect(report.gate.minimumNetSavingPassed).toBe(
      report.captures.every(
        ({ netDifference }) =>
          netDifference.minifiedBytes >= MINIMUM_REPRESENTATIVE_SAVING.minifiedBytes &&
          netDifference.gzipBytes >= MINIMUM_REPRESENTATIVE_SAVING.gzipBytes
      )
    )
  })

  it('keeps Koota absent and emits one private-runtime output per current consumer', () => {
    expect(report.gate.kootaAbsentFromCurrentConsumerGraphs).toBe(true)
    expect(report.gate.noDuplicateRuntimeChunk).toBe(true)

    for (const capture of report.captures) {
      expect(capture.current.kootaInputs).toEqual([])
      expect(capture.current.kootaBytesInOutput).toBe(0)
      expect(capture.current.runtimeInputs.length).toBeGreaterThan(0)
      expect(capture.current.runtimeBytesInOutput).toBeGreaterThan(0)
      expect(capture.current.runtimeOutputs).toHaveLength(1)
      expect(capture.current.duplicateRuntimeInputs).toEqual([])
    }

    expect(report.sharedGraph.kootaInputs).toEqual([])
    expect(report.sharedGraph.runtimeInputs.length).toBeGreaterThan(0)
    expect(report.sharedGraph.runtimeOutputs.length).toBeGreaterThan(0)
    expect(report.sharedGraph.duplicateRuntimeInputs).toEqual([])
  })

  it('writes inspectable bundles, raw metafiles, and provenance', () => {
    for (const fixture of consumerFixtures) {
      for (const variant of ['current', 'pre-migration']) {
        const bundle = resolve(captureDirectory, `${fixture.id}.${variant}.mjs`)
        const metafile = resolve(captureDirectory, `${fixture.id}.${variant}.metafile.json`)
        expect(existsSync(bundle)).toBe(true)
        expect(existsSync(metafile)).toBe(true)
        const parsed = JSON.parse(readFileSync(metafile, 'utf8')) as {
          inputs?: unknown
          outputs?: unknown
        }
        expect(parsed.inputs).toBeTypeOf('object')
        expect(Object.keys(parsed.inputs as object)).toContain(fixture.source)
        expect(parsed.outputs).toBeTypeOf('object')
      }
    }

    expect(existsSync(resolve(captureDirectory, 'koota-kernel.mjs'))).toBe(true)
    expect(existsSync(resolve(captureDirectory, 'koota-kernel.metafile.json'))).toBe(true)
    expect(existsSync(resolve(captureDirectory, 'shared-graph.metafile.json'))).toBe(true)
    expect(existsSync(resolve(captureDirectory, 'shared-graph/basic-three.js'))).toBe(true)
    expect(existsSync(resolve(captureDirectory, 'shared-graph/basic-react.js'))).toBe(true)
    expect(existsSync(resolve(captureDirectory, 'shared-graph/knightmark.js'))).toBe(true)
    expect(existsSync(resolve(captureDirectory, 'shared-graph/pass-lighting.js'))).toBe(true)
    expect(JSON.parse(readFileSync(resolve(captureDirectory, 'report.json'), 'utf8'))).toEqual(report)
    expect(report.provenance.revision).toMatch(/^[0-9a-f]{40}$/)
    expect(report.provenance.baseline.revision).toBe(PRE_MIGRATION_REVISION)
    expect(report.provenance.baseline.sourceFileCount).toBeGreaterThan(0)
    expect(report.provenance.baseline.sourceSha256).toMatch(/^[0-9a-f]{64}$/)
    expect(report.provenance.lockfileSha256).toMatch(/^[0-9a-f]{64}$/)
    expect(report.provenance.productionSourceSha256).toMatch(/^[0-9a-f]{64}$/)
    expect(report.provenance.harnessSha256).toMatch(/^[0-9a-f]{64}$/)
    expect(report.provenance.fixtureSources).toHaveLength(consumerFixtures.length)
    expect(Object.values(report.provenance.toolVersions).every((version) => version.length > 0)).toBe(true)
    expect(report.status).toBe('smoke-dirty')
  })
})

describe('capture safeguards', () => {
  it('refuses dirty definitive evidence while allowing an explicit smoke run', () => {
    expect(() => assertCaptureClean(true, false)).toThrow(/dirty source tree/)
    expect(() => assertCaptureClean(true, true)).not.toThrow()
    expect(() => assertCaptureClean(false, false)).not.toThrow()
  })

  it('enforces the net-saving floor only for definitive captures', () => {
    expect(() => assertMinimumNetSaving('smoke-dirty', false)).not.toThrow()
    expect(() => assertMinimumNetSaving('measured-unreviewed', true)).not.toThrow()
    expect(() => assertMinimumNetSaving('measured-unreviewed', false)).toThrow(/net-saving floor/)
  })

  it('keeps evidence outside the source tree', () => {
    expect(() =>
      resolveEvidenceOutputDirectory(
        { outputDirectory: resolve(repositoryRoot, 'planning/evidence') },
        repositoryRoot,
        'a'.repeat(40)
      )
    ).toThrow(/outside the source repository/)

    const external = resolve(tmpdir(), 'three-flatland-external-evidence')
    expect(resolveEvidenceOutputDirectory({ outputDirectory: external }, repositoryRoot, 'a'.repeat(40))).toBe(external)
  })

  it('requires and scans the published package output', () => {
    const root = mkdtempSync(join(tmpdir(), 'three-flatland-dist-scan-test-'))
    try {
      expect(() => scanPublishedOutputForKoota(root, true)).toThrow(/dist is missing/)
      const dist = resolve(root, 'packages/three-flatland/dist')
      mkdirSync(dist, { recursive: true })
      writeFileSync(resolve(dist, 'index.js'), "export const clean = 'runtime'\n")
      expect(scanPublishedOutputForKoota(root, true)).toEqual([])
      writeFileSync(resolve(dist, 'nested.js'), "export { createWorld } from 'koota'\n")
      expect(scanPublishedOutputForKoota(root, true)).toEqual(['packages/three-flatland/dist/nested.js'])
    } finally {
      rmSync(root, { force: true, recursive: true })
    }
  })
})
