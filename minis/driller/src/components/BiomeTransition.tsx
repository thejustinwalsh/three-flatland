import { useEffect, useRef, useState } from 'react'
import { useWorld } from 'koota/react'
import { biomeAt, type BiomeName } from '../biomes'
import { Driller } from '../traits'

/**
 * Screen-fall transition flash. Whenever the driller crosses into a
 * new biome, wipe a tinted curtain down the play area for ~600ms
 * — a visual "you fell into the next layer" beat that breaks up the
 * endless dive into recognisable acts.
 *
 * Implemented as a CSS overlay (not a Sprite2D) so the animation
 * timing is decoupled from the WebGPU render loop and the curtain
 * sits cleanly on top of the canvas.
 */
export function BiomeTransition() {
  const world = useWorld()
  const lastBiomeRef = useRef<BiomeName | null>(null)
  const [transition, setTransition] = useState<{ biome: BiomeName; key: number } | null>(null)
  const keyRef = useRef(0)

  useEffect(() => {
    let raf = 0
    const tick = () => {
      const driller = world.queryFirst(Driller)
      if (driller) {
        const d = driller.get(Driller)!
        const biome = biomeAt(d.row)
        if (lastBiomeRef.current !== null && lastBiomeRef.current !== biome.name) {
          keyRef.current += 1
          setTransition({ biome: biome.name, key: keyRef.current })
        }
        lastBiomeRef.current = biome.name
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [world])

  useEffect(() => {
    if (!transition) return
    const t = setTimeout(() => setTransition(null), 700)
    return () => clearTimeout(t)
  }, [transition])

  if (!transition) return null
  const tint = TRANSITION_TINTS[transition.biome]
  return (
    <div
      key={transition.key}
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 6,
        background: `linear-gradient(180deg, ${tint} 0%, transparent 100%)`,
        animation: 'driller-biome-fall 700ms ease-out forwards',
      }}
    >
      <style>{`
        @keyframes driller-biome-fall {
          0%   { transform: translateY(-100%); opacity: 0.95; }
          50%  { transform: translateY(0%); opacity: 0.85; }
          100% { transform: translateY(100%); opacity: 0; }
        }
      `}</style>
    </div>
  )
}

const TRANSITION_TINTS: Record<BiomeName, string> = {
  topsoil: 'rgba(60, 50, 30, 0.92)',
  'deep-dirt': 'rgba(40, 22, 12, 0.92)',
  stoneworks: 'rgba(35, 40, 60, 0.92)',
  'crystal-caverns': 'rgba(50, 30, 95, 0.92)',
  core: 'rgba(85, 25, 15, 0.92)',
}
