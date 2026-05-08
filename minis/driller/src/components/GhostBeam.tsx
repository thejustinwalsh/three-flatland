import { useRef } from 'react'
import { useFrame } from '@react-three/fiber/webgpu'
import type { Sprite2DMaterial, Sprite2D as Sprite2DType } from 'three-flatland/react'
import { TILE_PX } from '../constants'
import { ghostBeam } from '../systems/death'

interface Props {
  material: Sprite2DMaterial
}

const TRAIL_LENGTH = 6
const SINE_AMPLITUDE_PX = 6 // horizontal sway amplitude

/**
 * Rising death-clear beam. Renders an alpha-white square at the
 * beam's current cell, weaving in a sine wave as it ascends, with a
 * short fading trail (TRAIL_LENGTH afterimages) below it. Reads the
 * `ghostBeam` snapshot the death system updates each tick.
 *
 * When the beam is inactive all sprites zero-scale to disappear.
 */
export function GhostBeam({ material }: Props) {
  const headRef = useRef<Sprite2DType>(null)
  const trailRefs = useRef<(Sprite2DType | null)[]>([])
  if (trailRefs.current.length !== TRAIL_LENGTH) {
    trailRefs.current = new Array<Sprite2DType | null>(TRAIL_LENGTH).fill(null)
  }

  useFrame(() => {
    const head = headRef.current
    if (!head) return

    if (!ghostBeam.active) {
      head.scale.set(0, 0, 1)
      for (const t of trailRefs.current) if (t) t.scale.set(0, 0, 1)
      return
    }

    const baseX = ghostBeam.col * TILE_PX + TILE_PX / 2
    const baseY = ghostBeam.row * TILE_PX + TILE_PX / 2
    const phase = ghostBeam.elapsedTicks * 0.18

    // Head
    const headX = baseX + Math.sin(phase) * SINE_AMPLITUDE_PX
    head.position.set(headX, -baseY, 0)
    head.scale.set(TILE_PX * 1.4, TILE_PX * 1.4, 1)
    head.tint.r = 1
    head.tint.g = 1
    head.tint.b = 1
    head.alpha = 0.92

    // Trail — each step is N rows BELOW the head, fades out fast.
    for (let i = 0; i < TRAIL_LENGTH; i++) {
      const sprite = trailRefs.current[i]
      if (!sprite) continue
      const stepRows = (i + 1) * 0.6
      const trailRow = ghostBeam.row + stepRows
      const trailY = trailRow * TILE_PX + TILE_PX / 2
      const trailPhase = phase - (i + 1) * 0.5
      const trailX = baseX + Math.sin(trailPhase) * SINE_AMPLITUDE_PX
      sprite.position.set(trailX, -trailY, 0)
      const fade = 1 - i / TRAIL_LENGTH
      sprite.scale.set(TILE_PX * 1.4 * fade, TILE_PX * 1.4 * fade, 1)
      sprite.tint.r = 0.95
      sprite.tint.g = 0.97
      sprite.tint.b = 1
      sprite.alpha = 0.45 * fade
    }
  })

  const trailSlots: number[] = []
  for (let i = 0; i < TRAIL_LENGTH; i++) trailSlots.push(i)

  return (
    <>
      <sprite2D
        ref={headRef}
        material={material}
        tint="#ffffff"
        alpha={0}
        scale={[0, 0, 1]}
        position={[0, 0, 0]}
      />
      {trailSlots.map((i) => (
        <sprite2D
          key={`ghost-trail-${i}`}
          ref={(el) => {
            trailRefs.current[i] = el
          }}
          material={material}
          tint="#ffffff"
          alpha={0}
          scale={[0, 0, 1]}
          position={[0, 0, 0]}
        />
      ))}
    </>
  )
}
