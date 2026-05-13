import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber/webgpu'
import { useWorld } from 'koota/react'
import type { Sprite2DMaterial, Sprite2D as Sprite2DType } from 'three-flatland/react'
import { Driller, GameState, PetEvents } from '../traits'
import {
  OVER_PET_THRESHOLD,
  OVER_PET_WINDOW_TICKS,
  PET_PAUSE_TICKS,
  TILE_PX,
} from '../constants'
import {
  REGIONS as ICON_REGIONS,
  SHEET_H as ICON_SHEET_H,
  SHEET_W as ICON_SHEET_W,
  type IconName,
} from '../generated/icons'

/**
 * Chibi mood bubble — appears over the driller while pet-paused.
 * Two sprites: a soft tinted "bubble" background + the mood icon
 * scaled up over it. Mood is picked from the pet-count-in-window so
 * the player gets escalating feedback:
 *
 *   1 pet  → pet.love     (heart)
 *   2 pets → pet.happy    (smile)
 *   3 pets → pet.warning  (caution — one more and it's over-pet)
 *
 * No status bar: the bubble pops in then fades over the pause window.
 * Over-pet is handled by OverPetRenderer (angry shake) — pause is
 * cleared instantly so this branch doesn't fire then.
 */

function frameOf(region: { x: number; y: number; w: number; h: number }) {
  return {
    name: '',
    x: region.x / ICON_SHEET_W,
    y: region.y / ICON_SHEET_H,
    width: region.w / ICON_SHEET_W,
    height: region.h / ICON_SHEET_H,
    sourceWidth: region.w,
    sourceHeight: region.h,
  }
}
const FRAMES: Record<IconName, ReturnType<typeof frameOf>> = {} as Record<
  IconName,
  ReturnType<typeof frameOf>
>
for (const k of Object.keys(ICON_REGIONS) as IconName[]) FRAMES[k] = frameOf(ICON_REGIONS[k])

const ICON_PX = 20
const BUBBLE_PX = 28

interface Props {
  iconsMaterial: Sprite2DMaterial
  /** Reused white-pixel material for the bubble background. */
  bubbleMaterial: Sprite2DMaterial
}

export function MoodBubbleRenderer({ iconsMaterial, bubbleMaterial }: Props) {
  const world = useWorld()
  const bubbleRef = useRef<Sprite2DType>(null)
  const iconRef = useRef<Sprite2DType>(null)

  useEffect(() => {
    if (bubbleRef.current) bubbleRef.current.scale.set(0, 0, 1)
    if (iconRef.current) iconRef.current.scale.set(0, 0, 1)
  }, [])

  useFrame(() => {
    const gs = world.get(GameState)
    const drillerEntity = world.queryFirst(Driller)
    const d = drillerEntity?.get(Driller)
    const bubble = bubbleRef.current
    const icon = iconRef.current
    if (!gs || !d || !bubble || !icon || gs.tick >= d.pausedUntilTick) {
      if (bubble) bubble.scale.set(0, 0, 1)
      if (icon) icon.scale.set(0, 0, 1)
      return
    }

    const pe = drillerEntity?.get(PetEvents)
    const inWindow = pe
      ? pe.recentTicks.filter((t) => gs.tick - t <= OVER_PET_WINDOW_TICKS).length
      : 0
    // Affection-first feedback per the user's spec: love until we hit
    // the warning threshold. The previous variant (1=love only) hid
    // the heart on the 2nd+ pet in a window — the user reported "heart
    // is gone again" because subsequent pets fell to a different icon.
    //
    //   count 1..(OVER_PET_THRESHOLD-1) → love
    //   count == OVER_PET_THRESHOLD     → warning ("one more = mad")
    //   count >= OVER_PET_THRESHOLD+1   → handled by OverPetRenderer
    let iconName: IconName
    if (inWindow >= OVER_PET_THRESHOLD) iconName = 'pet.warning'
    else iconName = 'pet.love'

    // Pop animation: bubble grows on entry then settles, fades at the
    // end of the pause window.
    const age = PET_PAUSE_TICKS - (d.pausedUntilTick - gs.tick)
    const t = age / PET_PAUSE_TICKS
    let scale: number
    let alpha: number
    if (t < 0.15) {
      const u = t / 0.15
      scale = 0.4 + 0.8 * u
      alpha = 1
    } else if (t < 0.8) {
      const u = (t - 0.15) / (0.8 - 0.15)
      scale = 1.2 - 0.2 * u
      alpha = 1
    } else {
      const u = (t - 0.8) / 0.2
      scale = 1.0 - 0.2 * u
      alpha = 1 - u
    }

    // Anchor above the driller's head.
    const ax = d.col * TILE_PX + TILE_PX / 2
    const ay = -((d.row - 1) * TILE_PX + TILE_PX / 2) - 2

    bubble.position.set(ax, ay, 0)
    bubble.scale.set(BUBBLE_PX * scale, BUBBLE_PX * scale, 1)
    bubble.alpha = 0.65 * alpha
    // Bubble tint shifts with mood (love=pink, happy=cream, warning=amber).
    const [br, bg, bb] =
      iconName === 'pet.warning'
        ? [0.99, 0.82, 0.31]
        : iconName === 'pet.love'
          ? [0.96, 0.65, 0.78]
          : [1, 0.93, 0.7]
    bubble.tint.r = br
    bubble.tint.g = bg
    bubble.tint.b = bb

    icon.setFrame(FRAMES[iconName])
    icon.position.set(ax, ay, 0)
    icon.scale.set(ICON_PX * scale, ICON_PX * scale, 1)
    icon.alpha = alpha
  })

  return (
    <>
      <sprite2D
        ref={bubbleRef}
        material={bubbleMaterial}
        tint="#ffffff"
        position={[0, 0, 0]}
        scale={[0, 0, 1]}
      />
      <sprite2D
        ref={iconRef}
        material={iconsMaterial}
        tint="#ffffff"
        position={[0, 0, 0]}
        scale={[0, 0, 1]}
        frame={FRAMES['pet.love']}
      />
    </>
  )
}
