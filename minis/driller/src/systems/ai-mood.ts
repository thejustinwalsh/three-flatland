import { MOOD_LERP } from '../constants'

export interface MoodVec {
  greed: number
  fear: number
  drive: number
}

export type MoodEvent =
  | 'helpful-tap'
  | 'evil-tap'
  | 'gem-collected'
  | 'sag-overhead'
  | 'survived-near-miss'
  | 'over-pet'
  | 'long-no-touch'
  | 'pet'

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v))

/**
 * Drift the current mood toward a target with `lerp(curr, target, MOOD_LERP)`
 * per axis. Returns a new vec; does not mutate the input.
 */
export function driftMood(current: MoodVec, target: MoodVec): MoodVec {
  return {
    greed: clamp01(current.greed + (target.greed - current.greed) * MOOD_LERP),
    fear: clamp01(current.fear + (target.fear - current.fear) * MOOD_LERP),
    drive: clamp01(current.drive + (target.drive - current.drive) * MOOD_LERP),
  }
}

/**
 * Apply a discrete event bias to mood. Returns a new vec.
 *
 * The deltas are intentionally chunky — drift smooths them out, and large
 * events (sag overhead, evil tap) need to actually re-prioritize the
 * planner via the hysteresis-gated selector.
 */
export function applyMoodEvent(m: MoodVec, ev: MoodEvent): MoodVec {
  const r = { ...m }
  switch (ev) {
    case 'helpful-tap':
    case 'pet':
      r.fear = clamp01(r.fear - 0.15)
      break
    case 'evil-tap':
      r.fear = clamp01(r.fear + 0.4)
      break
    case 'gem-collected':
      r.greed = clamp01(r.greed - 0.3)
      break
    case 'sag-overhead':
      r.fear = clamp01(r.fear + 0.5)
      break
    case 'survived-near-miss':
      r.fear = clamp01(r.fear - 0.2)
      break
    case 'over-pet':
      r.fear = clamp01(r.fear + 0.3)
      break
    case 'long-no-touch':
      r.drive = clamp01(r.drive + 0.05)
      break
  }
  return r
}

/**
 * Default mood-target heuristic given a sketch of the current world. Real
 * AI runtime composes this with applyMoodEvent for one-shots.
 *
 * Greed is bumped harder than the original spec — a single visible gem
 * pulls greed up to ~0.5 (enough to compete with default Drive=0.5).
 * Multiple gems push greed toward 1.0 so the seeker planner takes over.
 *
 * Fear spikes on either sag overhead OR an active falling-rock hazard
 * above the driller's column.
 */
export function moodTarget(input: {
  visibleGemCount: number
  sagOverhead: boolean
  hazardOverhead: boolean
  ticksSinceLastTap: number
}): MoodVec {
  const greedBase = input.visibleGemCount > 0
    ? Math.min(1, 0.35 + input.visibleGemCount * 0.18)
    : 0.05
  const danger = input.sagOverhead || input.hazardOverhead
  return {
    greed: greedBase,
    fear: danger ? 0.9 : 0.08,
    // Drive ramps with idle but is dampened when greed/fear pull elsewhere.
    drive: Math.min(1, 0.45 + input.ticksSinceLastTap / 600 - greedBase * 0.3),
  }
}
