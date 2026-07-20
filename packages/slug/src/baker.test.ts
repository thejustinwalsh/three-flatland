import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import baker from './baker'

describe('slug baker registration', () => {
  it('default-exports a Baker named slug', () => {
    expect(baker.name).toBe('slug')
    expect(typeof baker.run).toBe('function')
    expect(typeof baker.description).toBe('string')
    expect(baker.usage!()).toContain('slug-bake')
  })

  it('is registered in package.json flatland.bake pointing at the built entry', () => {
    const pkg = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'package.json'), 'utf-8'))
    expect(pkg.flatland.bake).toEqual([
      {
        name: 'slug',
        description: expect.stringContaining('Slug'),
        entry: './dist/baker.js',
      },
    ])
  })
})
