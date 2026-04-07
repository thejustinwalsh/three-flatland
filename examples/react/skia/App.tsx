import { Canvas, extend, useFrame, useThree } from '@react-three/fiber/webgpu'
import { useRef, useState, useCallback, Suspense } from 'react'
import {
  SkiaCanvas,
  SkiaRect,
  SkiaCircle,
  SkiaOval,
  SkiaLine,
  SkiaPathNode,
  SkiaTextNode,
  SkiaGroup,
  SkiaFontLoader,
  useSkiaContext,
} from '@three-flatland/skia/react'
import type { SkiaFont } from '@three-flatland/skia'

extend({ SkiaCanvas, SkiaRect, SkiaCircle, SkiaOval, SkiaLine, SkiaPathNode, SkiaTextNode, SkiaGroup })

const STAR_D = buildStarPath(0, 0, 60, 25, 5)
const FONT_URL = 'https://cdn.jsdelivr.net/gh/rsms/inter@v4.1/docs/font-files/InterVariable.ttf'

function buildStarPath(cx: number, cy: number, outerR: number, innerR: number, points: number): string {
  const parts: string[] = []
  for (let i = 0; i < points * 2; i++) {
    const angle = (Math.PI / points) * i - Math.PI / 2
    const r = i % 2 === 0 ? outerR : innerR
    parts.push(`${i === 0 ? 'M' : 'L'}${cx + Math.cos(angle) * r} ${cy + Math.sin(angle) * r}`)
  }
  parts.push('Z')
  return parts.join(' ')
}

function SkiaScene() {
  const gl = useThree((s) => s.gl)
  const size = useThree((s) => s.size)
  const skia = useSkiaContext()
  const canvasRef = useRef<SkiaCanvas>(null)
  const starGroupRef = useRef<SkiaGroup>(null)
  const frameTextRef = useRef<InstanceType<typeof SkiaTextNode>>(null)
  const [font, setFont] = useState<SkiaFont | null>(null)

  // Load font once Skia context is available
  if (skia && !font) {
    SkiaFontLoader.load(FONT_URL, { context: skia, size: 20 }).then(setFont)
  }

  const w = size.width
  const h = size.height
  const pw = w * devicePixelRatio
  const ph = h * devicePixelRatio

  let frame = useRef(0)

  useFrame(() => {
    frame.current++
    if (starGroupRef.current) {
      starGroupRef.current.skiaRotate = frame.current * 0.6
    }
    if (frameTextRef.current) {
      frameTextRef.current.text = `Frame: ${frame.current}`
    }
    if (canvasRef.current) {
      canvasRef.current.invalidate()
      canvasRef.current.render(gl as any)
    }
  })

  return (
    <skiaCanvas ref={canvasRef} renderer={gl as any} width={pw} height={ph} overlay>
      {/* Background */}
      <skiaRect x={0} y={0} width={w} height={h} fill={[0.04, 0.04, 0.1, 1]} />

      {/* Red rect */}
      <skiaRect x={50} y={50} width={200} height={120} fill={[1, 0.2, 0.2, 1]} />

      {/* Blue rounded rect */}
      <skiaRect x={300} y={50} width={200} height={120} cornerRadius={20} fill={[0.2, 0.4, 1, 1]} />

      {/* Green circle */}
      <skiaCircle cx={150} cy={280} r={60} fill={[0.2, 0.9, 0.4, 1]} />

      {/* Yellow stroked oval */}
      <skiaOval x={300} y={220} width={200} height={120} stroke={[1, 0.8, 0.2, 1]} strokeWidth={3} />

      {/* Animated rotating star */}
      <skiaGroup ref={starGroupRef} tx={w / 2} ty={h / 2}>
        <skiaPathNode d={STAR_D} fill={[1, 1, 1, 1]} />
      </skiaGroup>

      {/* Divider line */}
      <skiaLine x1={50} y1={h - 80} x2={w - 50} y2={h - 80} stroke={[1, 0.8, 0.2, 1]} strokeWidth={2} />

      {/* Title text */}
      {font && (
        <>
          <skiaTextNode text="Skia + R3F WebGPU" x={50} y={h - 44} font={font} fill={[1, 1, 1, 1]} />
          <skiaTextNode ref={frameTextRef} text="Frame: 0" x={w - 200} y={h - 44} font={font} fill={[0.2, 0.9, 0.4, 1]} />
        </>
      )}
    </skiaCanvas>
  )
}

function StatsTracker({ onStats }: { onStats: (fps: number) => void }) {
  const frameCount = useRef(0)
  const elapsed = useRef(0)

  useFrame((_, delta) => {
    frameCount.current++
    elapsed.current += delta
    if (elapsed.current >= 1) {
      onStats(Math.round(frameCount.current / elapsed.current))
      frameCount.current = 0
      elapsed.current = 0
    }
  })
  return null
}

export default function App() {
  const [fps, setFps] = useState<string | number>('-')
  const handleStats = useCallback((f: number) => setFps(f), [])

  return (
    <>
      <div
        id="status"
        className="ok"
        style={{
          position: 'fixed',
          top: 12,
          left: 12,
          zIndex: 100,
          padding: '5px 10px',
          background: 'rgba(0, 0, 0, 0.75)',
          borderRadius: 6,
          fontFamily: 'ui-monospace, monospace',
          fontSize: 13,
        }}
      >
        FPS: {fps}
      </div>
      <Canvas
        orthographic
        camera={{ position: [0, 0, 1], near: -1, far: 1, zoom: 1 }}
        renderer={{ antialias: true }}
        gl={{ antialias: true }}
      >
        <StatsTracker onStats={handleStats} />
        <SkiaScene />
      </Canvas>
    </>
  )
}
