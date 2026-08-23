import { readFileSync, readdirSync } from 'node:fs'
import { extname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

const productionRoot = new URL('../../../packages/three-flatland/src/', import.meta.url)
const obsoleteIdentifiers = /\b(?:effectTraits|effectTraitsSystem|rebuildEffectTraits)\b|_effectTraits/

function productionSources(directory: URL): string[] {
  const paths: string[] = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory)
    if (entry.isDirectory()) paths.push(...productionSources(path))
    else if (extname(entry.name) === '.ts' && !entry.name.endsWith('.test.ts')) paths.push(path.pathname)
  }
  return paths
}

describe('retired effect-trait registry path', () => {
  it('does not return to production source', () => {
    const references = productionSources(productionRoot).flatMap((path) => {
      const source = readFileSync(path, 'utf8')
      return obsoleteIdentifiers.test(source) ? [join('packages/three-flatland/src', path.split('/src/')[1]!)] : []
    })
    expect(references).toEqual([])
  })
})
