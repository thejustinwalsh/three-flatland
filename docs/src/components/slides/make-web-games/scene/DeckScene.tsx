import { useRef } from 'react'
import { extend, useFrame } from '@react-three/fiber/webgpu'
import { MeshBasicNodeMaterial } from 'three/webgpu'
import type { Group } from 'three'
import { SceneDirector } from '../../../deck/SceneDirector'
import { beats } from '../beats'

// WebGPU/TSL node material registered for JSX use (repo is node-materials-only).
extend({ MeshBasicNodeMaterial })

// Gem palette (matches the theme tokens) for the scaffold field.
const GEMS = ['#c7910c', '#c62f52', '#00a884', '#11b7d4', '#a85ff1', '#38c7bd', '#d46ec0', '#e35535']

// A slowly drifting ring-field of gem cubes at varied depth. It is scaffold —
// it exists to prove the WebGPU pipeline and the slide→camera sync are live; the
// real per-feature flatland demos (sprites, tilemap, lighting, GI) replace it later.
function GemField() {
  const group = useRef<Group>(null)
  useFrame((_, dt) => {
    if (group.current) group.current.rotation.z += dt * 0.04
  })
  return (
    <group ref={group}>
      {Array.from({ length: 36 }).map((_, i) => {
        const angle = (i / 36) * Math.PI * 2
        const radius = 5 + (i % 5) * 1.8
        const z = -(i % 6) * 1.5
        const size = 0.8 + (i % 3) * 0.5
        return (
          <mesh key={i} position={[Math.cos(angle) * radius, Math.sin(angle) * radius, z]} rotation={[angle, angle * 0.5, 0]}>
            <boxGeometry args={[size, size, size]} />
            <meshBasicNodeMaterial color={GEMS[i % GEMS.length]} />
          </mesh>
        )
      })}
    </group>
  )
}

export function DeckScene() {
  return (
    <>
      {/* Clear to the near-black surface so the scene seams into the page bg. */}
      <color attach="background" args={['#111418']} />
      <SceneDirector beats={beats} />
      <ambientLight intensity={0.8} />
      <GemField />
    </>
  )
}
