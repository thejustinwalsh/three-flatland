import { useRef } from 'react'
import { useFrame } from '@react-three/fiber/webgpu'
import type { Sprite2DMaterial, Sprite2D as Sprite2DType } from 'three-flatland/react'
import { TILE_PX } from '../constants'
import {
  DRILLER_ANIMATION_SPECS,
  DRILLER_FRAME_SIZE,
  GHOST_BODY_ANCHOR,
  drillerFrame,
  ghostRiseScale,
} from '../lib/driller-frames'
import { RENDER_LAYERS } from '../lib/render-layers'
import { ghostBeam } from '../systems/death'

interface Props {
  material: Sprite2DMaterial
}

const TRAIL_LENGTH = 4
const SINE_AMPLITUDE_PX = 6 // horizontal sway amplitude
const GHOST_SPEC = DRILLER_ANIMATION_SPECS.ghost

/**
 * Rising death-clear beam. Renders the authored ghost animation at
 * the beam's current cell, weaving in a sine wave as it ascends, with
 * a short fading trail of ghost afterimages below it. Reads the
 * `ghostBeam` snapshot the death system updates each tick.
 *
 * When the beam is inactive all sprites zero-scale to disappear.
 */
export function GhostBeam({ material }: Props) {
  const headRef = useRef<Sprite2DType>(null)
  const trailRefs = useRef<(Sprite2DType | null)[]>(
    Array.from({ length: TRAIL_LENGTH }, () => null)
  )
  const lastFrameRef = useRef(-1)

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
    const frameIndex = Math.floor(ghostBeam.elapsedTicks / 9) % GHOST_SPEC.frames
    const headGrowth = ghostRiseScale(ghostBeam.startRow, ghostBeam.row, ghostBeam.fullScaleRow)

    if (lastFrameRef.current !== frameIndex) {
      head.setFrame(
        drillerFrame(GHOST_SPEC.row, frameIndex, `ghost-head:${frameIndex}`, GHOST_BODY_ANCHOR)
      )
      for (let i = 0; i < TRAIL_LENGTH; i++) {
        const sprite = trailRefs.current[i]
        if (!sprite) continue
        const trailFrame = (frameIndex - i - 1 + GHOST_SPEC.frames * 2) % GHOST_SPEC.frames
        sprite.setFrame(
          drillerFrame(
            GHOST_SPEC.row,
            trailFrame,
            `ghost-trail:${i}:${trailFrame}`,
            GHOST_BODY_ANCHOR
          )
        )
      }
      lastFrameRef.current = frameIndex
    }

    // Head
    const headX = baseX + Math.sin(phase) * SINE_AMPLITUDE_PX
    head.position.set(headX, -baseY, 0)
    head.scale.set(DRILLER_FRAME_SIZE * headGrowth, DRILLER_FRAME_SIZE * headGrowth, 1)
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
      const afterimageScale = 1 - (i + 1) * 0.06
      const trailGrowth = ghostRiseScale(ghostBeam.startRow, trailRow, ghostBeam.fullScaleRow)
      sprite.scale.set(
        DRILLER_FRAME_SIZE * trailGrowth * afterimageScale,
        DRILLER_FRAME_SIZE * trailGrowth * afterimageScale,
        1
      )
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
        anchor={GHOST_BODY_ANCHOR}
        scale={[0, 0, 1]}
        position={[0, 0, 0]}
        sortLayer={RENDER_LAYERS.effects}
        lit={false}
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
          anchor={GHOST_BODY_ANCHOR}
          scale={[0, 0, 1]}
          position={[0, 0, 0]}
          sortLayer={RENDER_LAYERS.effects}
          lit={false}
        />
      ))}
    </>
  )
}
