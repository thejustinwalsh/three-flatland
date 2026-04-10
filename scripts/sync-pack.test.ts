import { describe, it, expect } from 'vitest'
import { buildVersionTable, syncDeps } from './sync-pack'

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

describe('syncDeps (table-driven)', () => {
  const table = {
    three: '^0.183.1',
    'three-flatland': '^0.1.0-alpha.2',
    react: '^19.0.0',
  }

  it('overwrites a stale pinned version', () => {
    const deps = { three: '^0.182.0', lodash: '^4.17.21' }
    const changed = syncDeps(deps, table)
    expect(changed).toBe(true)
    expect(deps).toEqual({ three: '^0.183.1', lodash: '^4.17.21' })
  })

  it('resolves the catalog: shorthand', () => {
    const deps = { three: 'catalog:' }
    const changed = syncDeps(deps, table)
    expect(changed).toBe(true)
    expect(deps.three).toBe('^0.183.1')
  })

  it('resolves the workspace:* shorthand', () => {
    const deps = { 'three-flatland': 'workspace:*' }
    const changed = syncDeps(deps, table)
    expect(changed).toBe(true)
    expect(deps['three-flatland']).toBe('^0.1.0-alpha.2')
  })

  it('leaves out-of-table deps alone', () => {
    const deps = { 'chart.js': '^4.4.0' }
    const changed = syncDeps(deps, table)
    expect(changed).toBe(false)
    expect(deps['chart.js']).toBe('^4.4.0')
  })

  it('returns false when every dep already matches the table', () => {
    const deps = { three: '^0.183.1', react: '^19.0.0' }
    const changed = syncDeps(deps, table)
    expect(changed).toBe(false)
  })

  it('handles undefined deps object gracefully', () => {
    expect(syncDeps(undefined, table)).toBe(false)
  })

  it('mixes all behaviors in one call', () => {
    const deps = {
      three: '^0.182.0', // stale → overwrite
      react: 'catalog:', // shorthand → resolve
      'chart.js': '^4.4.0', // out-of-table → leave
      'three-flatland': '^0.1.0-alpha.2', // already matches → no-op
    }
    const changed = syncDeps(deps, table)
    expect(changed).toBe(true)
    expect(deps).toEqual({
      three: '^0.183.1',
      react: '^19.0.0',
      'chart.js': '^4.4.0',
      'three-flatland': '^0.1.0-alpha.2',
    })
  })
})
