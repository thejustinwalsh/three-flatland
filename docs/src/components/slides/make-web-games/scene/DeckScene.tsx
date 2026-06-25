import { Suspense, useRef } from 'react'
import { extend, useFrame, useLoader } from '@react-three/fiber/webgpu'
import { Sprite2D, TextureLoader } from 'three-flatland/react'
import type { Group } from 'three'
import { SceneDirector } from '../../../deck/SceneDirector'
import { beats } from '../beats'

extend({ Sprite2D })

const LOGO_URL = import.meta.env.BASE_URL + 'slides/make-web-games/flatland-logo.svg'

// Gem tints from the theme palette.
const TINTS = ['#c7910c', '#c62f52', '#00a884', '#11b7d4', '#a85ff1', '#38c7bd', '#d46ec0', '#e35535']

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

export function DeckScene() {
  return (
    <>
      <color attach="background" args={['#111418']} />
      <SceneDirector beats={beats} />
      <Suspense fallback={null}>
        <LogoField />
      </Suspense>
    </>
  )
}
