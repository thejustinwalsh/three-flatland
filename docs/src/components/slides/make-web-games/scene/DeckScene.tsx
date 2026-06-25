import { Suspense, useRef } from 'react'
import { extend, useFrame, useLoader } from '@react-three/fiber/webgpu'
import { Sprite2D, TextureLoader } from 'three-flatland/react'
import type { Group } from 'three'
import { SceneDirector } from '../../../deck/SceneDirector'
import { FlatlandLayer } from '../../../deck/FlatlandLayer'
import { usePosition } from '../../../deck/presentationStore'
import { KnightmarkSizzle } from './KnightmarkSizzle'
import { LightingSizzle } from './LightingSizzle'
import { beats } from '../beats'

extend({ Sprite2D })

const LOGO_URL = import.meta.env.BASE_URL + 'slides/make-web-games/flatland-logo.svg'

// Gem tints from the theme palette.
const TINTS = ['#c7910c', '#c62f52', '#00a884', '#11b7d4', '#a85ff1', '#38c7bd', '#d46ec0', '#e35535']

// Mix a gem hex toward the near-black background for the dim, distant star layer.
function dim(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16)
  const mix = (c: number, bc: number) => Math.round(c * k + bc * (1 - k))
  return `rgb(${mix((n >> 16) & 255, 0x11)}, ${mix((n >> 8) & 255, 0x14)}, ${mix(n & 255, 0x18)})`
}

// Distant parallax starfield — small dim FL logos far back; the camera dolly per
// slide makes them parallax against the foreground ring.
const STARS = Array.from({ length: 54 }, (_, i) => {
  const a = i * 2.39996323
  const r = 8 + (i % 11) * 2.2
  return {
    pos: [Math.cos(a * 1.7) * r, Math.sin(a * 1.3) * r * 0.8, -16 - (i % 8) * 1.8] as [number, number, number],
    scale: 0.22 + (i % 3) * 0.12,
    tint: dim(TINTS[i % TINTS.length]!, 0.5),
    spin: (i % 2 ? 1 : -1) * (0.08 + (i % 4) * 0.05),
  }
})

// Ring-field of FL-logo sprites (the cube layout, with sprites). The whole field
// rotates as a group (global orbital motion) while each logo also spins in place.
const LOGOS = Array.from({ length: 36 }, (_, i) => {
  const angle = (i / 36) * Math.PI * 2
  const radius = 5 + (i % 5) * 1.8
  return {
    pos: [Math.cos(angle) * radius, Math.sin(angle) * radius, -(i % 6) * 1.5] as [number, number, number],
    scale: 0.8 + (i % 4) * 0.3,
    tint: TINTS[i % TINTS.length],
    spin: (i % 2 ? 1 : -1) * (0.25 + (i % 5) * 0.15),
  }
})

function LogoField() {
  const texture = useLoader(TextureLoader, LOGO_URL)
  const group = useRef<Group>(null)
  const refs = useRef<(Sprite2D | null)[]>([])
  useFrame((_, dt) => {
    if (group.current) group.current.rotation.z += dt * 0.04 // global orbital motion
    for (let i = 0; i < refs.current.length; i++) {
      const s = refs.current[i]
      const l = LOGOS[i]
      if (s && l) s.rotation.z += dt * l.spin
    }
  })
  return (
    <group ref={group}>
      {LOGOS.map((l, i) => (
        <sprite2D
          key={i}
          ref={(el: Sprite2D | null) => {
            refs.current[i] = el
          }}
          texture={texture}
          tint={l.tint}
          anchor={[0.5, 0.5]}
          position={l.pos}
          scale={[l.scale, l.scale, 1]}
        />
      ))}
    </group>
  )
}

function StarLayer() {
  const texture = useLoader(TextureLoader, LOGO_URL)
  const group = useRef<Group>(null)
  const refs = useRef<(Sprite2D | null)[]>([])
  useFrame((_, dt) => {
    if (group.current) group.current.rotation.z += dt * 0.012 // slower → parallax differential
    for (let i = 0; i < refs.current.length; i++) {
      const s = refs.current[i]
      const l = STARS[i]
      if (s && l) s.rotation.z += dt * l.spin
    }
  })
  return (
    <group ref={group}>
      {STARS.map((l, i) => (
        <sprite2D
          key={i}
          ref={(el: Sprite2D | null) => {
            refs.current[i] = el
          }}
          texture={texture}
          tint={l.tint}
          anchor={[0.5, 0.5]}
          position={l.pos}
          scale={[l.scale, l.scale, 1]}
        />
      ))}
    </group>
  )
}

export function DeckScene() {
  const { slideIndex, fragment } = usePosition()
  return (
    <>
      <color attach="background" args={['#111418']} />
      <SceneDirector beats={beats} />
      <Suspense fallback={null}>
        <StarLayer />
        <LogoField />
        {/* Real flatland sizzles — always mounted (so the camera can transition to
            them); active-gated so only the in-view panel renders/animates/shows. */}
        {/* Slide 6 (index 5): automatic ECS sprite batching. */}
        <FlatlandLayer active={slideIndex === 5} position={[1.6, 0.4, 0]} size={3.6} clearAlpha={1} clearColor={0x1a1a2e} resolution={[1280, 720]} viewSize={700}>
          <KnightmarkSizzle />
        </FlatlandLayer>
        {/* Slide 7 (index 6): tilemap + real-time 2D lighting. */}
        <FlatlandLayer active={slideIndex === 6} position={[1.6, 0.4, 0]} size={3.6} clearAlpha={1} clearColor={0x111418} resolution={[1280, 720]} viewSize={400}>
          {/* lights off until the first fragment reveal (Tilemaps → lights on). */}
          <LightingSizzle lit={fragment >= 0} />
        </FlatlandLayer>
      </Suspense>
    </>
  )
}
