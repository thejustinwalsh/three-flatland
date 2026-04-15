import { Canvas, extend, useFrame, useThree, useLoader } from '@react-three/fiber/webgpu'
import { useRef, useEffect, useMemo, useState, Suspense } from 'react'
import {
  SkiaCanvas,
  SkiaRect,
  SkiaCircle,
  SkiaLine,
  SkiaPathNode,
  SkiaTextNode,
  SkiaGroup,
  SkiaFontLoader,
  useSkiaContext,
  attachSkiaTexture,
} from '@three-flatland/skia/react'
import { SkiaPaint, SkiaPath } from '@three-flatland/skia'
import type { SkiaCanvas as SkiaCanvasInstance } from '@three-flatland/skia/three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import {
  reflector, color as tslColor, positionWorld, float as tslFloat,
} from 'three/tsl'
import { gaussianBlur } from 'three/addons/tsl/display/GaussianBlurNode.js'
import { Color, DoubleSide, Fog, type Mesh, type MeshBasicMaterial } from 'three'
import { MeshStandardNodeMaterial } from 'three/webgpu'
import { usePane } from '@three-flatland/devtools/react'

extend({ SkiaRect, SkiaCircle, SkiaLine, SkiaPathNode, SkiaTextNode, SkiaGroup })

// ── Constants ──

const TEX_W = 1024
const TEX_H = 880
const SCALE = TEX_W / 512
const FONT_URL = 'https://cdn.jsdelivr.net/gh/rsms/inter@v4.1/docs/font-files/InterVariable.ttf'

const GRAD_COLORS: [number, number][] = [
  [0xFFFF4444, 0xFF4444FF], [0xFF44FF44, 0xFFFF44FF],
  [0xFFFFAA00, 0xFF00AAFF], [0xFF4488FF, 0xFFFF8844],
]

const PATH_OP_NAMES: Array<'difference' | 'intersect' | 'union' | 'xor'> = [
  'difference', 'intersect', 'union', 'xor',
]
const PATH_OP_COLORS: [number, number, number, number][] = [
  [0.9, 0.3, 0.3, 0.9], [0.3, 0.9, 0.4, 0.9], [0.3, 0.5, 0.9, 0.9], [0.9, 0.7, 0.2, 0.9],
]

// ── Utilities ──

function hslToArgb(h: number, s: number, l: number): number {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs((h / 60) % 2 - 1))
  const m = l - c / 2
  let r: number, g: number, b: number
  if (h < 60) { r = c; g = x; b = 0 }
  else if (h < 120) { r = x; g = c; b = 0 }
  else if (h < 180) { r = 0; g = c; b = x }
  else if (h < 240) { r = 0; g = x; b = c }
  else if (h < 300) { r = x; g = 0; b = c }
  else { r = c; g = 0; b = x }
  const ri = Math.round((r + m) * 255), gi = Math.round((g + m) * 255), bi = Math.round((b + m) * 255)
  return (0xFF000000 | (ri << 16) | (gi << 8) | bi) >>> 0
}

function smoothstep(t: number): number { return t * t * (3 - 2 * t) }

// ── Self-Animating Shape Components ──

const SQ_INIT = [
  [0.9, 0.3, 0.3], [0.3, 0.9, 0.4], [0.3, 0.5, 0.9],
  [0.9, 0.7, 0.2], [0.7, 0.3, 0.9], [0.2, 0.8, 0.8],
]

function Squares() {
  const refs = useRef<(SkiaRect | null)[]>([])
  const state = useRef({
    cols: SQ_INIT.map(c => [...c]),
    swapA: 0, swapB: 1, swapStart: 0,
    fromA: [...SQ_INIT[0]!], fromB: [...SQ_INIT[1]!],
    toA: [...SQ_INIT[1]!], toB: [...SQ_INIT[0]!],
  })

  useFrame(({ elapsed }) => {
    const t = elapsed * 1000
    const s = state.current
    const sqDur = 3000
    let sqT = Math.min((t - s.swapStart) / sqDur, 1.0)
    sqT = smoothstep(sqT)
    if (sqT >= 1.0 && t > 0) {
      s.cols[s.swapA] = [...s.toA]; s.cols[s.swapB] = [...s.toB]
      const a = Math.floor(Math.random() * 6)
      const b = (a + 1 + Math.floor(Math.random() * 5)) % 6
      s.swapA = a; s.swapB = b; s.swapStart = t
      s.fromA = [...s.cols[a]!]; s.fromB = [...s.cols[b]!]
      s.toA = [...s.cols[b]!]; s.toB = [...s.cols[a]!]
      sqT = 0
    }
    for (let i = 0; i < 6; i++) {
      const node = refs.current[i]
      if (!node) continue
      let c = s.cols[i]!
      if (i === s.swapA) c = s.fromA.map((v, j) => v + (s.toA[j]! - v) * sqT)
      else if (i === s.swapB) c = s.fromB.map((v, j) => v + (s.toB[j]! - v) * sqT)
      node.fill = [c[0]!, c[1]!, c[2]!, 1]
    }
  })

  return <>
    {SQ_INIT.map((col, i) => (
      <skiaRect key={i} ref={(el: SkiaRect | null) => { refs.current[i] = el }}
        x={30 + i * 78} y={30} width={68} height={68} cornerRadius={10}
        fill={[col[0]!, col[1]!, col[2]!, 1] as [number, number, number, number]}
      />
    ))}
  </>
}

function Circles() {
  const refs = useRef<(SkiaCircle | null)[]>([])

  useFrame(({ elapsed }) => {
    const t = elapsed * 1000
    for (let i = 0; i < 8; i++) {
      const node = refs.current[i]
      if (!node) continue
      const ct = ((i / 8) + t * 0.0002) % 1.0
      node.fill = [0.15 + 0.35 * ct, 0.2 + 0.25 * (1 - ct), 0.3 + 0.4 * Math.sin(ct * Math.PI * 2 + 4), 0.7]
    }
  })

  return <>
    {Array.from({ length: 8 }, (_, i) => (
      <skiaCircle key={i} ref={(el: SkiaCircle | null) => { refs.current[i] = el }}
        cx={64 + i * 56} cy={140} r={18}
        fill={[0.4, 0.4, 0.6, 0.7] as [number, number, number, number]}
      />
    ))}
  </>
}

function Frames() {
  return <>
    <skiaRect x={20} y={170} width={472} height={100}
      stroke={[1, 1, 1, 0.3] as [number, number, number, number]} strokeWidth={2} />
    <skiaRect x={28} y={176} width={456} height={88} cornerRadius={10}
      stroke={[1, 1, 1, 0.3] as [number, number, number, number]} strokeWidth={2} />
  </>
}

function ScannerLines() {
  const refs = useRef<(SkiaLine | null)[]>([])

  useFrame(({ elapsed }) => {
    const t = elapsed * 1000
    const phase = Math.floor(t / 83) % 9
    for (let i = 0; i < 9; i++) {
      const node = refs.current[i]
      if (!node) continue
      const lt = ((i + phase) % 9) / 9
      node.stroke = [0.5 + 0.5 * lt, 0.8 - 0.3 * lt, 0.3 + 0.5 * lt, 0.6]
    }
  })

  return <>
    {Array.from({ length: 9 }, (_, i) => (
      <skiaLine key={i} ref={(el: SkiaLine | null) => { refs.current[i] = el }}
        x1={36} y1={184 + i * 9} x2={472} y2={184 + i * 9}
        strokeWidth={1} stroke={[0.5, 0.8, 0.3, 0.6] as [number, number, number, number]}
      />
    ))}
  </>
}

function GradientBars() {
  const skia = useSkiaContext()!
  const refs = useRef<(SkiaRect | null)[]>([])
  const [paints] = useState(() =>
    GRAD_COLORS.map(() => new SkiaPaint(skia).setFill()))

  // Wire paints to nodes once refs are available
  useFrame(({ elapsed }) => {
    const t = elapsed * 1000
    for (let i = 0; i < paints.length; i++) {
      const node = refs.current[i]
      if (!node) continue
      if (!node.paint) node.paint = paints[i]
      const y = 284 + i * 22
      const dir = (i % 2 === 0) ? 1 : -1
      const speed = 0.15 + i * 0.03
      const mid = 0.5 + 0.4 * Math.sin(t * speed * 0.001 * dir)
      const [cA, cB] = GRAD_COLORS[i]!
      paints[i]!.setLinearGradient(30, y, 482, y, [cA!, cB!, cA!], [0, mid, 1])
    }
  })

  return <>
    {GRAD_COLORS.map((_, i) => (
      <skiaRect key={i} ref={(el: SkiaRect | null) => { refs.current[i] = el }}
        x={30} y={284 + i * 22} width={452} height={16} cornerRadius={4}
      />
    ))}
  </>
}

function PathOpGroup({ index }: { index: number }) {
  const skia = useSkiaContext()!
  const resultRef = useRef<SkiaPathNode>(null)
  const ghostARef = useRef<SkiaPathNode>(null)
  const ghostBRef = useRef<SkiaPathNode>(null)
  const [paths] = useState(() => ({
    a: new SkiaPath(skia), b: new SkiaPath(skia), result: new SkiaPath(skia),
  }))

  useFrame(({ elapsed }) => {
    const t = elapsed * 1000
    const cx = 75 + index * 120
    const spread = 12 + 6 * Math.sin(t * 0.002 + index)
    paths.a.reset().addCircle(cx - spread, 404, 26)
    paths.b.reset().addCircle(cx + spread, 404, 26)
    const ok = paths.a.opInto(paths.b, PATH_OP_NAMES[index]!, paths.result)
    if (resultRef.current) {
      resultRef.current.path = ok ? paths.result : undefined
      resultRef.current.visible = ok
    }
    if (ghostARef.current) ghostARef.current.path = paths.a
    if (ghostBRef.current) ghostBRef.current.path = paths.b
  })

  return (
    <skiaGroup>
      <skiaPathNode ref={resultRef} fill={PATH_OP_COLORS[index]} />
      <skiaPathNode ref={ghostARef} stroke={[1, 1, 1, 0.15] as [number, number, number, number]} strokeWidth={1} />
      <skiaPathNode ref={ghostBRef} stroke={[1, 1, 1, 0.15] as [number, number, number, number]} strokeWidth={1} />
    </skiaGroup>
  )
}

// ── Overlay Text ──

function OverlayText() {
  const skia = useSkiaContext()
  const typeface = useLoader(SkiaFontLoader, FONT_URL)
  const size = useThree((s) => s.size)
  const dpr = Math.min(devicePixelRatio, 2)
  const pw = size.width * dpr
  const ph = size.height * dpr

  const titleFont = typeface.atSize(Math.round(32 * dpr))
  const subFont = typeface.atSize(Math.round(14 * dpr))
  const fpsFont = typeface.atSize(Math.round(11 * dpr))

  const subtitleRef = useRef<SkiaTextNode>(null)
  const [subtitlePaint] = useState(() => new SkiaPaint(skia).setFill())

  const titleX = (pw - titleFont.measureText('@three-flatland/skia')) / 2
  const subtitleX = (pw - subFont.measureText('GPU-accelerated vector graphics in the browser')) / 2

  useFrame(({ elapsed }) => {
    // Subtitle rainbow gradient
    const sub = subtitleRef.current
    if (sub) {
      sub.paint = subtitlePaint
      const t = elapsed * 1000
      const hue1 = (t * 0.05) % 360
      const hue2 = (hue1 + 120) % 360
      const subW = subFont.measureText(sub.text)
      subtitlePaint.setLinearGradient(
        sub.x, 0, sub.x + subW, 0,
        [hslToArgb(hue1, 0.8, 0.6), hslToArgb(hue2, 0.8, 0.6)], [0, 1],
      )
    }
  })

  return <>
    <skiaTextNode text="@three-flatland/skia" font={titleFont}
      fill={[1, 1, 1, 1]} x={titleX} y={ph - 90} />
    <skiaTextNode ref={subtitleRef} text="GPU-accelerated vector graphics in the browser"
      font={subFont} paint={subtitlePaint} x={subtitleX} y={ph - 40} />
    <skiaTextNode text={`Backend: ${skia.backend.toUpperCase()}`} font={fpsFont}
      fill={[0.6, 0.6, 0.8, 0.6]} x={20} y={30} />
  </>
}

// ── 3D Scene Components ──

function ReflectiveGround() {
  const { mat, groundReflector } = useMemo(() => {
    const mat = new MeshStandardNodeMaterial()
    const groundReflector = reflector({ resolutionScale: 1.0 })
    const blurredReflection = gaussianBlur(groundReflector, null, 6)
    const dist = positionWorld.xz.length()
    const fadeFactor = dist.div(3.0).clamp(0.0, 1.0).oneMinus()
    const fadeSharp = fadeFactor.mul(fadeFactor).mul(fadeFactor)
    mat.colorNode = tslColor(new Color(0x050505)).add((blurredReflection as any).rgb.mul(fadeSharp).mul(0.5))
    mat.roughnessNode = tslFloat(0.5).add(dist.div(5.0).clamp(0.0, 0.5))
    mat.metalness = 0.5
    return { mat, groundReflector }
  }, [])

  const meshRef = useRef<Mesh>(null)
  useEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    mesh.add(groundReflector.target)
    return () => { mesh.remove(groundReflector.target) }
  }, [groundReflector])

  return (
    <mesh ref={meshRef} rotation-x={-Math.PI / 2} position-y={-0.01} material={mat}>
      <planeGeometry args={[50, 50]} />
    </mesh>
  )
}

function Controls({ dampingFactor, minDistance, maxDistance }: {
  dampingFactor: number
  minDistance: number
  maxDistance: number
}) {
  const gl = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera)
  const controlsRef = useRef<OrbitControls | null>(null)

  useEffect(() => {
    const controls = new OrbitControls(camera, gl.domElement)
    controls.enableDamping = true
    controls.dampingFactor = dampingFactor
    controls.target.set(0, 0.9, 0)
    controls.minDistance = minDistance
    controls.maxDistance = maxDistance
    controls.maxPolarAngle = Math.PI * 0.85
    controlsRef.current = controls
    return () => controls.dispose()
  }, [camera, gl]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const c = controlsRef.current
    if (!c) return
    c.dampingFactor = dampingFactor
    c.minDistance = minDistance
    c.maxDistance = maxDistance
  }, [dampingFactor, minDistance, maxDistance])

  useFrame(() => controlsRef.current?.update())
  return null
}

function Panels() {
  const panelW = 2.8
  const panelH = 2.8 * (TEX_H / TEX_W)
  const centerRef = useRef<Mesh>(null)
  const leftRef = useRef<Mesh>(null)
  const rightRef = useRef<Mesh>(null)
  const leftMatRef = useRef<MeshBasicMaterial>(null)
  const rightMatRef = useRef<MeshBasicMaterial>(null)
  const renderer = useThree((s) => s.renderer)

  const canvasRef = useRef<SkiaCanvasInstance>(null)

  useFrame(({ elapsed }) => {
    // Hover animation
    const hover = Math.sin(elapsed) * 0.05
    if (centerRef.current) centerRef.current.position.y = 1.2 + hover
    if (leftRef.current) leftRef.current.position.y = 1.2 + hover
    if (rightRef.current) rightRef.current.position.y = 1.2 + hover

    // Share texture with side panels
    const texture = canvasRef.current?.texture ?? null;
    if (texture) {
      if (leftMatRef.current && leftMatRef.current.map !== texture) {
        leftMatRef.current.map = texture; leftMatRef.current.needsUpdate = true
      }
      if (rightMatRef.current && rightMatRef.current.map !== texture) {
        rightMatRef.current.map = texture; rightMatRef.current.needsUpdate = true
      }
    }
  })

  useFrame(() => {
    canvasRef.current?.render(true)
  }, { before: 'render' })

  return <>
    <mesh ref={centerRef} position={[0, 1.2, -0.4]}>
      <planeGeometry args={[panelW, panelH]} />
      <meshBasicMaterial color={0xffffff} side={DoubleSide} transparent premultipliedAlpha>
        <SkiaCanvas ref={canvasRef as any} attach={attachSkiaTexture} renderer={renderer} width={TEX_W} height={TEX_H}>
          <skiaRect x={0} y={0} width={TEX_W} height={TEX_H} fill={[0.06, 0.06, 0.1, 0] as [number, number, number, number]} />
          <skiaGroup scale={[SCALE, SCALE, 1]}>
            <Squares />
            <Circles />
            <Frames />
            <ScannerLines />
            <GradientBars />
            {PATH_OP_NAMES.map((_, i) => (
              <PathOpGroup key={i} index={i} />
            ))}
          </skiaGroup>
        </SkiaCanvas>
      </meshBasicMaterial>
    </mesh>
    <mesh ref={leftRef} position={[-2.6, 1.2, 0.3]} rotation-y={0.35}>
      <planeGeometry args={[panelW, panelH]} />
      <meshBasicMaterial ref={leftMatRef} color={0xffffff} side={DoubleSide} transparent premultipliedAlpha />
    </mesh>
    <mesh ref={rightRef} position={[2.6, 1.2, 0.3]} rotation-y={-0.35}>
      <planeGeometry args={[panelW, panelH]} />
      <meshBasicMaterial ref={rightMatRef} color={0xffffff} side={DoubleSide} transparent premultipliedAlpha />
    </mesh>
  </>
}

// ── Main Demo ──

function SkiaDemo() {
  const renderer = useThree((s) => s.renderer)
  const size = useThree((s) => s.size)
  const skia = useSkiaContext()

  const dpr = Math.min(devicePixelRatio, 2)
  const pw = size.width * dpr
  const ph = size.height * dpr

  const overlayRef = useRef<SkiaCanvasInstance>(null)

  // ── TweakPane debug controls ──
  usePane()

  // Render overlay after Three.js render
  useFrame(() => {
    overlayRef.current?.render(true)
  }, { after: 'render' })

  if (!skia) return null

  return <>
    <ambientLight color={0x404060} intensity={0.5} />
    <directionalLight color={0xffffff} intensity={0.8} position={[2, 4, 3]} />
    <Controls dampingFactor={0.05} minDistance={2} maxDistance={10} />
    <Panels />
    <ReflectiveGround />

    <SkiaCanvas ref={overlayRef as any} renderer={renderer} width={pw} height={ph} overlay>
      <Suspense fallback={null}>
        <OverlayText />
      </Suspense>
    </SkiaCanvas>
  </>
}

// ── App Root ──

export default function App() {
  return (
    <Canvas
      camera={{ position: [0, 0.9, 4.5], fov: 40, near: 0.1, far: 100 }}
      renderer={{ antialias: true, trackTimestamp: true }}
      onCreated={({ scene }) => {
        scene.background = new Color(0x191920)
        scene.fog = new Fog(0x191920, 0, 15)
      }}
    >
      <Suspense fallback={null}>
        <SkiaDemo />
      </Suspense>
    </Canvas>
  )
}
