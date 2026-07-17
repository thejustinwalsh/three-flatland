import { useRef } from 'react'
import { useFrame } from '@react-three/fiber/webgpu'
import { useQuery } from 'koota/react'
import type { Entity } from 'koota'
import {
  attachEffect,
  type Sprite2DMaterial,
  type Sprite2D as Sprite2DType,
} from 'three-flatland/react'
import { Animation, Driller, type DrillerAnimState } from '../traits'
import { TILE_PX } from '../constants'
import {
  DRILLER_ANIMATION_SPECS,
  DRILLER_FOOT_ANCHOR,
  DRILLER_FRAME_SIZE,
  drillerFootAnchorX,
  drillerAnimationFrameAt,
  drillerFrame,
  drillerShouldFlipX,
} from '../lib/driller-frames'
import { RENDER_LAYERS } from '../lib/render-layers'

interface DrillerViewProps {
  material: Sprite2DMaterial
}

interface ViewProps {
  entity: Entity
  material: Sprite2DMaterial
}

function DrillerSprite({ entity, material }: ViewProps) {
  const spriteRef = useRef<Sprite2DType>(null)
  const lastFrameRef = useRef('')
  const stateRef = useRef<DrillerAnimState | null>(null)
  const stateElapsedMsRef = useRef(0)

  useFrame((_, delta) => {
    if (!entity.has(Driller)) return
    const d = entity.get(Driller)!
    const sprite = spriteRef.current
    if (!sprite) return
    // Read the smoothly-interpolated pixel position written by the
    // driller system, NOT the snapped (col,row). World Y is
    // positive-down; Three is Y-up — flip sign.
    const animation = entity.get(Animation)
    const state = animation?.state ?? 'idle'
    if (stateRef.current !== state) {
      stateRef.current = state
      stateElapsedMsRef.current = 0
    } else {
      stateElapsedMsRef.current += delta * 1000
    }
    // d.py is the occupied cell centre. Register the shared foot anchor
    // on the cell's lower boundary so the silhouette sits on support tiles.
    sprite.position.set(d.px, -(d.py + TILE_PX / 2), 0)
    // Horizontal drill strips are already authored left/right. Other
    // left-facing states mirror both their UVs and their off-centre foot
    // anchor so the anatomical contact point remains on d.px.
    const flipX = drillerShouldFlipX(state, d.facing)
    sprite.flipX = flipX
    const anchorX = drillerFootAnchorX(flipX)
    if (sprite.anchor.x !== anchorX) {
      sprite.setAnchor(anchorX, DRILLER_FOOT_ANCHOR[1])
    }
    const spec = DRILLER_ANIMATION_SPECS[state]
    const frameIndex = drillerAnimationFrameAt(state, stateElapsedMsRef.current)
    const key = `${state}:${frameIndex}`
    if (lastFrameRef.current !== key) {
      sprite.setFrame(drillerFrame(spec.row, frameIndex, key))
      lastFrameRef.current = key
    }
  })

  const d = entity.get(Driller)!
  return (
    <sprite2D
      ref={spriteRef}
      material={material}
      tint="#ffffff"
      anchor={DRILLER_FOOT_ANCHOR}
      position={[d.px, -(d.py + TILE_PX / 2), 0]}
      scale={[DRILLER_FRAME_SIZE, DRILLER_FRAME_SIZE, 1]}
      sortLayer={RENDER_LAYERS.actors}
      shadowRadius={24}
    >
      <normalMapProvider attach={attachEffect} normalMap={null} />
    </sprite2D>
  )
}

export function DrillerView({ material }: DrillerViewProps) {
  const drillers = useQuery(Driller)
  return (
    <>
      {drillers.map((entity) => (
        <DrillerSprite key={entity} entity={entity} material={material} />
      ))}
    </>
  )
}
