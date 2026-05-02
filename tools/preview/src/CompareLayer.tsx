import { Suspense, useEffect, useMemo, useState } from 'react'
import { Canvas, useLoader, useThree } from '@react-three/fiber/webgpu'
import {
  LinearFilter,
  NearestFilter,
  TextureLoader,
  type OrthographicCamera as ThreeOrthographicCamera,
  type Texture,
} from 'three'
import { MeshBasicNodeMaterial } from 'three/webgpu'
import { texture, uv, select, uniform } from 'three/tsl'
import { type ImageSource } from './ThreeLayer'

export type { ImageSource }

export type CompareLayerProps = {
  /** Primary image (left of slider). */
  imageSource: ImageSource | null
  /** Compare image (right of slider). */
  compareImageSource: ImageSource | null
  /** Slider position 0..1. 0 = all primary, 1 = all compare. */
  splitU: number
  /** Background color behind both images. Defaults to transparent. */
  background?: string
  /** Padding around the image inside the viewport (1 = exact fit). */
  fitMargin?: number
  /** Current zoom level. Same semantics as ThreeLayer. */
  zoom?: number
  panX?: number
  panY?: number
  /** Suspense fallback while textures load. */
  suspenseFallback?: React.ReactNode
  /** Pixel-art filter (NEAREST). */
  pixelArt?: boolean
  /**
   * KTX2 mip-level inspection. When the compare texture has a mip chain,
   * sampling level B at this LOD lets the user inspect each downsampled
   * resolution. Default 0 (full resolution).
   *
   * NOT YET WIRED in T5 — the prop is defined so consumers can start
   * passing it, but the shader still samples at the default LOD. T11
   * adds the textureLod() path. We accept the prop now so T11 doesn't
   * have to break the public surface.
   */
  mipLevelB?: number
  /**
   * Fires once the primary texture's image dimensions are known (used by
   * CanvasStage to expose the viewport). Mirrors ThreeLayer.onImageReady.
   */
  onImageReady?: (size: { w: number; h: number }) => void
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Inner component for URL-loaded textures (uses useLoader, can suspend). */
function UrlLoaded({
  url,
  onTexture,
}: {
  url: string
  onTexture: (t: Texture) => void
}) {
  const tex = useLoader(TextureLoader, url) as Texture
  useEffect(() => {
    onTexture(tex)
  }, [tex, onTexture])
  return null
}

/**
 * OrthoFitCamera — copied from ThreeLayer.tsx (intentionally duplicated to
 * avoid expanding ThreeLayer's public API for an internal helper).
 */
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
  // the tighter axis). Dividing viewSize by zoom narrows the frustum = zoom in.
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

type CompressedTextureWithMips = Texture & {
  mipmaps?: Array<{ width: number; height: number }>
}

function resolveDims(
  source: ImageSource,
  tex: Texture | null,
): { w: number; h: number } | null {
  if (source.kind === 'texture' && source.width && source.height) {
    return { w: source.width, h: source.height }
  }
  const img = tex?.image as { width?: number; height?: number } | null | undefined
  if (img?.width && img.height) {
    return { w: img.width, h: img.height }
  }
  const c = tex as CompressedTextureWithMips | null
  if (c?.mipmaps?.[0]) {
    return { w: c.mipmaps[0].width, h: c.mipmaps[0].height }
  }
  return null
}

function CompareScene({
  primary,
  compare,
  splitU,
  pixelArt,
  fitMargin,
  zoom,
  panX,
  panY,
  onPrimaryReady,
}: {
  primary: ImageSource
  compare: ImageSource | null
  splitU: number
  pixelArt: boolean
  fitMargin: number
  zoom: number
  panX: number
  panY: number
  onPrimaryReady?: (size: { w: number; h: number }) => void
}) {
  const [primaryTex, setPrimaryTex] = useState<Texture | null>(
    primary.kind === 'texture' ? primary.texture : null,
  )
  const [compareTex, setCompareTex] = useState<Texture | null>(
    compare?.kind === 'texture' ? compare.texture : null,
  )

  useEffect(() => {
    if (primary.kind === 'texture') setPrimaryTex(primary.texture)
  }, [primary])

  useEffect(() => {
    if (compare?.kind === 'texture') {
      setCompareTex(compare.texture)
    } else if (!compare) {
      setCompareTex(null)
    }
    // url kind arrives via UrlLoaded callback
  }, [compare])

  // Configure filtering on both textures.
  useEffect(() => {
    const filter = pixelArt ? NearestFilter : LinearFilter
    if (primaryTex) {
      primaryTex.minFilter = filter
      primaryTex.magFilter = filter
      primaryTex.needsUpdate = true
    }
    if (compareTex) {
      compareTex.minFilter = filter
      compareTex.magFilter = filter
      compareTex.needsUpdate = true
    }
  }, [primaryTex, compareTex, pixelArt])

  // Notify CanvasStage of primary image dimensions.
  useEffect(() => {
    if (!onPrimaryReady) return
    const dims = resolveDims(primary, primaryTex)
    if (dims) onPrimaryReady(dims)
  }, [primary, primaryTex, onPrimaryReady])

  // Build the TSL material once; rebuild when textures change.
  const material = useMemo(() => {
    const mat = new MeshBasicNodeMaterial()
    mat.toneMapped = false
    mat.transparent = true
    return mat
  }, [])

  // splitU lives as a TSL uniform so we can mutate .value without rebuilding
  // the node graph on every slider tick.
  const splitUNode = useMemo(() => uniform(0.5), [])
  useEffect(() => {
    splitUNode.value = splitU
  }, [splitU, splitUNode])

  // Rebuild colorNode whenever a texture changes.
  useEffect(() => {
    if (!primaryTex) return
    const a = texture(primaryTex)
    // Fall back to primary when no compare texture is ready yet.
    const b = compareTex ? texture(compareTex) : a
    material.colorNode = select(uv().x.lessThan(splitUNode), a, b)
    material.needsUpdate = true
  }, [primaryTex, compareTex, splitUNode, material])

  const dims = primaryTex ? resolveDims(primary, primaryTex) : null

  if (!primaryTex || !dims) {
    // Render UrlLoaded helpers even before we have dims so loading can proceed.
    return (
      <>
        {primary.kind === 'url' && (
          <UrlLoaded url={primary.url} onTexture={setPrimaryTex} />
        )}
        {compare?.kind === 'url' && (
          <UrlLoaded url={compare.url} onTexture={setCompareTex} />
        )}
      </>
    )
  }

  return (
    <>
      {primary.kind === 'url' && (
        <UrlLoaded url={primary.url} onTexture={setPrimaryTex} />
      )}
      {compare?.kind === 'url' && (
        <UrlLoaded url={compare.url} onTexture={setCompareTex} />
      )}
      <OrthoFitCamera
        imgW={dims.w}
        imgH={dims.h}
        margin={fitMargin}
        zoom={zoom}
        panX={panX}
        panY={panY}
      />
      {/* Sized plane at the image's aspect ratio. OrthoFitCamera handles fit. */}
      <mesh>
        <planeGeometry args={[dims.w, dims.h]} />
        <primitive object={material} attach="material" />
      </mesh>
    </>
  )
}

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------

/**
 * Two-texture compare canvas using a TSL split shader.
 *
 * Mirrors ThreeLayer's pan/zoom, Suspense, and imageSource semantics, but
 * renders two textures — `imageSource` (primary/left) and `compareImageSource`
 * (secondary/right) — separated by a vertical split at `splitU` (0..1).
 *
 * The split is implemented as a TSL `select(uv().x.lessThan(splitU), a, b)`
 * node expression, where `splitU` is a uniform mutated in-place so slider
 * ticks don't rebuild the shader graph.
 *
 * `mipLevelB` is accepted but not yet wired (T11 adds textureLod()).
 */
export function CompareLayer({
  imageSource,
  compareImageSource,
  background,
  fitMargin = 1.15,
  zoom = 1,
  panX = 0,
  panY = 0,
  splitU,
  pixelArt = false,
  suspenseFallback = null,
  onImageReady,
  // mipLevelB unused in T5; T11 wires it
  mipLevelB: _mipLevelB,
}: CompareLayerProps) {
  if (!imageSource) {
    return <div style={{ position: 'absolute', inset: 0 }} />
  }
  return (
    <Canvas
      orthographic
      gl={{ antialias: false, alpha: true, preserveDrawingBuffer: false }}
      flat
      style={{
        position: 'absolute',
        inset: 0,
        background: background ?? 'transparent',
      }}
    >
      {background != null ? <color attach="background" args={[background]} /> : null}
      <Suspense fallback={suspenseFallback}>
        <CompareScene
          primary={imageSource}
          compare={compareImageSource}
          splitU={splitU}
          pixelArt={pixelArt}
          fitMargin={fitMargin}
          zoom={zoom}
          panX={panX}
          panY={panY}
          onPrimaryReady={onImageReady}
        />
      </Suspense>
    </Canvas>
  )
}
