import { describe, it, expect } from 'vitest'
import { channelDefaults } from './channels'
import type { ChannelName, ChannelNodeMap, WithRequiredChannels } from './channels'
import type Node from 'three/src/nodes/core/Node.js'

describe('channelDefaults', () => {
  it('has a default factory for the "normal" channel', () => {
    expect(channelDefaults).toHaveProperty('normal')
    expect(typeof channelDefaults.normal).toBe('function')
  })

  it('normal factory returns a TSL node', () => {
    const node = channelDefaults.normal!()
    // TSL vec3() returns a node-like object with .nodeType
    expect(node).toBeDefined()
    expect(typeof node).toBe('object')
  })

  it('covers all built-in ChannelNodeMap keys', () => {
    // Known built-in channels that should have defaults
    const builtInChannels: ChannelName[] = ['normal']
    for (const ch of builtInChannels) {
      expect(channelDefaults).toHaveProperty(ch)
    }
  })
})

// Compile-time type assertions for WithRequiredChannels
describe('WithRequiredChannels (type-level)', () => {
  it('maps known channels to their typed node', () => {
    // This block only tests that the types compile correctly
    type Result = WithRequiredChannels<readonly ['normal']>
    const _check: Result = {} as { normal: Node<'vec3'> }
    expect(_check).toBeDefined()
  })

  it('maps unknown channels to generic Node', () => {
    type Result = WithRequiredChannels<readonly ['custom']>
    const _check: Result = {} as { custom: Node }
    expect(_check).toBeDefined()
  })

  it('maps mixed known and unknown channels', () => {
    type Result = WithRequiredChannels<readonly ['normal', 'roughness']>
    const _check: Result = {} as { normal: Node<'vec3'>; roughness: Node }
    expect(_check).toBeDefined()
  })
})
