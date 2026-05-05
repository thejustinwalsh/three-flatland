import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber/webgpu'
import {
  LinearFilter,
  LinearMipmapLinearFilter,
  NearestFilter,
  NearestMipmapNearestFilter,
  TextureLoader,
  type CompressedTexture,
  type OrthographicCamera as ThreeOrthographicCamera,
  type Texture,
} from 'three'
import { MeshBasicNodeMaterial } from 'three/webgpu'
import { texture, textureLevel, uv, screenUV, select, uniform, mix, vec2, vec3, vec4, float, dot } from 'three/tsl'
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
   * the shader samples the compare side at this LOD via `textureLevel()`,
   * letting the user inspect each downsampled resolution. Default 0
   * (full resolution). Ignored for non-mipmapped textures.
   */
  mipLevelB?: number
  /**
   * Fires once the primary texture's image dimensions are known (used by
   * CanvasStage to expose the viewport). Mirrors ThreeLayer.onImageReady.
   */
  onImageReady?: (size: { w: number; h: number }) => void
  /**
   * When true, the shader shows the primary texture on both sides and
   * applies a desaturation + dim to the compare (right) side, signalling
   * that a new encoded result is in-flight.
   */
  compareLoading?: boolean
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
  mipLevelB,
  pixelArt,
  fitMargin,
  zoom,
  panX,
  panY,
  compareLoading,
  onPrimaryReady,
}: {
  primary: ImageSource
  compare: ImageSource | null
  splitU: number
  mipLevelB: number
  pixelArt: boolean
  fitMargin: number
  zoom: number
  panX: number
  panY: number
  compareLoading: boolean
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

  // Configure filtering on both textures. Both sides MUST use the same
  // sampler, otherwise the compare looks misleading (left smooth / right
  // crunchy made the encoded side seem worse than it is). pixelArt mode
  // forces nearest on both; otherwise both go linear, with mipmap-linear
  // for compare textures that ship a mip chain (so the mip stepper smoothly
  // interpolates through levels rather than popping between nearest mips).
  useEffect(() => {
    const filter = pixelArt ? NearestFilter : LinearFilter
    const minFilterWithMips = pixelArt
      ? NearestMipmapNearestFilter
      : LinearMipmapLinearFilter
    if (primaryTex) {
      primaryTex.minFilter = filter
      primaryTex.magFilter = filter
      primaryTex.needsUpdate = true
    }
    if (compareTex) {
      const compressed = compareTex as CompressedTexture
      const hasMipmaps = compressed.mipmaps && compressed.mipmaps.length > 1
      compareTex.minFilter = hasMipmaps ? minFilterWithMips : filter
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

  // splitU/mipLevelB/compareLoading live as TSL uniforms whose .value is
  // pushed every R3F frame from refs. Why refs (not useEffect-driven writes
  // off React state):
  //
  //   React commits the new prop → useEffect fires → sets .value.
  //   But R3F's frame loop is independent — the uniform write may happen
  //   AFTER the next frame's render started reading it, leaving the slider
  //   visibly lagging behind the HTML drag handle by ≥1 frame.
  //
  // useFrame runs synchronously inside R3F's render loop, just before the
  // GPU dispatch. Reading the latest ref values there guarantees the
  // shader and the HTML overlay see the same splitU on every frame.
  const splitUNode = useMemo(() => uniform(0.5), [])
  const mipLevelBNode = useMemo(() => uniform(0), [])
  const loadingNode = useMemo(() => uniform(0), [])

  const splitURef = useRef(splitU)
  const mipLevelBRef = useRef(mipLevelB)
  const compareLoadingRef = useRef(compareLoading)
  splitURef.current = splitU
  mipLevelBRef.current = mipLevelB
  compareLoadingRef.current = compareLoading

  useFrame(() => {
    splitUNode.value = splitURef.current
    mipLevelBNode.value = mipLevelBRef.current
    loadingNode.value = compareLoadingRef.current ? 1 : 0
  })

  // Rebuild colorNode whenever a texture changes.
  useEffect(() => {
    if (!primaryTex) return
    // Y-flip workaround for CompressedTexture: KTX2 stores image data with
    // origin at bottom-left (OpenGL convention) while CanvasTexture from a
    // 2D canvas has origin at top-left. CompressedTexture upload ignores
    // `flipY` (compressed blocks can't be flipped at upload), and our owned
    // Ktx2Loader explicitly sets flipY=false even for the RGBA32 fallback so
    // the data is uniformly bottom-up regardless of basis target. We flip
    // the V coordinate in the shader to compensate, but ONLY for compressed
    // textures — CanvasTexture's flipY=true upload already got its data
    // right-side-up.
    //
    // Detection uses `isCompressedTexture` flag (only set on CompressedTexture
    // and its subclasses). Earlier check via `mipmaps !== undefined` was
    // unreliable: three's Texture base initializes `mipmaps = []` (empty
    // array, not undefined), so the check would pass for ANY texture and
    // V-flip CanvasTextures too — WebP/AVIF previews displayed upside-down.
    //
    // Each side flips independently. Originally only the compare side
    // flipped; that left the primary side displaying upside-down whenever
    // the user passed a CompressedTexture as primary (inspect mode for
    // KTX2 — primary === compare === KTX2 — surfaced this).
    const isPrimaryCompressed = !!(primaryTex as { isCompressedTexture?: boolean }).isCompressedTexture
    const primaryUV = isPrimaryCompressed ? vec2(uv().x, float(1).sub(uv().y)) : uv()
    const a = texture(primaryTex, primaryUV)
    // For the compare texture, sample at the selected LOD using textureLevel().
    // For non-CompressedTextures (CanvasTexture) the uniform is 0, so the
    // result is equivalent to texture() at full resolution.
    const isCompareCompressed = !!(compareTex as { isCompressedTexture?: boolean } | null)?.isCompressedTexture
    const compareUV = isCompareCompressed
      ? vec2(uv().x, float(1).sub(uv().y))
      : uv()
    const compareSample = compareTex ? textureLevel(compareTex, compareUV, mipLevelBNode) : a

    // Loading-state visualization: while a re-encode is in flight, force
    // the right side to the primary texture and apply a desaturation +
    // dim. Build that variant separately and `select` between the raw
    // sample and the desat'd one — avoiding the rgb→vec3→vec4 round-trip
    // for the non-loading case (the round-trip subtly shifts color-space
    // metadata vs. the direct texture sample on the left side, leading to
    // a visible "phantom" desaturation even at mix-factor 0).
    const luma = dot(a.rgb, vec3(0.299, 0.587, 0.114))
    const grey = vec3(luma).mul(0.55)
    const desatRGB = mix(a.rgb, grey, 0.75)
    const bLoading = vec4(desatRGB, a.a)

    // When loadingNode === 1 → use the desat'd primary; else → raw compareSample.
    const b = select(loadingNode.equal(1), bLoading, compareSample)

    // Split decision uses screenUV (canvas-space), NOT uv() (geometry-relative).
    // This keeps the shader split aligned with the HTML slider's screen-X
    // regardless of letterbox / pillarbox / pan / zoom — the slider sits at
    // `splitU * canvasWidth` and the shader splits at `screenUV.x === splitU`,
    // so they always agree. Texture sampling still uses uv() so the image is
    // mapped to the geometry correctly; only the SPLIT decision is screen-space.
    material.colorNode = select(screenUV.x.lessThan(splitUNode), a, b)
    material.needsUpdate = true
  }, [primaryTex, compareTex, splitUNode, mipLevelBNode, loadingNode, material])

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
 * The split is implemented as a TSL `select(screenUV.x.lessThan(splitU), a, b)`
 * node expression — using `screenUV` (canvas-space) rather than `uv()`
 * (geometry-relative) so the split always aligns with the HTML slider's
 * screen-X regardless of letterbox / pan / zoom. `splitU` is a uniform
 * mutated in-place so slider ticks don't rebuild the shader graph.
 *
 * `mipLevelB` selects the mip level for the compare texture via `textureLevel()`.
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
  mipLevelB = 0,
  compareLoading = false,
}: CompareLayerProps) {
  if (!imageSource) {
    return <div style={{ position: 'absolute', inset: 0 }} />
  }
  return (
    <Canvas
      dpr={1}
      // Continuous render loop — required for the useFrame-driven uniform
      // pushes inside CompareScene. With "demand" the canvas would freeze
      // the moment the drag stops mutating React state, even though the
      // refs hold a fresher splitU value.
      frameloop="always"
      renderer={{ antialias: false }}
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
          mipLevelB={mipLevelB}
          pixelArt={pixelArt}
          fitMargin={fitMargin}
          zoom={zoom}
          panX={panX}
          panY={panY}
          compareLoading={compareLoading}
          onPrimaryReady={onImageReady}
        />
      </Suspense>
    </Canvas>
  )
}
