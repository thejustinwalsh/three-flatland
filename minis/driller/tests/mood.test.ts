import { describe, it, expect } from 'vitest'
import { applyMoodEvent, driftMood, moodTarget } from '../src/systems/ai-mood'

describe('driftMood', () => {
  it('moves current toward target by MOOD_LERP', () => {
    const m = { greed: 0, fear: 0, drive: 0 }
    const t = { greed: 1, fear: 0, drive: 0 }
    const after = driftMood(m, t)
    expect(after.greed).toBeGreaterThan(0)
    expect(after.greed).toBeLessThan(1)
  })

  it('clamps to [0, 1]', () => {
    const m = { greed: 0.99, fear: 0.99, drive: 0.99 }
    const t = { greed: 5, fear: 5, drive: 5 }
    const after = driftMood(m, t)
    expect(after.greed).toBeLessThanOrEqual(1)
    expect(after.fear).toBeLessThanOrEqual(1)
    expect(after.drive).toBeLessThanOrEqual(1)
  })
})

describe('applyMoodEvent', () => {
  const base = { greed: 0.5, fear: 0.5, drive: 0.5 }

  it('helpful-tap lowers fear', () => {
    expect(applyMoodEvent(base, 'helpful-tap').fear).toBeLessThan(base.fear)
  })

  it('evil-tap raises fear', () => {
    expect(applyMoodEvent(base, 'evil-tap').fear).toBeGreaterThan(base.fear)
  })

  it('gem-collected lowers greed', () => {
    expect(applyMoodEvent(base, 'gem-collected').greed).toBeLessThan(base.greed)
  })

  it('sag-overhead spikes fear above the evil-tap delta', () => {
    expect(applyMoodEvent(base, 'sag-overhead').fear).toBeGreaterThan(
      applyMoodEvent(base, 'evil-tap').fear
    )
  })

  it('over-pet flips pet polarity (raises fear)', () => {
    expect(applyMoodEvent(base, 'over-pet').fear).toBeGreaterThan(base.fear)
  })

  it('long-no-touch slowly raises drive', () => {
    expect(applyMoodEvent(base, 'long-no-touch').drive).toBeGreaterThan(base.drive)
  })
})

describe('moodTarget', () => {
  it('boosts greed when gems are visible', () => {
    const empty = moodTarget({
      visibleGemCount: 0,
      sagOverhead: false,
      hazardOverhead: false,
      ticksSinceLastTap: 0,
    })
    const some = moodTarget({
      visibleGemCount: 3,
      sagOverhead: false,
      hazardOverhead: false,
      ticksSinceLastTap: 0,
    })
    expect(some.greed).toBeGreaterThan(empty.greed)
  })

  it('spikes fear when sag is overhead', () => {
    const calm = moodTarget({
      visibleGemCount: 0,
      sagOverhead: false,
      hazardOverhead: false,
      ticksSinceLastTap: 0,
    })
    const danger = moodTarget({
      visibleGemCount: 0,
      sagOverhead: true,
      hazardOverhead: false,
      ticksSinceLastTap: 0,
    })
    expect(danger.fear).toBeGreaterThan(calm.fear)
  })

  it('spikes fear when hazard is overhead', () => {
    const calm = moodTarget({
      visibleGemCount: 0,
      sagOverhead: false,
      hazardOverhead: false,
      ticksSinceLastTap: 0,
    })
    const haz = moodTarget({
      visibleGemCount: 0,
      sagOverhead: false,
      hazardOverhead: true,
      ticksSinceLastTap: 0,
    })
    expect(haz.fear).toBeGreaterThan(calm.fear)
  })

  it('raises drive over time without user input', () => {
    const fresh = moodTarget({
      visibleGemCount: 0,
      sagOverhead: false,
      hazardOverhead: false,
      ticksSinceLastTap: 0,
    })
    const stale = moodTarget({
      visibleGemCount: 0,
      sagOverhead: false,
      hazardOverhead: false,
      ticksSinceLastTap: 1200,
    })
    expect(stale.drive).toBeGreaterThan(fresh.drive)
  })
})
