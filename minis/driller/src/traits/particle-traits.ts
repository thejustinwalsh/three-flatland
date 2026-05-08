import { trait } from 'koota'

export type ParticleKind = 'dust' | 'spark' | 'heart'

/**
 * A short-lived visual effect entity. Updated each tick by the particle
 * system; despawned when `ageMs >= lifeMs`.
 */
export const Particle = trait({
  px: 0,
  py: 0,
  vx: 0,
  vy: 0,
  ageMs: 0,
  lifeMs: 600,
  kind: 'dust' as ParticleKind,
  /** Hex color (with leading #) used as sprite tint. */
  color: '#ffffff',
})
