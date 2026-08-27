import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

interface EvidenceReport {
  readonly esbuild?: string
  readonly environment?: {
    readonly harnessSha256: string
    readonly harnessSources: readonly string[]
    readonly tsx?: string
  }
  readonly harnessSha256?: string
  readonly harnessSources?: readonly string[]
  readonly koota?: string
  readonly measurements?: readonly {
    readonly artifact: string
    readonly brotliBytes: number
    readonly gzipBytes: number
    readonly minifiedBytes: number
  }[]
}

const resultDirectory = resolve(import.meta.dirname, '../../../planning/internal-ecs/results')
const require = createRequire(import.meta.url)
const sizeHarness = resolve(import.meta.dirname, 'measure-kernels-size.ts')

function readReport(name: string): EvidenceReport {
  return JSON.parse(readFileSync(resolve(resultDirectory, name), 'utf8')) as EvidenceReport
}

function provenance(report: EvidenceReport): {
  readonly hash: string
  readonly sources: readonly string[]
} {
  if (report.environment !== undefined) {
    return {
      hash: report.environment.harnessSha256,
      sources: report.environment.harnessSources,
    }
  }
  if (report.harnessSha256 === undefined || report.harnessSources === undefined) {
    throw new Error('Evidence report is missing harness provenance')
  }
  return { hash: report.harnessSha256, sources: report.harnessSources }
}

function sourceHash(sources: readonly string[]): string {
  const hash = createHash('sha256')
  for (const source of sources) {
    hash.update(source)
    hash.update(readFileSync(resolve(import.meta.dirname, source)))
  }
  return hash.digest('hex')
}

function packageVersion(name: string): string {
  const entry = require.resolve(name)
  const packageJson = JSON.parse(readFileSync(resolve(dirname(entry), '../package.json'), 'utf8')) as {
    version: string
  }
  return packageJson.version
}

function measureCurrentKernelSizes(): EvidenceReport {
  return JSON.parse(
    execFileSync(process.execPath, ['--experimental-strip-types', sizeHarness], {
      cwd: import.meta.dirname,
      encoding: 'utf8',
    })
  ) as EvidenceReport
}

const currentSizeReport = measureCurrentKernelSizes()

describe('checked-in ECS evidence', () => {
  it('keeps every final-manifest checksum synchronized with its artifact', () => {
    const manifest = readFileSync(resolve(resultDirectory, 'final-evidence-manifest.md'), 'utf8')
    const checksums = [...manifest.matchAll(/^\| `([^`]+)`\s+\| `([a-f0-9]{64})`\s+\|$/gm)]

    expect(checksums.length).toBeGreaterThan(0)
    for (const [, artifact, expected] of checksums) {
      const actual = createHash('sha256')
        .update(readFileSync(resolve(resultDirectory, artifact!)))
        .digest('hex')
      expect(actual, artifact).toBe(expected)
    }
  })

  it.each(['kernel-baseline.json', 'kernel-size.json', 'numeric-storage.json'])(
    '%s matches the current harness source',
    (name) => {
      const { hash, sources } = provenance(readReport(name))
      expect(sourceHash(sources)).toBe(hash)
    }
  )

  it('keeps the selected signature kernel under the isolated size caps', () => {
    const signature = currentSizeReport.measurements?.find(({ artifact }) =>
      artifact.startsWith('Signature membership')
    )
    expect(signature).toBeDefined()
    expect(signature!.minifiedBytes).toBeLessThanOrEqual(12_000)
    expect(signature!.gzipBytes).toBeLessThanOrEqual(4_000)
    expect(signature!.brotliBytes).toBeLessThanOrEqual(3_800)
  })

  it('keeps the statically shipped private runtime under the isolated size caps', () => {
    const runtime = currentSizeReport.measurements?.find(
      ({ artifact }) => artifact === 'Flatland shipped runtime with capacity'
    )
    expect(runtime).toBeDefined()
    expect(runtime!.minifiedBytes).toBeLessThanOrEqual(12_000)
    expect(runtime!.gzipBytes).toBeLessThanOrEqual(4_000)
    expect(runtime!.brotliBytes).toBeLessThanOrEqual(3_800)
  })

  it('matches the resolved bundle-tool dependency versions', () => {
    const report = readReport('kernel-size.json')
    expect(report.koota).toBe(packageVersion('koota'))
    expect(report.esbuild).toBe(packageVersion('esbuild'))
    expect(readReport('kernel-baseline.json').environment?.tsx).toBe(packageVersion('tsx'))
  })

  it('matches the checked-in size measurements to a live isolated bundle', () => {
    expect(currentSizeReport.measurements).toEqual(readReport('kernel-size.json').measurements)
  })
})
