import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber/webgpu'
import { useWorld } from 'koota/react'
import type { Sprite2DMaterial, Sprite2D as Sprite2DType } from 'three-flatland/react'
import { GameState, OverPetIndicator } from '../traits'
import { OVER_PET_SHAKE_TICKS, TILE_PX } from '../constants'
import { REGIONS as ICON_REGIONS, SHEET_H, SHEET_W } from '../generated/icons'

/**
 * Over-pet "angry-shake" indicator. When `doPet` detects the
 * over-pet threshold has been crossed, it spawns an
 * `OverPetIndicator` entity at the driller's cell. This renderer
 * draws an angry mood icon there for `OVER_PET_SHAKE_TICKS` ticks,
 * oscillating horizontally to communicate "cursor rejection". The
 * pet-pause was instantly cleared so the regular pet info-popup
 * doesn't fire — this is the dedicated over-pet visual.
 *
 * Single sprite (one indicator at a time is the realistic case).
 * Bigger pool isn't needed because over-pet is throttled by the
 * pet-window threshold.
 */

const ANGRY_FRAME = (() => {
  const r = ICON_REGIONS['pet.angry']
  return {
    name: '',
    x: r.x / SHEET_W,
    y: r.y / SHEET_H,
    width: r.w / SHEET_W,
    height: r.h / SHEET_H,
    sourceWidth: r.w,
    sourceHeight: r.h,
  }
})()

const POOL = 4
const ICON_PX = 20

interface Props {
  iconsMaterial: Sprite2DMaterial
}

export function OverPetRenderer({ iconsMaterial }: Props) {
  const world = useWorld()
  const refs = useRef<(Sprite2DType | null)[]>([])

  useEffect(() => {
    for (const s of refs.current) if (s) s.scale.set(0, 0, 1)
  }, [])

  useFrame(() => {
    const gs = world.get(GameState)
    let used = 0
    if (gs) {
      world.query(OverPetIndicator).forEach((entity) => {
        if (used >= POOL) return
        const p = entity.get(OverPetIndicator)!
        const age = gs.tick - p.startTick
        if (age < 0 || age >= OVER_PET_SHAKE_TICKS) return
        const t = age / OVER_PET_SHAKE_TICKS
        // Horizontal shake — 5 cycles across the window, amplitude
        // damps with time as the shake "settles" out before the
        // indicator vanishes.
        const phase = t * Math.PI * 2 * 5
        const damp = 1 - t
        const offsetX = Math.sin(phase) * 2 * damp
        const ax = p.col * TILE_PX + TILE_PX / 2 + offsetX
        // One cell above the driller cell, world Y = -row.
        const ay = -((p.row - 1) * TILE_PX + TILE_PX / 2)
        const sprite = refs.current[used++]
        if (!sprite) return
        sprite.setFrame(ANGRY_FRAME)
        sprite.position.set(ax, ay, 0)
        sprite.scale.set(ICON_PX, ICON_PX, 1)
        sprite.alpha = 1
      })
    }
    for (let i = used; i < POOL; i++) {
      const s = refs.current[i]
      if (s) s.scale.set(0, 0, 1)
    }
  })

  return (
    <>
      {Array.from({ length: POOL }).map((_, i) => (
        <sprite2D
          key={i}
          ref={(el) => {
            refs.current[i] = el
          }}
          material={iconsMaterial}
          tint="#ffffff"
          position={[0, 0, 0]}
          scale={[0, 0, 1]}
          frame={ANGRY_FRAME}
        />
      ))}
    </>
  )
}
