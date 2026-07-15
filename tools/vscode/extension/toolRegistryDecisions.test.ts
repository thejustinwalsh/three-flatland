import { describe, expect, it } from 'vitest'
import { decideToolConfigAction } from './toolRegistryDecisions'

describe('decideToolConfigAction', () => {
  it('noops when the setting change did not actually flip enabled vs. live state', () => {
    expect(decideToolConfigAction({ enabled: true, wasLive: true, liveToggle: true })).toBe('noop')
    expect(decideToolConfigAction({ enabled: false, wasLive: false, liveToggle: true })).toBe(
      'noop'
    )
    expect(decideToolConfigAction({ enabled: true, wasLive: true, liveToggle: false })).toBe('noop')
  })

  it('registers a liveToggle tool turning on', () => {
    expect(decideToolConfigAction({ enabled: true, wasLive: false, liveToggle: true })).toBe(
      'register'
    )
  })

  it('disposes a liveToggle tool turning off', () => {
    expect(decideToolConfigAction({ enabled: false, wasLive: true, liveToggle: true })).toBe(
      'dispose'
    )
  })

  it('prompts for reload — enable direction — on a non-liveToggle tool', () => {
    expect(decideToolConfigAction({ enabled: true, wasLive: false, liveToggle: false })).toBe(
      'reload-prompt-enable'
    )
  })

  it('prompts for reload — disable direction — on a non-liveToggle tool', () => {
    expect(decideToolConfigAction({ enabled: false, wasLive: true, liveToggle: false })).toBe(
      'reload-prompt-disable'
    )
  })
})
