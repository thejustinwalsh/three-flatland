import type { PlaySoundFn, ZzFXParams } from '../types'

/**
 * ZzFX-encoded SFX presets per game event.
 *
 * Each array is the raw ZzFX param sequence per the spec at
 * https://github.com/KilledByAPixel/ZzFX. Values were tuned by ear via
 * https://killedbyapixel.github.io/ZzFX/ and pasted here.
 */
export const SFX = {
  dig: [, , 220, 0.01, 0.02, 0.04, 1, 0.5, , , , , , 9, , , 0.04] as ZzFXParams,
  gemCollect: [, , 880, 0.01, 0.15, 0.25, , 1.5, , , 100, 0.03, , , , , 0.12] as ZzFXParams,
  sagWarning: [, , 60, 0.15, 0.8, 0.9, 4, 0.8, , , , , , 4, 0.15, 0.15, 0.2] as ZzFXParams,
  chunkImpact: [0.5, , 80, 0.01, 0.02, 0.3, 4, 1, , , , , , 9, , 0.3, 0.2] as ZzFXParams,
  brace: [, , 1200, 0.02, 0.15, 0.3, , 2, , , , , , , , 0.1] as ZzFXParams,
  trigger: [, , 220, 0.05, 0.1, 0.2, 4, 1.4, , , , , , 9, 0.1, 0.1, 0.1] as ZzFXParams,
  pet: [, , 440, 0.005, 0.03, 0.04, , 1, , , , , , , , , 0.03] as ZzFXParams,
  overPetGrunt: [, , 110, 0.01, 0.04, 0.08, 3, 1, , , , , , 9, , , 0.05] as ZzFXParams,
  crush: [0.5, , 50, 0.02, 0.05, 0.4, 4, 1.2, , , , , , 9, 0.2, 0.3, 0.15] as ZzFXParams,
  respawn: [, , 880, 0.02, 0.2, 0.25, , 1, , , , , , , , 0.15, 0.1] as ZzFXParams,
  worldFall: [, , 1200, 0.5, 1, 1.5, , 0.5, , -200, , , 0.3, , , , 0.3] as ZzFXParams,
} as const

export type SfxName = keyof typeof SFX

/**
 * Adapter that holds a ZzFX function reference and exposes a name-keyed API.
 * Re-created when the mini's `zzfx` prop changes.
 */
export interface SoundPlayer {
  play(name: SfxName): void
}

export function createSoundPlayer(zzfx: PlaySoundFn): SoundPlayer {
  return {
    play(name) {
      const params = SFX[name]
      try {
        zzfx(...params)
      } catch {
        // ZzFX rejection is non-fatal in attract mode; swallow.
      }
    },
  }
}
