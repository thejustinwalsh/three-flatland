import { describe, expect, it } from 'vitest'
import { legacyTagLines } from './publish-with-action-output.mjs'

describe('Changesets 3 output compatibility with changesets/action@v1', () => {
  it('preserves the action release-discovery contract for scoped and unscoped packages', () => {
    const events = [
      { type: 'git-tag', tag: 'three-flatland@0.1.0-alpha.11', packageName: 'three-flatland' },
      { type: 'git-tag', tag: '@three-flatland/image@0.1.0-alpha.4', packageName: '@three-flatland/image' },
    ]
    const lines = legacyTagLines(events.map((event) => JSON.stringify(event)).join('\n'))
    // This is the actual discovery expression used by changesets/action@v1.
    const actionPattern = /New tag:\s+(@[^/]+\/[^@]+|[^/]+)@([^\s]+)/
    expect(lines.map((line) => line.match(actionPattern)?.slice(1))).toEqual([
      ['three-flatland', '0.1.0-alpha.11'],
      ['@three-flatland/image', '0.1.0-alpha.4'],
    ])
  })

  it('does not invent releases from an empty report or unrelated events', () => {
    expect(legacyTagLines('')).toEqual([])
    expect(legacyTagLines(JSON.stringify({ type: 'progress', packageName: 'three-flatland' }))).toEqual([])
  })

  it('deduplicates actual tag events', () => {
    const event = JSON.stringify({
      type: 'git-tag',
      tag: 'three-flatland@0.1.0-alpha.11',
      packageName: 'three-flatland',
    })
    expect(legacyTagLines(`${event}\n${event}\n`)).toEqual(['New tag: three-flatland@0.1.0-alpha.11'])
  })

  it('rejects malformed or mismatched reports instead of guessing publication status', () => {
    expect(() => legacyTagLines('{')).toThrow()
    expect(() =>
      legacyTagLines(JSON.stringify({ type: 'git-tag', tag: 'other@1.0.0', packageName: 'three-flatland' }))
    ).toThrow('Invalid Changesets git-tag event')
    expect(() =>
      legacyTagLines(
        JSON.stringify({ type: 'git-tag', tag: 'three-flatland@1.0.0\nforged', packageName: 'three-flatland' })
      )
    ).toThrow('Invalid Changesets git-tag event')
  })
})
