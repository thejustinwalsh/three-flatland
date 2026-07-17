// ZzFX's 21 positional synth params — https://github.com/KilledByAPixel/ZzFX
// `ZZFX.buildSamples` signature (source of truth for order + defaults):
//   volume, randomness, frequency, attack, sustain, release, shape,
//   shapeCurve, slide, deltaSlide, pitchJump, pitchJumpTime, repeatTime,
//   noise, modulation, bitCrush, delay, sustainVolume, decay, tremolo, filter

export type ParamKey =
  | 'volume'
  | 'randomness'
  | 'frequency'
  | 'attack'
  | 'sustain'
  | 'release'
  | 'shape'
  | 'shapeCurve'
  | 'slide'
  | 'deltaSlide'
  | 'pitchJump'
  | 'pitchJumpTime'
  | 'repeatTime'
  | 'noise'
  | 'modulation'
  | 'bitCrush'
  | 'delay'
  | 'sustainVolume'
  | 'decay'
  | 'tremolo'
  | 'filter'

export type ParamGroupKey = 'envelope' | 'pitch' | 'shape' | 'effects'

export type ParamSpec = {
  key: ParamKey
  label: string
  default: number
  min: number
  max: number
  /** UI drag/keyboard/NumberField granularity — zzfx itself takes floats. */
  step: number
  /** Value is rounded to the nearest integer (only `shape`). */
  integer?: boolean
}

// Canonical positional order — index in this array IS the argument index
// `zzfx(...)` expects. `toArgs`/`fromArgs`/playback all key off this order;
// do not reorder without updating those.
export const PARAM_ORDER: readonly ParamKey[] = [
  'volume',
  'randomness',
  'frequency',
  'attack',
  'sustain',
  'release',
  'shape',
  'shapeCurve',
  'slide',
  'deltaSlide',
  'pitchJump',
  'pitchJumpTime',
  'repeatTime',
  'noise',
  'modulation',
  'bitCrush',
  'delay',
  'sustainVolume',
  'decay',
  'tremolo',
  'filter',
]

export const PARAM_SPECS: Readonly<Record<ParamKey, ParamSpec>> = {
  volume: { key: 'volume', label: 'Volume', default: 1, min: 0, max: 1, step: 0.01 },
  randomness: { key: 'randomness', label: 'Randomness', default: 0.05, min: 0, max: 2, step: 0.01 },
  frequency: { key: 'frequency', label: 'Frequency', default: 220, min: 0, max: 20000, step: 1 },
  attack: { key: 'attack', label: 'Attack', default: 0, min: 0, max: 1, step: 0.01 },
  sustain: { key: 'sustain', label: 'Sustain', default: 0, min: 0, max: 1, step: 0.01 },
  release: { key: 'release', label: 'Release', default: 0.1, min: 0, max: 1, step: 0.01 },
  shape: { key: 'shape', label: 'Shape', default: 0, min: 0, max: 4, step: 1, integer: true },
  shapeCurve: { key: 'shapeCurve', label: 'Shape Curve', default: 1, min: -1, max: 3, step: 0.1 },
  slide: { key: 'slide', label: 'Slide', default: 0, min: -9, max: 9, step: 0.1 },
  deltaSlide: { key: 'deltaSlide', label: 'Delta Slide', default: 0, min: -1, max: 1, step: 0.01 },
  pitchJump: { key: 'pitchJump', label: 'Pitch Jump', default: 0, min: -1200, max: 1200, step: 1 },
  pitchJumpTime: {
    key: 'pitchJumpTime',
    label: 'Pitch Jump Time',
    default: 0,
    min: 0,
    max: 1,
    step: 0.01,
  },
  repeatTime: { key: 'repeatTime', label: 'Repeat Time', default: 0, min: 0, max: 1, step: 0.01 },
  noise: { key: 'noise', label: 'Noise', default: 0, min: 0, max: 1, step: 0.01 },
  modulation: { key: 'modulation', label: 'Modulation', default: 0, min: 0, max: 100, step: 1 },
  bitCrush: { key: 'bitCrush', label: 'Bit Crush', default: 0, min: 0, max: 1, step: 0.01 },
  delay: { key: 'delay', label: 'Delay', default: 0, min: 0, max: 1, step: 0.01 },
  sustainVolume: {
    key: 'sustainVolume',
    label: 'Sustain Volume',
    default: 1,
    min: 0,
    max: 1,
    step: 0.01,
  },
  decay: { key: 'decay', label: 'Decay', default: 0, min: 0, max: 1, step: 0.01 },
  tremolo: { key: 'tremolo', label: 'Tremolo', default: 0, min: 0, max: 1, step: 0.01 },
  filter: { key: 'filter', label: 'Filter', default: 0, min: -2000, max: 2000, step: 1 },
}

// UI grouping — display order within each group, independent of the
// positional order above.
export const PARAM_GROUPS: readonly {
  key: ParamGroupKey
  label: string
  params: readonly ParamKey[]
}[] = [
  {
    key: 'envelope',
    label: 'Envelope',
    params: ['volume', 'attack', 'sustain', 'release', 'sustainVolume', 'decay'],
  },
  {
    key: 'pitch',
    label: 'Pitch',
    params: ['frequency', 'slide', 'deltaSlide', 'pitchJump', 'pitchJumpTime'],
  },
  { key: 'shape', label: 'Shape', params: ['shape', 'shapeCurve'] },
  {
    key: 'effects',
    label: 'Effects',
    params: ['randomness', 'repeatTime', 'noise', 'modulation', 'bitCrush', 'delay', 'tremolo', 'filter'],
  },
]

export const SHAPE_OPTIONS = [
  { value: '0', label: 'Sine' },
  { value: '1', label: 'Triangle' },
  { value: '2', label: 'Saw' },
  { value: '3', label: 'Tan' },
  { value: '4', label: 'Noise' },
] as const

export type ZzfxParams = Record<ParamKey, number>

export function defaultParams(): ZzfxParams {
  const out = {} as ZzfxParams
  for (const key of PARAM_ORDER) out[key] = PARAM_SPECS[key].default
  return out
}

export function clampParam(key: ParamKey, value: number): number {
  const spec = PARAM_SPECS[key]
  if (!Number.isFinite(value)) return spec.default
  let v = Math.min(spec.max, Math.max(spec.min, value))
  if (spec.integer) v = Math.round(v)
  return v
}

/** Full 21-length positional array, every value clamped to its spec. */
export function toDenseArgs(params: ZzfxParams): number[] {
  return PARAM_ORDER.map((key) => clampParam(key, params[key]))
}

// Epsilon for default-equality comparisons — drag/step math can leave a
// value a float ulp off an exact default (e.g. 0.1) even when the user
// never touched it.
const DEFAULT_EPSILON = 1e-9

/**
 * Positional args for `zzfx(...)`, with the trailing run of default-valued
 * params omitted (right-to-left) — the zzfx sparse-array convention, e.g.
 * `zzfx(...[,,,,.1,,,,9])`. Only trailing defaults are trimmed; a default
 * value sitting before the last non-default param is kept dense so the
 * result stays a plain `number[]` (no holes).
 */
export function toArgs(params: ZzfxParams): number[] {
  const raw = toDenseArgs(params)
  let end = raw.length
  while (end > 0) {
    const key = PARAM_ORDER[end - 1]!
    if (Math.abs(raw[end - 1]! - PARAM_SPECS[key].default) > DEFAULT_EPSILON) break
    end--
  }
  return raw.slice(0, end)
}

/**
 * Inverse of `toArgs` (and tolerant of any positional array shorter than
 * 21 elements, or holes represented as `null`/`undefined`) — missing
 * trailing params fill in from their spec default, every value clamped.
 */
export function fromArgs(args: readonly (number | null | undefined)[]): ZzfxParams {
  const result = {} as ZzfxParams
  for (let i = 0; i < PARAM_ORDER.length; i++) {
    const key = PARAM_ORDER[i]!
    const raw = args[i]
    const value = raw === undefined || raw === null ? PARAM_SPECS[key].default : raw
    result[key] = clampParam(key, value)
  }
  return result
}

/**
 * Fills a partial, key-addressed param set with defaults for every
 * omitted key, clamping every provided value. Counterpart to `fromArgs`
 * for producers that emit `{ paramKey: value }` objects rather than
 * positional arrays — the LM generate path and the curated presets both
 * describe sounds this way, since a keyed object is far more reliable
 * for an LLM to emit correctly than a 21-element positional array.
 */
export function fromPartial(partial: Partial<Record<ParamKey, number>>): ZzfxParams {
  const result = {} as ZzfxParams
  for (const key of PARAM_ORDER) {
    const raw = partial[key]
    result[key] = raw === undefined ? PARAM_SPECS[key].default : clampParam(key, raw)
  }
  return result
}

export const CATEGORIES = [
  'Pickup',
  'Laser',
  'Explosion',
  'Powerup',
  'Hit',
  'Jump',
  'Blip',
  'UI Click',
  'Footstep',
  'Door',
  'Alarm',
  'Heartbeat',
] as const
export type Category = (typeof CATEGORIES)[number]

export const STYLES = [
  'retro 8-bit',
  'chiptune',
  'clean',
  'punchy',
  'boomy',
  'thin',
  'high',
  'low',
  'snappy',
  'long tail',
  'cute',
  'menacing',
  'robotic',
  'metallic',
  'glitchy',
] as const
export type Style = (typeof STYLES)[number]

export const MAX_STYLES = 3
