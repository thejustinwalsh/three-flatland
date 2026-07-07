import { Suspense, useState, useRef, useCallback, useMemo, useLayoutEffect, useEffect } from 'react'
import { Canvas, extend, useFrame, useThree, useLoader } from '@react-three/fiber/webgpu'
import type { OrthographicCamera as ThreeOrthographicCamera } from 'three'
import {
  AnimatedSprite2D,
  Sprite2D,
  SpriteSheetLoader,
  SortLayers,
  type AnimationSetDefinition,
} from 'three-flatland/react'
import { usePane, DevtoolsProvider } from '@three-flatland/devtools/react'
import { Color, Vector3 } from 'three'
import type { ThreeEvent } from '@react-three/fiber/webgpu'
import { GemBackground } from './GemBackground'
import { GEM } from './gem'

// Register the sprite classes with R3F (tree-shakeable)
extend({ AnimatedSprite2D, Sprite2D })

// ---------------------------------------------------------------------------
// Orthographic camera — constant world units regardless of viewport, the
// canonical 2D framing used across the examples (mirrors animation/).
// ---------------------------------------------------------------------------

function OrthoCamera({ viewSize }: { viewSize: number }) {
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

// ---------------------------------------------------------------------------
// Loot layout — seeded so the React and Three.js examples share a layout.
// ---------------------------------------------------------------------------

const RARITIES = [
  { name: 'Common', color: 0xaaaaaa, css: '#aaaaaa', count: 4 },
  { name: 'Uncommon', color: 0x44dd66, css: '#44dd66', count: 3 },
  { name: 'Rare', color: 0x4488ff, css: '#4488ff', count: 2 },
  { name: 'Legendary', color: 0xffaa22, css: '#ffaa22', count: 1 },
] as const

type RarityName = (typeof RARITIES)[number]['name']

interface CoinSpec {
  id: number
  rarity: RarityName
  name: string
  color: number
  x: number
  y: number
  z: number
  fps: number
}

// Seeded PRNG — same seed/call-order as examples/three/hit-test so layouts match.
function mulberry32(seed: number) {
  let s = seed | 0
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function buildLootLayout(): CoinSpec[] {
  const rng = mulberry32(42)
  const coins: CoinSpec[] = []
  for (const rarity of RARITIES) {
    for (let i = 0; i < rarity.count; i++) {
      const index = coins.length
      const fps = 8 + rng() * 4
      const angle = (index / 14) * Math.PI * 2 + (rng() - 0.5) * 0.5
      const radius = 60 + rng() * 110
      coins.push({
        id: index,
        rarity: rarity.name,
        name: `${rarity.name} Coin`,
        color: rarity.color,
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
        z: index * 0.01,
        fps,
      })
    }
  }
  return coins
}

// A fresh random coin — used by the periodic spawner. Unlike buildLootLayout
// (seeded, for the deterministic starting set) this is genuinely random.
function randomCoin(id: number): CoinSpec {
  const rarity = RARITIES[Math.floor(Math.random() * RARITIES.length)]!
  const angle = Math.random() * Math.PI * 2
  const radius = 60 + Math.random() * 110
  return {
    id,
    rarity: rarity.name,
    name: `${rarity.name} Coin`,
    color: rarity.color,
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius,
    z: 0.5,
    fps: 8 + Math.random() * 4,
  }
}

const SPAWN_INTERVAL_MS = 3000
// Cap live coins so an idle session doesn't grow the scene without bound.
const MAX_LIVE_COINS = 24

const KNIGHT_SCALE = 96
const COIN_SCALE = 48
const KNIGHT_SPEED = 140
const PICKUP_RANGE = 50

const coinAnims = (fps: number): AnimationSetDefinition => ({
  fps: 10,
  animations: {
    spin: { frames: Array.from({ length: 12 }, (_, i) => `coin_${i}`), fps, loop: true },
  },
})

// ---------------------------------------------------------------------------
// Knight — walks toward the active target; collects the pending coin on arrival.
// ---------------------------------------------------------------------------

const knightAnims: AnimationSetDefinition = {
  fps: 10,
  animations: {
    idle: { frames: ['idle_0', 'idle_1', 'idle_2', 'idle_3'], fps: 8, loop: true },
    run: {
      frames: Array.from({ length: 16 }, (_, i) => `run_${i}`),
      fps: 12,
      loop: true,
    },
    // Tumble — played while the knight is being dragged.
    roll: {
      frames: Array.from({ length: 8 }, (_, i) => `roll_${i}`),
      fps: 15,
      loop: true,
    },
  },
}

interface KnightProps {
  target: { x: number; y: number } | null
  pendingCoinId: number | null
  onReachCoin: (id: number) => void
  onDragStart: () => void
}

function Knight({ target, pendingCoinId, onReachCoin, onDragStart }: KnightProps) {
  const ref = useRef<AnimatedSprite2D>(null)
  const sheet = useLoader(SpriteSheetLoader, './sprites/knight.json')
  const anim = useRef<'idle' | 'run' | 'roll'>('idle')
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)

  // Read the latest walk target/pending in useFrame without re-subscribing.
  const targetRef = useRef(target)
  targetRef.current = target
  const pendingRef = useRef(pendingCoinId)
  pendingRef.current = pendingCoinId
  // While dragging, the pointer drives the position and the walk logic pauses.
  const dragging = useRef(false)

  const play = useCallback((name: 'idle' | 'run' | 'roll') => {
    const k = ref.current
    if (k && anim.current !== name) {
      k.play(name)
      anim.current = name
    }
  }, [])

  // Unproject a DOM point to world XY on the knight's z-plane.
  const toWorld = useCallback(
    (clientX: number, clientY: number) => {
      const rect = gl.domElement.getBoundingClientRect()
      const v = new Vector3(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1,
        0
      )
      v.unproject(camera)
      return v
    },
    [camera, gl]
  )

  useFrame((_, delta) => {
    const knight = ref.current
    if (!knight) return
    knight.update(delta * 1000)
    if (dragging.current) return // pointer listeners own the position while dragging

    const t = targetRef.current
    if (!t) {
      play('idle')
      return
    }

    const dx = t.x - knight.position.x
    const dy = t.y - knight.position.y
    const dist = Math.hypot(dx, dy)

    // Arrived at a coin (within pickup range) — collect it.
    if (pendingRef.current !== null && dist < PICKUP_RANGE) {
      onReachCoin(pendingRef.current)
      return
    }

    // Arrived at a ground target — stop and idle.
    if (dist < 2) {
      play('idle')
      return
    }

    play('run')
    const step = Math.min(KNIGHT_SPEED * delta, dist)
    knight.position.x += (dx / dist) * step
    knight.position.y += (dy / dist) * step
    // Face the direction of travel via flipX (a UV flip). Negating scale.x
    // would reverse the quad's winding and the FrontSide material culls it —
    // the knight vanishes whenever it faces left. Only flip on real
    // horizontal travel so walking straight up/down keeps the last facing.
    if (Math.abs(dx) > 0.5) knight.flipX = dx < 0
  })

  // Drag-and-drop: grab the knight and fling him around — he tumbles (roll)
  // while held and drops to idle on release. Canvas-level listeners with
  // pointer capture keep the drag alive even when the cursor outruns the
  // sprite (an object-only onPointerMove would drop the moment you leave it).
  const handlePointerDown = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation()
      onDragStart() // cancel any walk-to target
      dragging.current = true
      play('roll')
      document.body.style.cursor = 'grabbing'

      const el = gl.domElement
      // Capture keeps moves flowing when the cursor outruns the sprite; it can
      // throw on synthetic/non-active pointers, so never let it abort the drag.
      try {
        el.setPointerCapture(e.pointerId)
      } catch {
        /* ignore — listeners below still drive the drag */
      }

      const onMove = (ev: PointerEvent) => {
        const knight = ref.current
        if (!knight) return
        const w = toWorld(ev.clientX, ev.clientY)
        const dx = w.x - knight.position.x
        if (Math.abs(dx) > 0.5) knight.flipX = dx < 0
        knight.position.set(w.x, w.y, 1)
      }
      const onUp = () => {
        dragging.current = false
        play('idle')
        document.body.style.cursor = 'grab'
        try {
          el.releasePointerCapture?.(e.pointerId)
        } catch {
          /* ignore */
        }
        el.removeEventListener('pointermove', onMove)
        el.removeEventListener('pointerup', onUp)
      }
      el.addEventListener('pointermove', onMove)
      el.addEventListener('pointerup', onUp)
    },
    [gl, onDragStart, play, toWorld]
  )

  return (
    <animatedSprite2D
      ref={ref}
      spriteSheet={sheet}
      animationSet={knightAnims}
      animation="idle"
      anchor={[0.5, 0.5]}
      scale={[KNIGHT_SCALE, KNIGHT_SCALE, 1]}
      position={[0, 0, 1]}
      sortLayer={SortLayers.ENTITIES}
      // hitTestMode="bounds" — the full quad is grabbable for drag-and-drop.
      hitTestMode="bounds"
      onPointerDown={handlePointerDown}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation()
        if (!dragging.current) document.body.style.cursor = 'grab'
      }}
      onPointerOut={() => {
        if (!dragging.current) document.body.style.cursor = 'default'
      }}
    />
  )
}

// ---------------------------------------------------------------------------
// Coin — declarative R3F pointer events: hover highlights, click walks-to-collect.
// Animates a spin; plays a shrink-and-float on collect before unmounting.
// ---------------------------------------------------------------------------

interface CoinProps {
  spec: CoinSpec
  collecting: boolean
  onClick: (spec: CoinSpec) => void
  onCollected: (id: number) => void
}

function Coin({ spec, collecting, onClick, onCollected }: CoinProps) {
  const ref = useRef<AnimatedSprite2D>(null)
  const sheet = useLoader(SpriteSheetLoader, './sprites/coin.json')
  const animSet = useMemo(() => coinAnims(spec.fps), [spec.fps])

  const [hovered, setHovered] = useState(false)
  const hoveredRef = useRef(false)
  hoveredRef.current = hovered

  // Stable color objects — mutated in useFrame, never recreated.
  const baseTint = useMemo(() => new Color(spec.color), [spec.color])
  // The coin atlas is neutral grayscale, so `tint` reproduces the rarity color
  // exactly (highlights hit the pure hue, matching the HUD legend). Hover keeps
  // the SAME hue, just brighter — a small multiply, NOT a lerp toward white,
  // which would desaturate and drop the rarity identity.
  const hoverTint = useMemo(() => new Color(spec.color).multiplyScalar(1.4), [spec.color])
  const tint = useRef(new Color(spec.color))
  const shrink = useRef(0)
  // One-shot gate: `onCollected` schedules a parent re-render that unmounts us,
  // but the next frame can re-enter this branch before React commits. Dispatch
  // exactly once per collect so we never fire duplicate collection events.
  const collectedRef = useRef(false)

  useFrame((_, delta) => {
    const coin = ref.current
    if (!coin) return
    coin.update(delta * 1000)

    if (collecting) {
      // Shrink and float up, then report done so the parent can unmount us.
      shrink.current = Math.min(shrink.current + delta * 4, 1)
      const s = (1 - shrink.current) * COIN_SCALE
      coin.scale.set(s, s, 1)
      coin.position.y += delta * 40
      coin.tint = hoverTint
      if (shrink.current >= 1 && !collectedRef.current) {
        collectedRef.current = true
        onCollected(spec.id)
      }
      return
    }

    // Ease tint toward base/hover and bump scale on hover.
    const target = hoveredRef.current ? hoverTint : baseTint
    const c = tint.current
    const k = Math.min(delta * 12, 1)
    c.r += (target.r - c.r) * k
    c.g += (target.g - c.g) * k
    c.b += (target.b - c.b) * k
    coin.tint = c
    const want = hoveredRef.current ? COIN_SCALE * 1.2 : COIN_SCALE
    const cur = coin.scale.x
    coin.scale.setScalar(cur + (want - cur) * k)
    coin.scale.z = 1
  })

  const handleOver = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation()
      if (collecting) return
      setHovered(true)
      document.body.style.cursor = 'pointer'
    },
    [collecting]
  )

  const handleOut = useCallback(() => {
    setHovered(false)
    document.body.style.cursor = 'default'
  }, [])

  const handleClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation()
      if (collecting) return
      onClick(spec)
    },
    [collecting, onClick, spec]
  )

  return (
    <animatedSprite2D
      ref={ref}
      spriteSheet={sheet}
      animationSet={animSet}
      animation="spin"
      anchor={[0.5, 0.5]}
      scale={[COIN_SCALE, COIN_SCALE, 1]}
      position={[spec.x, spec.y, spec.z]}
      sortLayer={SortLayers.ENTITIES}
      tint={`#${spec.color.toString(16).padStart(6, '0')}`}
      // hitTestMode left at the default 'radius' — the inscribed circle is the
      // natural pickable surface for a round coin.
      onPointerOver={handleOver}
      onPointerOut={handleOut}
      onClick={handleClick}
    />
  )
}

// ---------------------------------------------------------------------------
// Ground — catches clicks the coins don't consume, to walk the knight.
// ---------------------------------------------------------------------------

function Ground({ onWalk }: { onWalk: (x: number, y: number) => void }) {
  const { viewport } = useThree()
  return (
    <sprite2D
      anchor={[0.5, 0.5]}
      scale={[viewport.width, viewport.height, 1]}
      position={[0, 0, -1]}
      sortLayer={SortLayers.BACKGROUND}
      // Invisible (alpha 0) so the gem GemBackground shows through — we only
      // need the quad as a click target, not as a visible surface. The
      // geometry is still pickable: raycast is unaffected by alpha.
      alpha={0}
      // hitTestMode="bounds" — full-quad hit surface, no inscribed circle.
      hitTestMode="bounds"
      onClick={(e: ThreeEvent<MouseEvent>) => {
        onWalk(e.point.x, e.point.y)
      }}
    />
  )
}

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------

function Scene({ onCounts }: { onCounts: (counts: Record<RarityName, number>) => void }) {
  const initial = useMemo(buildLootLayout, [])
  // The coin set grows over time as the spawner adds coins.
  const [coins, setCoins] = useState<CoinSpec[]>(() => initial)
  const nextId = useRef(initial.length)
  const [target, setTarget] = useState<{ x: number; y: number } | null>(null)
  const [pendingCoinId, setPendingCoinId] = useState<number | null>(null)
  // alive: pickable + visible. collecting: playing the shrink-out.
  const [alive, setAlive] = useState<Set<number>>(() => new Set(initial.map((c) => c.id)))
  const [collecting, setCollecting] = useState<Set<number>>(() => new Set())
  const [counts, setCounts] = useState<Record<RarityName, number>>({
    Common: 0,
    Uncommon: 0,
    Rare: 0,
    Legendary: 0,
  })

  const byId = useMemo(() => new Map(coins.map((c) => [c.id, c])), [coins])

  // Live coin count, read by the spawner without re-subscribing the interval.
  const liveCount = alive.size + collecting.size
  const liveCountRef = useRef(liveCount)
  liveCountRef.current = liveCount

  // Periodically drop a fresh random coin onto the map (up to the cap).
  useEffect(() => {
    const t = setInterval(() => {
      if (liveCountRef.current >= MAX_LIVE_COINS) return
      const id = nextId.current++
      setCoins((prev) => [...prev, randomCoin(id)])
      setAlive((prev) => new Set(prev).add(id))
    }, SPAWN_INTERVAL_MS)
    return () => clearInterval(t)
  }, [])

  const walkToGround = useCallback((x: number, y: number) => {
    setPendingCoinId(null)
    setTarget({ x, y })
  }, [])

  const walkToCoin = useCallback((spec: CoinSpec) => {
    setPendingCoinId(spec.id)
    setTarget({ x: spec.x, y: spec.y })
  }, [])

  // Grabbing the knight cancels any walk-to so the drag takes over cleanly.
  const cancelWalk = useCallback(() => {
    setPendingCoinId(null)
    setTarget(null)
  }, [])

  // Knight reached the pending coin → start its collect (shrink) animation.
  const reachCoin = useCallback(
    (id: number) => {
      setPendingCoinId(null)
      setTarget(null)
      setCollecting((prev) => {
        if (prev.has(id)) return prev
        const next = new Set(prev)
        next.add(id)
        return next
      })
      setAlive((prev) => {
        if (!prev.has(id)) return prev
        const next = new Set(prev)
        next.delete(id)
        return next
      })
      const spec = byId.get(id)
      if (spec) setCounts((c) => ({ ...c, [spec.rarity]: c[spec.rarity] + 1 }))
      document.body.style.cursor = 'default'
    },
    [byId]
  )

  // Shrink-out finished → remove the coin entirely.
  const removeCoin = useCallback((id: number) => {
    setCollecting((prev) => {
      if (!prev.has(id)) return prev
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }, [])

  // Mirror collect counts up to the DOM HUD (rendered outside the Canvas).
  useEffect(() => onCounts(counts), [counts, onCounts])

  // Devtools pane — default stats only; this example exposes no custom controls.
  usePane()

  const visible = coins.filter((c) => alive.has(c.id) || collecting.has(c.id))

  return (
    <>
      <GemBackground gem={GEM} />
      <OrthoCamera viewSize={400} />
      {/* The pane (above) must stay mounted while assets load, so the
          suspending loaders live below an inner Suspense. */}
      <Suspense fallback={null}>
        <Ground onWalk={walkToGround} />
        <Knight
          target={target}
          pendingCoinId={pendingCoinId}
          onReachCoin={reachCoin}
          onDragStart={cancelWalk}
        />
        {visible.map((spec) => (
          <Coin
            key={spec.id}
            spec={spec}
            collecting={collecting.has(spec.id)}
            onClick={walkToCoin}
            onCollected={removeCoin}
          />
        ))}
      </Suspense>
    </>
  )
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

const RARITY_CSS: Record<RarityName, string> = {
  Common: '#aaaaaa',
  Uncommon: '#44dd66',
  Rare: '#4488ff',
  Legendary: '#ffaa22',
}

export default function App() {
  const [counts, setCounts] = useState<Record<RarityName, number>>({
    Common: 0,
    Uncommon: 0,
    Rare: 0,
    Legendary: 0,
  })

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <Canvas
        orthographic
        dpr={1}
        camera={{ position: [0, 0, 100], near: 0.1, far: 1000 }}
        renderer={{ antialias: false }}
        onCreated={({ gl }) => {
          gl.domElement.style.imageRendering = 'pixelated'
        }}
      >
        <DevtoolsProvider name="hit-test" />
        <Scene onCounts={setCounts} />
      </Canvas>

      {/* Collected-loot HUD */}
      <div
        style={{
          position: 'fixed',
          bottom: 12,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 100,
          padding: '8px 16px',
          background: 'rgba(0,2,28,0.85)',
          borderRadius: 8,
          fontFamily: 'monospace',
          fontSize: 13,
          display: 'flex',
          gap: 12,
          pointerEvents: 'none',
        }}
      >
        {(Object.keys(RARITY_CSS) as RarityName[]).map((r) => (
          <span key={r} style={{ color: RARITY_CSS[r] }}>
            {r}: {counts[r]}
          </span>
        ))}
      </div>
    </div>
  )
}
