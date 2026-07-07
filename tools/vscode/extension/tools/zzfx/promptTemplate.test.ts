import { describe, expect, it } from 'vitest'
import { PARAM_ORDER } from '../../../webview/zzfx/params'
import { buildPrompt, buildRetryPrompt } from './promptTemplate'

describe('buildPrompt', () => {
  it('includes the category and style tags verbatim', () => {
    const prompt = buildPrompt('Explosion', ['boomy', 'low'])
    expect(prompt).toContain('Explosion')
    expect(prompt).toContain('boomy, low')
  })

  it('handles no category and no styles without throwing', () => {
    const prompt = buildPrompt(undefined, [])
    expect(prompt).toContain('unspecified')
    expect(prompt).toContain('none specified')
  })

  it('describes every param exactly once, so the schema can never drift from PARAM_SPECS', () => {
    const prompt = buildPrompt('Laser', [])
    for (const key of PARAM_ORDER) {
      const occurrences = prompt.split(`- ${key}:`).length - 1
      expect(occurrences, `expected exactly one "- ${key}:" line`).toBe(1)
    }
  })

  it('asks for JSON-only output with no markdown fences', () => {
    const prompt = buildPrompt('Laser', [])
    expect(prompt.toLowerCase()).toContain('json object')
    expect(prompt.toLowerCase()).toContain('markdown code fences')
  })
})

describe('buildRetryPrompt', () => {
  it('echoes the reason and truncates a very long previous response', () => {
    const longResponse = 'x'.repeat(2000)
    const prompt = buildRetryPrompt(longResponse, 'response was not valid JSON')
    expect(prompt).toContain('response was not valid JSON')
    expect(prompt.length).toBeLessThan(longResponse.length)
  })
})
