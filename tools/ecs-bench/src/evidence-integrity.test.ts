import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

interface EvidenceReport {
  readonly environment?: {
    readonly harnessSha256: string
    readonly harnessSources: readonly string[]
  }
  readonly harnessSha256?: string
  readonly harnessSources?: readonly string[]
  readonly measurements?: readonly {
    readonly artifact: string
    readonly brotliBytes: number
    readonly gzipBytes: number
    readonly minifiedBytes: number
  }[]
}

const resultDirectory = resolve(import.meta.dirname, '../../../planning/internal-ecs/results')

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

describe('checked-in ECS evidence', () => {
  it.each(['kernel-baseline.json', 'kernel-size.json', 'numeric-storage.json'])(
    '%s matches the current harness source',
    (name) => {
      const { hash, sources } = provenance(readReport(name))
      expect(sourceHash(sources)).toBe(hash)
    }
  )

  it('keeps the selected signature kernel under the isolated size caps', () => {
    const report = readReport('kernel-size.json')
    const signature = report.measurements?.find(({ artifact }) => artifact.startsWith('Signature membership'))
    expect(signature).toBeDefined()
    expect(signature!.minifiedBytes).toBeLessThanOrEqual(12_000)
    expect(signature!.gzipBytes).toBeLessThanOrEqual(4_000)
    expect(signature!.brotliBytes).toBeLessThanOrEqual(3_800)
  })
})
