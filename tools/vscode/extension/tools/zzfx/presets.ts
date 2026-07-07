// Curated fallback table — no vscode import, no network, deterministic.
// Used whenever the LM is unavailable, errors, or fails validation twice.
// One baseline per category, then style tags apply small deterministic
// nudges on top so the fallback still feels responsive to the user's
// selections even without AI in the loop.
import {
  CATEGORIES,
  PARAM_SPECS,
  STYLES,
  fromPartial,
  type Category,
  type ParamKey,
  type Style,
  type ZzfxParams,
} from '../../../webview/zzfx/params'

type Partial21 = Partial<Record<ParamKey, number>>

const CATEGORY_PRESETS: Readonly<Record<Category, Partial21>> = {
  Pickup: {
    frequency: 538,
    sustain: 0.05,
    release: 0.15,
    shape: 0,
    pitchJump: 200,
    pitchJumpTime: 0.05,
  },
  Laser: { frequency: 1200, sustain: 0.02, release: 0.1, shape: 2, slide: -6 },
  Explosion: {
    frequency: 80,
    sustain: 0.1,
    release: 0.4,
    shape: 4,
    noise: 0.3,
    bitCrush: 0.2,
    filter: -800,
  },
  Powerup: {
    frequency: 200,
    sustain: 0.15,
    release: 0.2,
    shape: 1,
    slide: 8,
    pitchJump: 400,
    pitchJumpTime: 0.1,
  },
  Hit: { frequency: 150, sustain: 0.02, release: 0.08, shape: 3, noise: 0.05 },
  Jump: { frequency: 300, sustain: 0.03, release: 0.08, shape: 0, slide: 4 },
  Blip: { frequency: 900, sustain: 0.02, release: 0.03, shape: 0 },
  'UI Click': { frequency: 1200, sustain: 0.005, release: 0.02, shape: 1, volume: 0.4 },
  Footstep: { frequency: 120, sustain: 0.02, release: 0.05, shape: 4, noise: 0.2, volume: 0.3 },
  Door: {
    frequency: 200,
    attack: 0.05,
    sustain: 0.1,
    release: 0.2,
    shape: 3,
    slide: -1,
    modulation: 5,
  },
  Alarm: { frequency: 700, sustain: 0.15, release: 0.1, shape: 1, repeatTime: 0.25, tremolo: 0.3 },
  Heartbeat: {
    frequency: 60,
    sustain: 0.08,
    release: 0.15,
    shape: 0,
    repeatTime: 0.4,
    volume: 0.6,
  },
}

/** Reads a param's current value in the working partial, falling back to
 * its spec default — modifiers reason about "current" values even for
 * params the base preset never set explicitly. */
function current(partial: Partial21, key: ParamKey): number {
  return partial[key] ?? PARAM_SPECS[key].default
}

function bump(partial: Partial21, key: ParamKey, delta: number): Partial21 {
  return { ...partial, [key]: current(partial, key) + delta }
}

function scale(partial: Partial21, key: ParamKey, factor: number): Partial21 {
  return { ...partial, [key]: current(partial, key) * factor }
}

function set(partial: Partial21, key: ParamKey, value: number): Partial21 {
  return { ...partial, [key]: value }
}

const STYLE_MODIFIERS: Readonly<Record<Style, (p: Partial21) => Partial21>> = {
  'retro 8-bit': (p) => bump(set(p, 'shape', 1), 'bitCrush', 0.3),
  chiptune: (p) => bump(bump(set(p, 'shape', 1), 'modulation', 10), 'bitCrush', 0.15),
  clean: (p) => set(set(set(p, 'randomness', 0), 'noise', 0), 'bitCrush', 0),
  punchy: (p) => scale(scale(set(p, 'attack', 0), 'sustain', 0.5), 'volume', 1.2),
  boomy: (p) => bump(scale(bump(p, 'sustain', 0.1), 'frequency', 0.6), 'filter', -300),
  thin: (p) => scale(scale(p, 'volume', 0.6), 'randomness', 0.5),
  high: (p) => scale(p, 'frequency', 1.6),
  low: (p) => scale(p, 'frequency', 0.5),
  snappy: (p) => scale(p, 'release', 0.4),
  'long tail': (p) => bump(bump(p, 'release', 0.3), 'decay', 0.2),
  cute: (p) => bump(scale(p, 'frequency', 1.3), 'pitchJump', 100),
  menacing: (p) => bump(bump(bump(p, 'pitchJump', -150), 'filter', -500), 'noise', 0.1),
  robotic: (p) => bump(bump(p, 'modulation', 20), 'bitCrush', 0.1),
  metallic: (p) => bump(bump(p, 'modulation', 15), 'shapeCurve', 0.5),
  glitchy: (p) => bump(bump(p, 'bitCrush', 0.25), 'randomness', 0.3),
}

/**
 * Deterministic fallback: category baseline + style-tag nudges, clamped.
 * Unknown/missing category falls back to `Blip` (the most neutral,
 * shortest preset) rather than throwing — the caller always gets a
 * playable sound.
 */
export function curatedPreset(category: string | undefined, styles: readonly string[]): ZzfxParams {
  const base: Partial21 = CATEGORY_PRESETS[category as Category] ?? CATEGORY_PRESETS.Blip
  let working: Partial21 = { ...base }
  for (const style of styles) {
    const modifier = STYLE_MODIFIERS[style as Style]
    if (modifier) working = modifier(working)
  }
  return fromPartial(working)
}

// Exported for tests asserting exhaustive coverage against the webview's
// CATEGORIES/STYLES lists — kept private otherwise.
export const _internal = { CATEGORY_PRESETS, STYLE_MODIFIERS, CATEGORIES, STYLES }
