import { Suspense, useEffect } from 'react'
import { Canvas, extend, useLoader, useThree } from '@react-three/fiber/webgpu'
import { LinearFilter, NearestFilter, type OrthographicCamera as ThreeOrthographicCamera, type Texture } from 'three'
import { Sprite2D, TextureLoader } from 'three-flatland/react'

extend({ Sprite2D })

export type ThreeLayerProps = {
  imageUri: string | null
  /** Canvas clear color. Defaults to transparent so the parent theme shows. */
  background?: string
  /** Fires once the texture resolves so the stage can expose the viewport. */
  onImageReady?: (size: { w: number; h: number }) => void
  /** Padding around the image inside the viewport (1 = exact fit). */
  fitMargin?: number
  /**
   * Current zoom level (1 = fit-to-canvas). Applied to the ortho frustum
   * so the camera zooms into the image without moving the sprite geometry.
   */
  zoom?: number
  /**
   * Pan offset in image-pixel units. Positive X shifts the view right
   * (camera moves right). Positive Y shifts the view down (camera moves
   * down — note Three.js Y is up so we negate internally).
   */
  panX?: number
  panY?: number
  /** Optional fallback while the texture suspends. R3F-compatible. */
  suspenseFallback?: React.ReactNode
  /**
   * Pixel-art filtering. Switches the atlas texture's min/mag filter to
   * nearest-neighbour so source pixels stay crisp at any zoom level.
   * Shared with the PIP preview through the cached texture instance —
   * setting on either keeps both in sync.
   */
  pixelArt?: boolean
}

function OrthoFitCamera({
  imgW,
  imgH,
  margin = 1.15,
  zoom = 1,
  panX = 0,
  panY = 0,
}: {
  imgW: number
  imgH: number
  margin?: number
  zoom?: number
  panX?: number
  panY?: number
}) {
  const set = useThree((s) => s.set)
  const size = useThree((s) => s.size)
  const aspect = size.width / size.height
  // Fit both image dimensions inside the ortho frustum (letterboxed on
  // the tighter axis). Matches SVG preserveAspectRatio="xMidYMid meet".
  // Dividing viewSize by zoom narrows the frustum = zoom in.
  const viewSize = (Math.max(imgH, imgW / aspect) * margin) / zoom

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
      // Three.js Y is up, image Y is down — negate panY.
      position={[panX, -panY, 100]}
      near={0.1}
      far={1000}
    />
  )
}

function Sprite({
  imageUri,
  onReady,
}: {
  imageUri: string
  onReady?: (size: { w: number; h: number }) => void
}) {
  const texture = useLoader(TextureLoader, imageUri)
  const img = texture.image as { width?: number; height?: number } | null | undefined
  const w = img?.width ?? 64
  const h = img?.height ?? 64
  useEffect(() => {
    onReady?.({ w, h })
  }, [w, h, onReady])
  return <sprite2D texture={texture} anchor={[0.5, 0.5]} scale={[w, h, 1]} />
}

/**
 * three.js canvas rendering the sprite (and future lighting, normal maps,
 * animation playback). Absolutely positioned — meant to live inside a
 * <CanvasStage> or equivalent that also renders overlays.
 */
export function ThreeLayer({
  imageUri,
  background,
  onImageReady,
  fitMargin = 1.15,
  zoom = 1,
  panX = 0,
  panY = 0,
  suspenseFallback = null,
  pixelArt = false,
}: ThreeLayerProps) {
  return (
    <Canvas
      dpr={1}
      renderer={{ antialias: false }}
      style={{
        position: 'absolute',
        inset: 0,
        background: background ?? 'transparent',
      }}
    >
      {background != null ? <color attach="background" args={[background]} /> : null}
      {imageUri ? (
        <Suspense fallback={suspenseFallback}>
          <OrthoFitCamera
            imgW={imageUri ? 512 : 512}
            imgH={imageUri ? 512 : 512}
            margin={fitMargin}
            zoom={zoom}
            panX={panX}
            panY={panY}
          />
          <SpriteWithCamera
            imageUri={imageUri}
            onReady={onImageReady}
            fitMargin={fitMargin}
            zoom={zoom}
            panX={panX}
            panY={panY}
            pixelArt={pixelArt}
          />
        </Suspense>
      ) : null}
    </Canvas>
  )
}

/**
 * Once the texture resolves we know the real image size; the camera updates
 * to fit. Splitting this out so the Suspense boundary holds the camera +
 * sprite atomically (both appear together when the load finishes).
 */
function SpriteWithCamera({
  imageUri,
  onReady,
  fitMargin,
  zoom = 1,
  panX = 0,
  panY = 0,
  pixelArt = false,
}: {
  imageUri: string
  onReady?: (size: { w: number; h: number }) => void
  fitMargin: number
  zoom?: number
  panX?: number
  panY?: number
  pixelArt?: boolean
}) {
  const texture = useLoader(TextureLoader, imageUri) as Texture
  const img = texture.image as { width?: number; height?: number } | null | undefined
  const w = img?.width ?? 64
  const h = img?.height ?? 64
  useEffect(() => {
    onReady?.({ w, h })
  }, [w, h, onReady])
  // Apply nearest / linear filter to the cached texture instance. The
  // PIP preview shares this same instance via useLoader's URL cache,
  // so changing it here propagates to both render contexts.
  useEffect(() => {
    const f = pixelArt ? NearestFilter : LinearFilter
    if (texture.magFilter !== f || texture.minFilter !== f) {
      texture.magFilter = f
      texture.minFilter = f
      texture.needsUpdate = true
    }
  }, [texture, pixelArt])
  return (
    <>
      <OrthoFitCamera imgW={w} imgH={h} margin={fitMargin} zoom={zoom} panX={panX} panY={panY} />
      <sprite2D texture={texture} anchor={[0.5, 0.5]} scale={[w, h, 1]} pixelPerfect={pixelArt} />
    </>
  )
}

// Internal helper kept for any direct Sprite consumers.
export { Sprite as _Sprite }
