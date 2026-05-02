import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import * as stylex from '@stylexjs/stylex'
import { decodeImage } from '@three-flatland/image'

import basisTranscoderJsUrl from 'three/examples/jsm/libs/basis/basis_transcoder.js?url'
import basisTranscoderWasmUrl from 'three/examples/jsm/libs/basis/basis_transcoder.wasm?url'

// ─── KTX2Loader singleton ─────────────────────────────────────────────────────

let loaderPromise: Promise<unknown> | null = null
let cachedLoader: unknown = null

async function getKtx2Loader(renderer: THREE.WebGLRenderer | null): Promise<unknown | null> {
  if (cachedLoader) return cachedLoader
  if (!renderer) return null
  if (!loaderPromise) {
    loaderPromise = (async () => {
      const { KTX2Loader } = await import('three/examples/jsm/loaders/KTX2Loader.js')
      const loader = new KTX2Loader()
      // setTranscoderPath wants a directory; strip the filename.
      const transcoderDir = basisTranscoderJsUrl.replace(/\/[^/]+$/, '/')
      loader.setTranscoderPath(transcoderDir)
      loader.detectSupport(renderer)
      // Ensure Vite includes the wasm asset by referencing its URL.
      void basisTranscoderWasmUrl
      cachedLoader = loader
      return loader
    })()
  }
  return loaderPromise
}

// ─── Shaders ──────────────────────────────────────────────────────────────────

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const FRAG = /* glsl */ `
  precision highp float;
  uniform sampler2D textureA;
  uniform sampler2D textureB;
  uniform float splitU;
  varying vec2 vUv;
  void main() {
    vec4 c = vUv.x < splitU ? texture2D(textureA, vUv) : texture2D(textureB, vUv);
    gl_FragColor = c;
  }
`

// ─── CompareQuad ──────────────────────────────────────────────────────────────

interface QuadProps {
  textureA: THREE.Texture
  textureB: THREE.Texture
  splitU: number
}

function CompareQuad({ textureA, textureB, splitU }: QuadProps) {
  const matRef = useRef<THREE.ShaderMaterial>(null)
  const uniforms = useMemo(
    () => ({
      textureA: { value: textureA },
      textureB: { value: textureB },
      splitU: { value: splitU },
    }),
    [textureA, textureB],
  )

  useFrame(() => {
    const mat = matRef.current
    if (mat && mat.uniforms['splitU']) {
      mat.uniforms['splitU'].value = splitU
    }
  })

  return (
    <mesh>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={VERT}
        fragmentShader={FRAG}
        uniforms={uniforms}
      />
    </mesh>
  )
}

// ─── RendererBridge ───────────────────────────────────────────────────────────

function RendererBridge({ onReady }: { onReady: (gl: THREE.WebGLRenderer) => void }) {
  const gl = useThree((s) => s.gl)
  useEffect(() => {
    onReady(gl as THREE.WebGLRenderer)
  }, [gl, onReady])
  return null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function imageDataToTexture(image: ImageData): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = image.width
  c.height = image.height
  c.getContext('2d')!.putImageData(image, 0, 0)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.minFilter = THREE.LinearFilter
  t.magFilter = THREE.LinearFilter
  t.needsUpdate = true
  return t
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = stylex.create({
  fill: {
    width: '100%',
    height: '100%',
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stage: {
    position: 'relative',
    maxWidth: '100%',
    maxHeight: '100%',
  },
  canvasBox: {
    width: '100%',
    height: '100%',
  },
  sliderLine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
    background: 'rgba(255,255,255,0.85)',
    boxShadow: '0 0 0 1px rgba(0,0,0,0.5)',
    transform: 'translateX(-50%)',
    pointerEvents: 'none',
  },
  sliderHandle: {
    position: 'absolute',
    top: '50%',
    width: 28,
    height: 28,
    marginTop: -14,
    marginLeft: -14,
    borderRadius: '50%',
    background: 'rgba(255,255,255,0.92)',
    boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
    cursor: 'ew-resize',
    pointerEvents: 'auto',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#333',
    fontSize: 14,
    fontWeight: 'bold',
    userSelect: 'none',
  },
  hitArea: {
    position: 'absolute',
    inset: 0,
    cursor: 'ew-resize',
    pointerEvents: 'auto',
    background: 'transparent',
  },
  empty: { padding: 24, opacity: 0.6 },
})

// ─── Props ────────────────────────────────────────────────────────────────────

type EncodedFormat = 'png' | 'webp' | 'avif' | 'ktx2'

interface ComparePreviewProps {
  originalImage: ImageData | null
  encodedBytes: Uint8Array | null
  encodedFormat: EncodedFormat | null
  isEncoding: boolean
  encodeError: string | null
}

// ─── ComparePreview ───────────────────────────────────────────────────────────

export function ComparePreview({
  originalImage,
  encodedBytes,
  encodedFormat,
  isEncoding: _isEncoding,
  encodeError,
}: ComparePreviewProps) {
  const original = useMemo(
    () => (originalImage ? imageDataToTexture(originalImage) : null),
    [originalImage],
  )
  useEffect(
    () => () => {
      original?.dispose()
    },
    [original],
  )

  // Renderer state — lifted from RendererBridge so encoded-texture effect can
  // depend on it and re-run once the Canvas is ready.
  const [renderer, setRenderer] = useState<THREE.WebGLRenderer | null>(null)

  // Encoded-texture state
  const [encoded, setEncoded] = useState<THREE.Texture | null>(null)
  const reqIdRef = useRef(0)

  useEffect(() => {
    if (!encodedBytes || !encodedFormat) {
      setEncoded((prev) => { prev?.dispose(); return null })
      return
    }
    const reqId = ++reqIdRef.current
    let cancelled = false

    void (async () => {
      try {
        let texture: THREE.Texture
        if (encodedFormat === 'ktx2') {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const loader = await getKtx2Loader(renderer) as any
          if (!loader) {
            // Renderer not ready yet — the renderer dep will trigger a re-run.
            return
          }
          const buffer = encodedBytes.buffer.slice(
            encodedBytes.byteOffset,
            encodedBytes.byteOffset + encodedBytes.byteLength,
          ) as ArrayBuffer
          texture = await new Promise<THREE.CompressedTexture>((resolve, reject) => {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call
            loader.parse(buffer, resolve, reject)
          })
        } else {
          const image = await decodeImage(encodedBytes, encodedFormat)
          texture = imageDataToTexture(image)
        }
        if (cancelled || reqId !== reqIdRef.current) {
          texture.dispose()
          return
        }
        setEncoded((prev) => { prev?.dispose(); return texture })
      } catch (err) {
        // The encode pipeline surfaces errors via store.encodeError.
        // Log here so the canvas falls back to original-only rendering.
        console.error('encoded texture decode failed', err)
      }
    })()

    return () => { cancelled = true }
  }, [encodedBytes, encodedFormat, renderer])

  // Unmount cleanup
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => { encoded?.dispose() }, [])

  const [splitU, setSplitU] = useState(0.5)
  const stageRef = useRef<HTMLDivElement>(null)

  const onDragStart = (e: React.PointerEvent<HTMLDivElement>) => {
    const stage = stageRef.current
    if (!stage) return
    e.preventDefault()
    const rect = stage.getBoundingClientRect()
    const move = (ev: PointerEvent) => {
      const u = Math.min(1, Math.max(0, (ev.clientX - rect.left) / rect.width))
      setSplitU(u)
    }
    move(e.nativeEvent)
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  if (!original || !originalImage) {
    return (
      <div {...stylex.props(styles.empty)}>
        {encodeError ? `error: ${encodeError}` : 'loading…'}
      </div>
    )
  }

  // Fall back to original on the right side when no encode result yet.
  const textureB = encoded ?? original

  return (
    <div {...stylex.props(styles.fill)}>
      <div
        ref={stageRef}
        {...stylex.props(styles.stage)}
        style={{ aspectRatio: `${originalImage.width} / ${originalImage.height}` }}
      >
        <div {...stylex.props(styles.canvasBox)}>
          <Canvas
            orthographic
            camera={{ position: [0, 0, 1], near: 0.01, far: 10, zoom: 1 }}
            dpr={[1, 2]}
            gl={{ antialias: false, alpha: false, preserveDrawingBuffer: false }}
            flat
            style={{ display: 'block', width: '100%', height: '100%' }}
          >
            <RendererBridge onReady={setRenderer} />
            <CompareQuad textureA={original} textureB={textureB} splitU={splitU} />
          </Canvas>
        </div>
        {/* Hit area for click-anywhere drag */}
        <div {...stylex.props(styles.hitArea)} onPointerDown={onDragStart} />
        {/* Slider line + handle, positioned via inline style */}
        <div {...stylex.props(styles.sliderLine)} style={{ left: `${splitU * 100}%` }} />
        <div
          {...stylex.props(styles.sliderHandle)}
          style={{ left: `${splitU * 100}%` }}
          onPointerDown={onDragStart}
        >
          &#8214;
        </div>
      </div>
    </div>
  )
}
