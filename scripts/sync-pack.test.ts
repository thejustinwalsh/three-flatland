import { describe, it, expect } from 'vitest'
import { buildVersionTable } from './sync-pack'

describe('buildVersionTable', () => {
  it('merges catalog and internal entries', () => {
    const catalog = { three: '^0.183.1', react: '^19.0.0' }
    const internal = { 'three-flatland': '0.1.0-alpha.2' }
    const table = buildVersionTable(catalog, internal)
    expect(table).toEqual({
      three: '^0.183.1',
      react: '^19.0.0',
      'three-flatland': '^0.1.0-alpha.2',
    })
  })

  it('prefixes internal versions with ^', () => {
    const table = buildVersionTable({}, { pkg: '1.2.3' })
    expect(table.pkg).toBe('^1.2.3')
  })

  it('uses catalog values verbatim (they already include range prefix)', () => {
    const table = buildVersionTable({ a: '^1.0.0', b: '~2.0.0', c: '>=3.0.0' }, {})
    expect(table).toEqual({ a: '^1.0.0', b: '~2.0.0', c: '>=3.0.0' })
  })

  it('lets internal override catalog on name collision', () => {
    const table = buildVersionTable({ shared: '^1.0.0' }, { shared: '2.0.0' })
    expect(table.shared).toBe('^2.0.0')
  })
})
