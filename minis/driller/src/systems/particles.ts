import type { World } from 'koota'
import { Particle, type ParticleKind } from '../traits'

/**
 * Spawn helpers for the four particle kinds. Particles are despawned by
 * `tickParticles` once `ageMs >= lifeMs`. Visual rendering of particles
 * is gated by the atlas-measurement follow-up (sub-issue #60).
 */
export function spawnDust(world: World, px: number, py: number, count = 6): void {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2
    const speed = 0.4 + Math.random() * 0.6
    world.spawn(
      Particle({
        px,
        py,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 0.3,
        ageMs: 0,
        lifeMs: 600 + Math.random() * 400,
        kind: 'dust',
        color: '#a08060',
      }),
    )
  }
}

export function spawnSparks(world: World, px: number, py: number, count = 4): void {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2
    const speed = 1 + Math.random() * 1.5
    world.spawn(
      Particle({
        px,
        py,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        ageMs: 0,
        lifeMs: 200 + Math.random() * 200,
        kind: 'spark',
        color: '#fcd34d',
      }),
    )
  }
}

export function spawnHearts(world: World, px: number, py: number, count = 1): void {
  for (let i = 0; i < count; i++) {
    world.spawn(
      Particle({
        px,
        py,
        vx: (Math.random() - 0.5) * 0.6,
        vy: -0.8,
        ageMs: 0,
        lifeMs: 800,
        kind: 'heart',
        color: '#f43f5e',
      }),
    )
  }
}

/** Advance + cull all particles by elapsed milliseconds. */
export function particlesSystem(world: World, deltaMs: number): void {
  world.query(Particle).forEach((entity) => {
    const p = entity.get(Particle)
    if (!p) return
    p.ageMs += deltaMs
    p.px += p.vx
    p.py += p.vy + (p.kind === 'dust' ? 0.05 : 0) // dust gravity
    if (p.ageMs >= p.lifeMs) entity.destroy()
  })
}

export const _particleKinds: ParticleKind[] = ['dust', 'spark', 'heart']
