import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber/webgpu'
import { Vector3 } from 'three'
import 'animejs/adapters/three'
import { animate } from 'animejs'
import { usePosition } from './presentationStore'
import { resolveBeat, type SceneBeat } from './beats'

export function SceneDirector({ beats }: { beats: readonly SceneBeat[] }) {
  const { slideIndex } = usePosition()
  const camera = useThree((s) => s.camera)
  const lookAt = useRef(new Vector3(0, 0, 0))

  // On slide change, tween the camera position with the anime.js three adapter.
  useEffect(() => {
    const beat = resolveBeat(beats, slideIndex)
    const [x, y, z] = beat.camera.position
    const [lx, ly, lz] = beat.camera.lookAt
    lookAt.current.set(lx, ly, lz)
    const anim = animate(camera, { x, y, z, duration: 700, ease: 'inOutQuad' })
    return () => {
      anim.pause()
    }
  }, [beats, slideIndex, camera])

  // R3F render loop keeps the camera oriented at the (fixed, Phase 1) look target.
  useFrame(() => {
    camera.lookAt(lookAt.current)
  })

  return null
}
