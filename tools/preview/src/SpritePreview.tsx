import { Suspense } from 'react'
import { Canvas, extend, useLoader, useThree } from '@react-three/fiber/webgpu'
import type { OrthographicCamera as ThreeOrthographicCamera } from 'three'
import { Sprite2D, TextureLoader } from 'three-flatland/react'

extend({ Sprite2D })

export type SpritePreviewProps = {
  imageUri: string | null
  /** World-space view size in pixels. Defaults to 512. */
  viewSize?: number
  /**
   * Background color for the three.js canvas. Omit to keep the canvas
   * transparent so the surrounding theme-colored panel shows through.
   */
  background?: string
  /**
   * Fallback rendered INSIDE <Canvas> while the texture loads.
   *
   * The contents of <Canvas> run in the @react-three/fiber reconciler,
   * which is a separate React tree from the DOM reconciler. Any loaders
   * that suspend (useLoader, useTexture, etc.) suspend in *this* tree
   * and must be caught by a Suspense boundary that's also mounted
   * inside the Canvas.
   *
   * Must be an R3F-compatible element (three.js objects), not DOM.
   * Defaults to `null` so the canvas stays visually mounted (background,
   * camera, etc.) while the sprite is pending.
   */
  suspenseFallback?: React.ReactNode
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

/** Suspends on the texture load via three-flatland's TextureLoader. */
function Sprite({ imageUri }: { imageUri: string }) {
  const texture = useLoader(TextureLoader, imageUri)
  const img = texture.image as { width?: number; height?: number } | null | undefined
  const w = img?.width ?? 64
  const h = img?.height ?? 64
  return <sprite2D texture={texture} anchor={[0.5, 0.5]} scale={[w, h, 1]} />
}

export function SpritePreview({
  imageUri,
  viewSize,
  background,
  suspenseFallback = null,
}: SpritePreviewProps) {
  const defaultView = viewSize ?? 512
  return (
    <Canvas
      dpr={1}
      renderer={{ antialias: false }}
      style={{ background: background ?? 'transparent' }}
    >
      {background != null ? <color attach="background" args={[background]} /> : null}
      <OrthoCamera viewSize={defaultView} />
      {imageUri ? (
        // Inner Suspense — mounted INSIDE <Canvas>, so it belongs to the
        // R3F reconciler. Catches useLoader() on the texture. The outer
        // DOM Suspense in main.tsx cannot reach across reconciler trees.
        <Suspense fallback={suspenseFallback}>
          <Sprite imageUri={imageUri} />
        </Suspense>
      ) : null}
    </Canvas>
  )
}
