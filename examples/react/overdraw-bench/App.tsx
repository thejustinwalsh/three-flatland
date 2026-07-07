import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { Canvas, extend, useFrame, useLoader, useThree } from '@react-three/fiber/webgpu'
import type { OrthographicCamera as ThreeOrthographicCamera } from 'three'
import {
  Sprite2D,
  Sprite2DMaterial,
  SpriteGroup,
  SortLayers,
  SpriteSheetLoader,
  type SpriteSheet,
  type RenderStats,
} from 'three-flatland/react'
import { DevtoolsProvider, usePane, usePaneFolder, usePaneInput } from '@three-flatland/devtools/react'
import { GemBackground } from './GemBackground'
import { GEM } from './gem'
import type { Pane } from 'tweakpane'

extend({ SpriteGroup, Sprite2D, Sprite2DMaterial })

const ASSET_BASE = './assets/'
const FRAME_NAMES = ['puff', 'wisp', 'spark', 'ring'] as const
const TINTS = ['#f4d35e', '#5ec8d8', '#e85f9c', '#9c6ade', '#5fd88f'] as const
const VIEW_SIZE = 900
// Extra world-space margin beyond the visible frustum before a drifting
// particle wraps to the opposite edge — keeps the wrap invisible.
const MARGIN = 220

type Mode = 'tight' | 'quad'

interface ParticleState {
  x: number
  y: number
  vx: number
  vy: number
  rot: number
  rotSpeed: number
  scale: number
  frameIndex: number
  tint: string
  alpha: number
}

function randomRange(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

function createParticle(halfW: number, halfH: number): ParticleState {
  return {
    x: randomRange(-halfW, halfW),
    y: randomRange(-halfH, halfH),
    vx: randomRange(-14, 14),
    vy: randomRange(-14, 14),
    rot: randomRange(0, Math.PI * 2),
    rotSpeed: randomRange(-0.5, 0.5),
    scale: randomRange(140, 300),
    frameIndex: Math.floor(Math.random() * FRAME_NAMES.length),
    tint: TINTS[Math.floor(Math.random() * TINTS.length)]!,
    alpha: randomRange(0.45, 0.85),
  }
}

/** Half-extents of the current viewport in world units, plus wrap margin. */
function halfExtents(): { halfW: number; halfH: number } {
  const aspect = window.innerWidth / window.innerHeight
  return {
    halfW: (VIEW_SIZE * Math.max(aspect, 1)) / 2 + MARGIN,
    halfH: VIEW_SIZE / 2 + MARGIN,
  }
}

/** Reads the just-rebuilt batch geometry — see main.ts's twin for why. */
function logVertexCounts(group: SpriteGroup, label: string): void {
  for (const batches of group.batches.values()) {
    for (const batch of batches) {
      const geom = batch.geometry
      const vertexCount = geom.attributes.position?.count ?? 4
      const indexCount = geom.index?.count ?? 0
      console.log(
        `[overdraw-bench] ${label}: geometry=${batch.geometryKind} ` +
          `verts=${vertexCount} indices=${indexCount} tris=${indexCount / 3} ` +
          `instances=${batch.activeCount}`
      )
    }
  }
}

function FitOrthoCamera({ viewSize }: { viewSize: number }) {
  const camera = useThree((s) => s.camera) as ThreeOrthographicCamera
  const size = useThree((s) => s.size)
  useLayoutEffect(() => {
    const aspect = size.width / size.height
    camera.left = (-viewSize * aspect) / 2
    camera.right = (viewSize * aspect) / 2
    camera.top = viewSize / 2
    camera.bottom = -viewSize / 2
    camera.updateProjectionMatrix()
  }, [camera, size, viewSize])
  return null
}

interface ParticleFieldProps {
  mode: Mode
  count: number
  paused: boolean
  meshSheet: SpriteSheet
  quadSheet: SpriteSheet
  materialTight: Sprite2DMaterial
  materialQuad: Sprite2DMaterial
  onStats: (mode: Mode, stats: RenderStats) => void
}

// Full teardown + recreate on mode/count change — the `key` on
// `<spriteGroup>` below forces it. `particlesRef` (the simulation state)
// survives the remount; only the render objects (and which
// material/sheet they point at) get rebuilt. This mirrors main.ts's
// explicit `group.clear()` + recreate, and sidesteps a real correctness
// risk: R3F's generic reconciler would apply a changed `material` prop
// as a plain `sprite.material = value` assignment, which does NOT run
// the ECS bookkeeping (`SpriteMaterialRef` update) batch reassignment
// needs — that path is a private method on Sprite2D.
function ParticleField({
  mode,
  count,
  paused,
  meshSheet,
  quadSheet,
  materialTight,
  materialQuad,
  onStats,
}: ParticleFieldProps) {
  const groupRef = useRef<SpriteGroup>(null)
  const spritesRef = useRef<(Sprite2D | null)[]>([])
  const particlesRef = useRef<ParticleState[]>([])
  const pendingLogRef = useRef(true)

  const particles = useMemo(() => {
    const { halfW, halfH } = halfExtents()
    const arr = Array.from({ length: count }, () => createParticle(halfW, halfH))
    particlesRef.current = arr
    spritesRef.current = new Array(count).fill(null)
    return arr
  }, [count])

  useEffect(() => {
    pendingLogRef.current = true
  }, [mode, count])

  const sheet = mode === 'tight' ? meshSheet : quadSheet
  const material = mode === 'tight' ? materialTight : materialQuad

  useFrame((_, delta) => {
    if (!paused) {
      const { halfW, halfH } = halfExtents()
      const arr = particlesRef.current
      const sprites = spritesRef.current
      for (let i = 0; i < arr.length; i++) {
        const p = arr[i]!
        p.x += p.vx * delta
        p.y += p.vy * delta
        p.rot += p.rotSpeed * delta
        if (p.x < -halfW) p.x = halfW
        else if (p.x > halfW) p.x = -halfW
        if (p.y < -halfH) p.y = halfH
        else if (p.y > halfH) p.y = -halfH
        const s = sprites[i]
        if (s) {
          s.position.set(p.x, p.y, 0)
          s.rotation.z = p.rot
        }
      }
    }

    if (groupRef.current) {
      onStats(mode, groupRef.current.stats)
      if (pendingLogRef.current) {
        pendingLogRef.current = false
        logVertexCounts(groupRef.current, mode)
      }
    }
  })

  return (
    <spriteGroup ref={groupRef} key={`${mode}-${count}`}>
      {particles.map((p, i) => (
        <sprite2D
          key={i}
          ref={(s: Sprite2D | null) => {
            spritesRef.current[i] = s
          }}
          material={material}
          frame={sheet.getFrame(FRAME_NAMES[p.frameIndex]!)}
          position={[p.x, p.y, 0]}
          rotation={[0, 0, p.rot]}
          scale={[p.scale, p.scale, 1]}
          sortLayer={SortLayers.EFFECTS}
          tint={p.tint}
          alpha={p.alpha}
        />
      ))}
    </spriteGroup>
  )
}

/**
 * Batching readout wired directly to Tweakpane (no React state): stats
 * arrive every frame from `ParticleField`'s useFrame, and routing them
 * through `useState` would re-render (and re-map all N particles in)
 * this component's own subtree 60x/sec — exactly the React overhead a
 * fragment-cost benchmark can't afford to fold into its own FPS number.
 */
function useStatsMonitor(pane: Pane) {
  const folder = usePaneFolder(pane, 'Batching')
  const statsRef = useRef({ mode: 'tight', particles: 0, batches: 0 })

  useEffect(() => {
    if (!folder) return
    folder.addBinding(statsRef.current, 'mode', { readonly: true })
    folder.addBinding(statsRef.current, 'particles', {
      readonly: true,
      format: (v: number) => v.toFixed(0),
    })
    folder.addBinding(statsRef.current, 'batches', {
      readonly: true,
      format: (v: number) => v.toFixed(0),
    })
  }, [folder])

  return useCallback(
    (mode: Mode, stats: RenderStats) => {
      statsRef.current.mode = mode
      statsRef.current.particles = stats.spriteCount
      statsRef.current.batches = stats.batchCount
      pane.refresh()
    },
    [pane]
  )
}

function Scene() {
  const { pane } = usePane()
  const folder = usePaneFolder(pane, 'Overdraw Bench', { expanded: true })
  const [mode] = usePaneInput<Mode>(folder, 'mode', 'tight', {
    options: { 'Tight Mesh': 'tight', 'Synth Quad': 'quad' },
  })
  const [count] = usePaneInput(folder, 'count', 1500, {
    options: {
      '500': 500,
      '1500': 1500,
      '3000': 3000,
      '6000': 6000,
      '20000': 20000,
      '40000': 40000,
      '60000': 60000,
    },
  })
  const [paused] = usePaneInput(folder, 'paused', false)

  const updateStats = useStatsMonitor(pane)

  // See generate-overdraw-particles.ts: particles.json carries per-frame
  // polygon meshes, particles-quad.json is the pixel-identical page
  // without them — loading it never registers atlas mesh data for its
  // texture, so its material resolves to the synth-quad path.
  const meshSheet = useLoader(SpriteSheetLoader, ASSET_BASE + 'particles.json', (loader) => {
    loader.preset = 'smooth'
  })
  const quadSheet = useLoader(SpriteSheetLoader, ASSET_BASE + 'particles-quad.json', (loader) => {
    loader.preset = 'smooth'
  })

  const materialTight = useMemo(
    () => new Sprite2DMaterial({ map: meshSheet.texture, transparent: true }),
    [meshSheet]
  )
  const materialQuad = useMemo(
    () => new Sprite2DMaterial({ map: quadSheet.texture, transparent: true }),
    [quadSheet]
  )

  return (
    <>
      <GemBackground gem={GEM} />
      <FitOrthoCamera viewSize={VIEW_SIZE} />
      <DevtoolsProvider name="overdraw-bench" />
      <ParticleField
        mode={mode}
        count={count}
        paused={paused}
        meshSheet={meshSheet}
        quadSheet={quadSheet}
        materialTight={materialTight}
        materialQuad={materialQuad}
        onStats={updateStats}
      />
    </>
  )
}

export default function App() {
  return (
    <Canvas
      orthographic
      dpr={[1, 2]}
      camera={{ position: [0, 0, 100], near: 0.1, far: 1000 }}
      renderer={{ antialias: false }}
    >
      <Scene />
    </Canvas>
  )
}
