import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { BatchGeometryStrategy, BatchMesh, BatchRegistry } from '../traits'

interface AuditedSource {
  readonly file: URL
  readonly objectReadAllowlist: ReadonlySet<string>
  readonly objectPatchAllowlist: ReadonlySet<string>
}

const NO_OBJECT_READS = new Set<string>()
const BATCH_OBJECT_READS = new Set(['BatchMesh', 'BatchRegistry'])
const BATCH_UTIL_OBJECT_PATCHES = new Set(['BatchGeometryStrategy', 'BatchMesh'])

const auditedSources: readonly AuditedSource[] = [
  {
    file: new URL('./batchAssignSystem.ts', import.meta.url),
    objectReadAllowlist: BATCH_OBJECT_READS,
    objectPatchAllowlist: NO_OBJECT_READS,
  },
  {
    file: new URL('./batchReassignSystem.ts', import.meta.url),
    objectReadAllowlist: BATCH_OBJECT_READS,
    objectPatchAllowlist: NO_OBJECT_READS,
  },
  {
    file: new URL('./batchRemoveSystem.ts', import.meta.url),
    objectReadAllowlist: BATCH_OBJECT_READS,
    objectPatchAllowlist: NO_OBJECT_READS,
  },
  {
    file: new URL('./batchSortSystem.ts', import.meta.url),
    objectReadAllowlist: BATCH_OBJECT_READS,
    objectPatchAllowlist: NO_OBJECT_READS,
  },
  {
    file: new URL('../batchUtils.ts', import.meta.url),
    objectReadAllowlist: new Set(['BatchMesh']),
    objectPatchAllowlist: BATCH_UTIL_OBJECT_PATCHES,
  },
  {
    file: new URL('../../materials/MaterialEffect.ts', import.meta.url),
    objectReadAllowlist: NO_OBJECT_READS,
    objectPatchAllowlist: NO_OBJECT_READS,
  },
  {
    file: new URL('../../lights/LightEffect.ts', import.meta.url),
    objectReadAllowlist: NO_OBJECT_READS,
    objectPatchAllowlist: NO_OBJECT_READS,
  },
  {
    file: new URL('../../pipeline/PassEffect.ts', import.meta.url),
    objectReadAllowlist: NO_OBJECT_READS,
    objectPatchAllowlist: NO_OBJECT_READS,
  },
]

describe('numeric hot-path source contract', () => {
  it('keeps the object-trait allowlist truthful', () => {
    expect(BatchMesh.kind).toBe('object')
    expect(BatchRegistry.kind).toBe('object')
    expect(BatchGeometryStrategy.kind).toBe('object')
  })

  it.each(auditedSources)(
    '$file uses direct SoA access for every numeric trait',
    ({ file, objectReadAllowlist, objectPatchAllowlist }) => {
      const source = readFileSync(file, 'utf8')
      const reads = [...source.matchAll(/\bworld\.read\(\s*[^,]+,\s*([A-Za-z_$][\w$]*)/g)].map((match) => match[1]!)
      const patches = [...source.matchAll(/\bworld\.patch\(\s*[^,]+,\s*([A-Za-z_$][\w$]*)/g)].map((match) => match[1]!)

      for (const traitName of reads) expect(objectReadAllowlist.has(traitName)).toBe(true)
      for (const traitName of patches) expect(objectPatchAllowlist.has(traitName)).toBe(true)
    }
  )
})
