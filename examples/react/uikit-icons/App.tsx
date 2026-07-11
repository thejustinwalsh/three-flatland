import { Suspense, useEffect, type ReactNode } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber/webgpu'
import { Fullscreen, Container, installIconAtlas } from '@three-flatland/uikit/react'
import { usePane, DevtoolsProvider } from '@three-flatland/devtools/react'
import { suspend } from 'suspend-react'
import {
  Activity,
  Airplay,
  AlarmClock,
  Archive,
  Award,
  Bell,
  BookOpen,
  Calendar,
  Camera,
  Check,
  ChevronDown,
  Clock,
  Cloud,
  Compass,
  Database,
  Download,
  Flame,
  Gauge,
  Heart,
  House,
  Image,
  Layers,
  Menu,
  Search,
  Star,
  Zap,
} from '@three-flatland/uikit-lucide/react'
import { GemBackground } from './GemBackground'
import { GEM } from './gem'

// ============================================================================
// uikit icons — a baked lucide icon atlas, rendered as a grid via
// `@three-flatland/uikit-lucide/react` components. `installIconAtlas`
// (suspense-wrapped, the R3F-idiomatic path — mirrors `useLoader`) swaps in
// a baked `SlugShapeSet` (see `bake-icons.mts`) BEFORE the grid mounts, so
// every generated lucide component below — which already carries its own
// `icon` name — resolves with ZERO SVG parsing and batches into the SAME
// shared `SlugShapeSet`: `ShapeGroupManager` collapses all 26 icons into one
// `InstancedShapeMesh` draw call. Honest framing (index.html's HUD copy):
// this is a draw-count / CPU / scalability win, not a GPU-ms win.
// ============================================================================

const ICONS = [
  Activity,
  Airplay,
  AlarmClock,
  Archive,
  Award,
  Bell,
  BookOpen,
  Calendar,
  Camera,
  Check,
  ChevronDown,
  Clock,
  Cloud,
  Compass,
  Database,
  Download,
  Flame,
  Gauge,
  Heart,
  House,
  Image,
  Layers,
  Menu,
  Search,
  Star,
  Zap,
] as const

// Gem palette (see examples/_shared/gems.config.ts) — cycled per tile so the
// grid reads as "color is taxonomy", matching the brand's gem-named system.
const PALETTE = [
  '#00c4e9',
  '#00c38b',
  '#d29a00',
  '#995bff',
  '#eb3c67',
  '#e875c6',
  '#f3562e',
  '#2bd2c2',
]

/** Suspends until the atlas is installed — the R3F-idiomatic sibling of
 * `useLoader(SlugShapeSetLoader, url)`, matching `useSlugFont` in the
 * uikit-bento example. */
function useIconAtlas(url: string): void {
  suspend(() => installIconAtlas(url), [url, 'uikit-icons-atlas'])
}

/** A rounded chip behind one icon — the gem-gradient backdrop shows through
 * the gaps between chips (root Fullscreen stays transparent). */
function Chip({ children }: { children: ReactNode }) {
  return (
    <Container
      width={88}
      height={88}
      borderRadius={20}
      backgroundColor="#171a20cc"
      justifyContent="center"
      alignItems="center"
    >
      {children}
    </Container>
  )
}

/** Live draw-call readout, written straight to the DOM HUD (index.html) —
 * mutating a ref every frame instead of `setState` per the render-loop rule.
 * `useThree`'s `gl` types as the classic `WebGLRenderer` (whose `info.render`
 * has no `drawCalls`); the `/webgpu` Canvas actually hands back a
 * `WebGPURenderer`, whose `info.render` does — see `renderers/common/Info.d.ts`. */
function DrawsReadout() {
  const gl = useThree((s) => s.gl) as unknown as { info: { render: { drawCalls: number } } }
  useFrame(() => {
    const el = document.getElementById('draws')
    if (el) el.textContent = `${gl.info.render.drawCalls} draw calls this frame`
  })
  return null
}

/** Debug hook — lets a devtools console (or vitexec) inspect the actual
 * rendered scene/renderer, e.g. to count `InstancedShapeMesh` instances
 * and read `info.render.drawCalls`. */
function DebugExpose() {
  const scene = useThree((s) => s.scene)
  const gl = useThree((s) => s.gl)
  useEffect(() => {
    const w = window as unknown as { __scene?: unknown; __renderer?: unknown }
    w.__scene = scene
    w.__renderer = gl
  }, [scene, gl])
  return null
}

function IconGrid() {
  useIconAtlas('./icons.shapes.glb')
  return (
    <Fullscreen
      flexDirection="row"
      flexWrap="wrap"
      justifyContent="center"
      alignItems="center"
      gap={20}
      padding={48}
    >
      {ICONS.map((Icon, i) => (
        <Chip key={i}>
          <Icon width={40} height={40} color={PALETTE[i % PALETTE.length]} />
        </Chip>
      ))}
    </Fullscreen>
  )
}

function Scene() {
  // The pane must stay mounted while the atlas loads, so the suspending
  // `IconGrid` lives below an inner Suspense (mirrors uikit-bento's
  // `useSlugFont` pattern).
  usePane()
  return (
    <>
      <GemBackground gem={GEM} />
      <DrawsReadout />
      <DebugExpose />
      <Suspense fallback={null}>
        <IconGrid />
      </Suspense>
    </>
  )
}

export default function App() {
  return (
    <Canvas renderer={{ antialias: false }}>
      <DevtoolsProvider name="uikit-icons" />
      <Scene />
    </Canvas>
  )
}
