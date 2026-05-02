import { Suspense, useEffect } from 'react'
import { Canvas, extend, useLoader, useThree } from '@react-three/fiber/webgpu'
import { LinearFilter, NearestFilter, type OrthographicCamera as ThreeOrthographicCamera, type Texture } from 'three'
import { Sprite2D, TextureLoader } from 'three-flatland/react'

extend({ Sprite2D })

/**
 * Discriminated union describing where ThreeLayer should source its texture from.
 *
 * - `'url'`: load via TextureLoader (browser-decoded, cached by URL). This is the
 *   legacy behavior when `imageUri` is passed.
 * - `'texture'`: a pre-built `THREE.Texture` (e.g. a `CompressedTexture` from
 *   KTX2Loader). The optional `width`/`height` fields let the caller supply
 *   dimensions for textures whose `.image` may be null at mount time (compressed
 *   textures, programmatic textures). If omitted, ThreeLayer reads
 *   `texture.image.width/height` then falls back to `texture.mipmaps?.[0]`.
 */
export type ImageSource =
  | { kind: 'url'; url: string }
  | { kind: 'texture'; texture: Texture; width?: number; height?: number }

export type ThreeLayerProps = {
  /**
   * NEW: preferred input. If provided, takes precedence over imageUri.
   * Use `{ kind: 'url', url }` for a plain URL or `{ kind: 'texture', texture }`
   * for a pre-built THREE.Texture (e.g. CompressedTexture from KTX2Loader).
   */
  imageSource?: ImageSource | null
  /** EXISTING (deprecated but kept): legacy URL-only input. */
  imageUri?: string | null
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

/** Resolve the effective ImageSource from props, preferring imageSource over imageUri. */
function resolveSource(props: ThreeLayerProps): ImageSource | null {
  if (props.imageSource) return props.imageSource
  if (props.imageUri) return { kind: 'url', url: props.imageUri }
  return null
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
 * Once the texture resolves we know the real image size; the camera updates
 * to fit. Splitting this out so the Suspense boundary holds the camera +
 * sprite atomically (both appear together when the load finishes).
 *
 * This variant loads via TextureLoader from a URL (existing behaviour).
 * React Hooks rules require this be a separate component from DirectSpriteWithCamera
 * so `useLoader` is never called conditionally.
 */
function UrlSpriteWithCamera({
  url,
  onReady,
  fitMargin,
  zoom = 1,
  panX = 0,
  panY = 0,
  pixelArt = false,
}: {
  url: string
  onReady?: (size: { w: number; h: number }) => void
  fitMargin: number
  zoom?: number
  panX?: number
  panY?: number
  pixelArt?: boolean
}) {
  const texture = useLoader(TextureLoader, url) as Texture
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

/**
 * Renders a pre-built THREE.Texture directly (no URL loading).
 *
 * `onImageReady` fires synchronously after first render when `width`/`height`
 * are provided on the source descriptor. Otherwise, dimensions are read from
 * `texture.image.width/height` (falling back to `texture.mipmaps?.[0]`). If
 * dimensions are still unknown, `onImageReady` is not fired — CanvasStage
 * tolerates a null viewport until dimensions are known.
 */
function DirectSpriteWithCamera({
  source,
  onReady,
  fitMargin,
  zoom = 1,
  panX = 0,
  panY = 0,
  pixelArt = false,
}: {
  source: Extract<ImageSource, { kind: 'texture' }>
  onReady?: (size: { w: number; h: number }) => void
  fitMargin: number
  zoom?: number
  panX?: number
  panY?: number
  pixelArt?: boolean
}) {
  const { texture } = source
  // Resolve dimensions: caller-supplied wins, then texture.image, then mipmaps.
  const img = texture.image as { width?: number; height?: number } | null | undefined
  const mip0 = (texture as { mipmaps?: Array<{ width?: number; height?: number }> }).mipmaps?.[0]
  const w = source.width ?? img?.width ?? mip0?.width ?? 64
  const h = source.height ?? img?.height ?? mip0?.height ?? 64
  const hasDims = w !== 64 || h !== 64 || source.width != null || source.height != null

  useEffect(() => {
    if (hasDims) {
      onReady?.({ w, h })
    }
  }, [w, h, hasDims, onReady])

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

/**
 * three.js canvas rendering the sprite (and future lighting, normal maps,
 * animation playback). Absolutely positioned — meant to live inside a
 * <CanvasStage> or equivalent that also renders overlays.
 *
 * Accepts either:
 * - `imageSource` (preferred): an `ImageSource` discriminated union (`'url'` or
 *   `'texture'`). The `'texture'` variant accepts pre-built `THREE.Texture`s such
 *   as `CompressedTexture` produced by KTX2Loader, bypassing the URL system.
 * - `imageUri` (legacy): a plain URL string. Equivalent to passing
 *   `imageSource={{ kind: 'url', url: imageUri }}`.
 *
 * When both are provided, `imageSource` takes precedence.
 */
export function ThreeLayer({
  imageSource: imageSourceProp,
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
  const source = resolveSource({ imageSource: imageSourceProp, imageUri })
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
      {source?.kind === 'url' ? (
        <Suspense fallback={suspenseFallback}>
          <UrlSpriteWithCamera
            url={source.url}
            onReady={onImageReady}
            fitMargin={fitMargin}
            zoom={zoom}
            panX={panX}
            panY={panY}
            pixelArt={pixelArt}
          />
        </Suspense>
      ) : source?.kind === 'texture' ? (
        <DirectSpriteWithCamera
          source={source}
          onReady={onImageReady}
          fitMargin={fitMargin}
          zoom={zoom}
          panX={panX}
          panY={panY}
          pixelArt={pixelArt}
        />
      ) : null}
    </Canvas>
  )
}

// Internal helper kept for any direct Sprite consumers.
export { Sprite as _Sprite }
