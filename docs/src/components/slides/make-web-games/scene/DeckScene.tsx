import { extend } from '@react-three/fiber/webgpu'
import { Flatland } from 'three-flatland/react'
import { SceneDirector } from '../../../deck/SceneDirector'
import { beats } from '../beats'

// Register library classes used as JSX before first use.
extend({ Flatland })

export function DeckScene() {
  return (
    <>
      <SceneDirector beats={beats} />
      <ambientLight intensity={0.6} />
      {/* Flatland 2D root — placeholder content for Phase 1. */}
      <flatland>
        {/* Placeholder hero: a gem-tinted quad standing in for the eventual sprite. */}
        <mesh>
          <planeGeometry args={[2, 2]} />
          <meshBasicMaterial color="#7aa2ff" />
        </mesh>
      </flatland>
    </>
  )
}
