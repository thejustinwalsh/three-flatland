import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import * as stylex from '@stylexjs/stylex'

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

interface ComparePreviewProps {
  originalImage: ImageData | null
  encodeError: string | null
}

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

export function ComparePreview({ originalImage, encodeError }: ComparePreviewProps) {
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
            {/* Use the SAME texture for both sides — Task 3 wires the encoded one. */}
            <CompareQuad textureA={original} textureB={original} splitU={splitU} />
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
