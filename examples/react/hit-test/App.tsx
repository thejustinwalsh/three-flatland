import { Suspense, useState, useRef, useCallback } from 'react'
import { Canvas, extend, useFrame, useLoader, useThree } from '@react-three/fiber/webgpu'
import {
  AnimatedSprite2D,
  Sprite2D,
  SpriteSheetLoader,
  Layers,
  type AnimationSetDefinition,
} from 'three-flatland/react'
import { usePane, usePaneFolder, usePaneButton } from '@three-flatland/devtools/react'
import { Color } from 'three'
import type { ThreeEvent } from '@react-three/fiber/webgpu'

// Register both sprite classes with R3F (tree-shakeable)
extend({ AnimatedSprite2D, Sprite2D })

// ---------------------------------------------------------------------------
// Knight animation definition
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
  },
}

// ---------------------------------------------------------------------------
// Knight
// ---------------------------------------------------------------------------

interface KnightProps {
  target: [number, number]
}

function Knight({ target }: KnightProps) {
  const ref = useRef<AnimatedSprite2D>(null)
  const sheet = useLoader(SpriteSheetLoader, './sprites/knight.json')
  const posRef = useRef<[number, number]>([0, 0])
  const animRef = useRef<'idle' | 'run'>('idle')
  // Track target in a ref so useFrame reads the latest without re-subscribing
  const targetRef = useRef(target)
  targetRef.current = target

  useFrame((_, delta) => {
    const sprite = ref.current
    if (!sprite) return

    sprite.update(delta * 1000)

    const [tx, ty] = targetRef.current
    const [px, py] = posRef.current
    const dx = tx - px
    const dy = ty - py
    const dist = Math.sqrt(dx * dx + dy * dy)

    if (dist > 2) {
      const speed = 120
      const step = Math.min(speed * delta, dist)
      const nx = px + (dx / dist) * step
      const ny = py + (dy / dist) * step
      posRef.current = [nx, ny]
      sprite.position.set(nx, ny, 1)

      // Flip to face direction of travel
      const sx = Math.abs(sprite.scale.x)
      sprite.scale.x = dx < 0 ? -sx : sx

      if (animRef.current !== 'run') {
        sprite.play('run')
        animRef.current = 'run'
      }
    } else {
      if (animRef.current !== 'idle') {
        sprite.play('idle')
        animRef.current = 'idle'
      }
    }
  })

  return (
    <animatedSprite2D
      ref={ref}
      spriteSheet={sheet}
      animationSet={knightAnims}
      animation="idle"
      anchor={[0.5, 0.5]}
      scale={[96, 96, 1]}
      position={[0, 0, 1]}
      layer={Layers.ENTITIES}
      // hitTestMode="none" so the knight never intercepts pointer events —
      // clicks on the ground pass straight through it to Ground below.
      hitTestMode="none"
    />
  )
}

// ---------------------------------------------------------------------------
// Coin
// ---------------------------------------------------------------------------

interface CoinProps {
  id: number
  position: [number, number, number]
  onCollect: (id: number) => void
}

function Coin({ id, position, onCollect }: CoinProps) {
  const ref = useRef<Sprite2D>(null)
  const sheet = useLoader(SpriteSheetLoader, './sprites/coin.json')
  const [hovered, setHovered] = useState(false)
  const hoveredRef = useRef(false)
  hoveredRef.current = hovered

  // Stable tint color objects — mutated in useFrame, never recreated
  const normalTint = useRef(new Color(1, 0.85, 0.2))
  const hoverTint = useRef(new Color(1, 1, 1))
  const currentTint = useRef(new Color(1, 0.85, 0.2))

  useFrame((_, delta) => {
    const sprite = ref.current
    if (!sprite) return
    const target = hoveredRef.current ? hoverTint.current : normalTint.current
    const c = currentTint.current
    const t = Math.min(delta * 12, 1)
    c.r += (target.r - c.r) * t
    c.g += (target.g - c.g) * t
    c.b += (target.b - c.b) * t
    sprite.tint = c
  })

  const handlePointerOver = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    setHovered(true)
    document.body.style.cursor = 'pointer'
  }, [])

  const handlePointerOut = useCallback(() => {
    setHovered(false)
    document.body.style.cursor = 'default'
  }, [])

  const handleClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation()
      document.body.style.cursor = 'default'
      onCollect(id)
    },
    [id, onCollect]
  )

  // First frame from the coin sheet — "coin_0"
  const frame = sheet.getFrame('coin_0')

  return (
    <sprite2D
      ref={ref}
      texture={sheet.texture}
      frame={frame}
      anchor={[0.5, 0.5]}
      scale={[48, 48, 1]}
      position={position}
      layer={Layers.ENTITIES}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
      onClick={handleClick}
    />
  )
}

// ---------------------------------------------------------------------------
// Ground — catches clicks the coins don't consume
// ---------------------------------------------------------------------------

interface GroundProps {
  onWalk: (x: number, y: number) => void
}

function Ground({ onWalk }: GroundProps) {
  const { viewport } = useThree()
  return (
    <sprite2D
      anchor={[0.5, 0.5]}
      scale={[viewport.width, viewport.height, 1]}
      position={[0, 0, -1]}
      layer={Layers.BACKGROUND}
      tint="#1a1a2e"
      // hitTestMode="bounds" — full-quad hit surface, no radius inscribed circle.
      // Coins stopPropagation on their clicks so only missed clicks reach here.
      hitTestMode="bounds"
      onClick={(e: ThreeEvent<MouseEvent>) => {
        onWalk(e.point.x, e.point.y)
      }}
    />
  )
}

// ---------------------------------------------------------------------------
// Scene — suspense boundary lives inside Canvas
// ---------------------------------------------------------------------------

const COIN_POSITIONS: [number, number, number][] = [
  [-160, 80, 0],
  [0, 120, 0],
  [160, 80, 0],
  [-100, -80, 0],
  [100, -80, 0],
]

function Scene() {
  const [target, setTarget] = useState<[number, number]>([0, 0])
  const [coins, setCoins] = useState(() => COIN_POSITIONS.map((pos, i) => ({ id: i, pos })))

  const handleWalk = useCallback((x: number, y: number) => {
    setTarget([x, y])
  }, [])

  const handleCollect = useCallback((id: number) => {
    setCoins((prev) => prev.filter((c) => c.id !== id))
  }, [])

  // Devtools pane (every example mounts exactly one Tweakpane root).
  const { pane } = usePane()
  const folder = usePaneFolder(pane, 'Hit Testing')
  usePaneButton(folder, 'Respawn coins', () => {
    setCoins(COIN_POSITIONS.map((pos, i) => ({ id: i, pos })))
  })

  // usePane (above) must stay mounted while assets load, so the suspending
  // loaders live below an inner Suspense — not an outer one that would
  // unmount the pane (the "usePane leak under StrictMode + Suspense" guard).
  return (
    <Suspense fallback={null}>
      <Ground onWalk={handleWalk} />
      <Knight target={target} />
      {coins.map((c) => (
        <Coin key={c.id} id={c.id} position={c.pos} onCollect={handleCollect} />
      ))}
    </Suspense>
  )
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

export default function App() {
  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <Canvas
        orthographic
        camera={{ zoom: 5, position: [0, 0, 100] }}
        renderer={{ antialias: true }}
      >
        <Scene />
      </Canvas>
      <div
        style={{
          position: 'fixed',
          bottom: 12,
          left: 12,
          zIndex: 100,
          padding: '8px 12px',
          background: 'rgba(0,2,28,0.85)',
          borderRadius: 8,
          fontFamily: 'monospace',
          color: '#f0edd8',
          fontSize: 13,
          pointerEvents: 'none',
        }}
      >
        Click ground to walk · Hover coins to highlight · Click coins to collect
      </div>
    </div>
  )
}
