import { Canvas, extend, useThree } from '@react-three/fiber/webgpu'
import type { OrthographicCamera as ThreeOrthographicCamera } from 'three'
import { Sprite2D } from 'three-flatland/react'
import { useTextureFromUri } from './useTextureFromUri'

extend({ Sprite2D })

export type SpritePreviewProps = {
  imageUri: string | null
  /** World-space view size in pixels. Default: fits-the-image with margin. */
  viewSize?: number
  /**
   * Background color for the three.js canvas. When omitted the Canvas is
   * transparent so the surrounding panel's theme-colored background shows
   * through — preferred for VSCode webview use.
   */
  background?: string
}

function OrthoCamera({ viewSize }: { viewSize: number }) {
  const set = useThree((s) => s.set)
  const size = useThree((s) => s.size)
  const aspect = size.width / size.height

  return (
    <orthographicCamera
      ref={(cam: ThreeOrthographicCamera | null) => {
        if (!cam) return
        cam.left = (-viewSize * aspect) / 2
        cam.right = (viewSize * aspect) / 2
        cam.top = viewSize / 2
        cam.bottom = -viewSize / 2
        ;(cam as unknown as { manual: boolean }).manual = true
        cam.updateProjectionMatrix()
        set({ camera: cam })
      }}
      position={[0, 0, 100]}
      near={0.1}
      far={1000}
    />
  )
}

function Sprite({ imageUri }: { imageUri: string | null }) {
  const tex = useTextureFromUri(imageUri)
  if (!tex) return null
  const img = tex.image as { width?: number; height?: number } | null | undefined
  const w = img?.width ?? 64
  const h = img?.height ?? 64
  return <sprite2D texture={tex} anchor={[0.5, 0.5]} scale={[w, h, 1]} />
}

export function SpritePreview({ imageUri, viewSize, background }: SpritePreviewProps) {
  const defaultView = viewSize ?? 512
  return (
    <Canvas
      dpr={1}
      renderer={{ antialias: false }}
      gl={{ alpha: background == null }}
      style={{ background: 'transparent' }}
    >
      {background != null ? <color attach="background" args={[background]} /> : null}
      <OrthoCamera viewSize={defaultView} />
      <Sprite imageUri={imageUri} />
    </Canvas>
  )
}
