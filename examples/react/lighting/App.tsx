import { Suspense, useState, useRef, useEffect, useCallback } from 'react'
import { Canvas, extend, useFrame, useThree, useLoader } from '@react-three/fiber/webgpu'
import type { WebGPURenderer } from 'three/webgpu'
import {
  DataTexture,
  NearestFilter,
  RGBAFormat,
  UnsignedByteType,
  Vector2,
} from 'three'
import {
  Flatland,
  Light2D,
  Sprite2D,
  SpriteSheetLoader,
  Layers,
  attachLighting,
  attachEffect,
  type SpriteSheet,
} from 'three-flatland/react'
import { DefaultLightEffect, DirectLightEffect, SimpleLightEffect, AutoNormalProvider } from '@three-flatland/presets'
import '@three-flatland/presets/react'

import '@awesome.me/webawesome/dist/styles/themes/default.css'
import WaRadioGroup from '@awesome.me/webawesome/dist/react/radio-group/index.js'
import WaRadio from '@awesome.me/webawesome/dist/react/radio/index.js'
import WaSwitch from '@awesome.me/webawesome/dist/react/switch/index.js'

// Register with R3F
extend({ Flatland, Sprite2D, Light2D, DefaultLightEffect, DirectLightEffect, SimpleLightEffect, AutoNormalProvider })

const VIEW_SIZE = 300
const INDICATOR_SIZE = 24

// Sprite positions
const spritePositions: [number, number][] = [
  [-60, -20],
  [0, -20],
  [60, -20],
]

// Animation definitions
const animations = {
  idle: {
    frames: ['idle_0', 'idle_1', 'idle_2', 'idle_3'],
    fps: 8,
  },
}

// Create a simple circle DataTexture for light indicators
function createCircleTexture(r: number, g: number, b: number, size = 32): DataTexture {
  const data = new Uint8Array(size * size * 4)
  const center = size / 2
  const radius = size / 2 - 1
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - center + 0.5
      const dy = y - center + 0.5
      const dist = Math.sqrt(dx * dx + dy * dy)
      const i = (y * size + x) * 4
      data[i] = r
      data[i + 1] = g
      data[i + 2] = b
      // Soft edge
      const alpha = dist < radius - 1 ? 255 : dist < radius ? Math.round((radius - dist) * 255) : 0
      data[i + 3] = alpha
    }
  }
  const tex = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType)
  tex.minFilter = NearestFilter
  tex.magFilter = NearestFilter
  tex.needsUpdate = true
  return tex
}

// Pre-create indicator textures
const torch1Tex = createCircleTexture(255, 102, 0)   // 0xff6600
const torch2Tex = createCircleTexture(255, 170, 0)   // 0xffaa00

interface LitSpriteProps {
  spriteSheet: SpriteSheet
  position: [number, number]
}

function LitSprite({ spriteSheet, position }: LitSpriteProps) {
  const spriteRef = useRef<Sprite2D>(null)
  const animStateRef = useRef({
    frameIndex: 0,
    timer: 0,
  })

  // Animate sprite (update phase — runs before render phase)
  useFrame((_, delta) => {
    const sprite = spriteRef.current
    if (!sprite) return

    const state = animStateRef.current
    const anim = animations.idle

    state.timer += delta * 1000
    const frameDuration = 1000 / anim.fps

    if (state.timer >= frameDuration) {
      state.timer -= frameDuration
      state.frameIndex = (state.frameIndex + 1) % anim.frames.length
    }

    sprite.setFrame(spriteSheet.getFrame(anim.frames[state.frameIndex]))
  })

  return (
    <sprite2D
      ref={spriteRef}
      texture={spriteSheet.texture}
      frame={spriteSheet.getFrame('idle_0')}
      position={[position[0], position[1], 0]}
      scale={[64, 64, 1]}
    >
      <autoNormalProvider attach={attachEffect} />
    </sprite2D>
  )
}

// Screen-to-world conversion for Flatland's orthographic view
function screenToWorld(
  clientX: number,
  clientY: number,
  canvas: HTMLCanvasElement,
): Vector2 {
  const rect = canvas.getBoundingClientRect()
  const nx = ((clientX - rect.left) / rect.width) * 2 - 1
  const ny = -((clientY - rect.top) / rect.height) * 2 + 1
  const aspect = rect.width / rect.height
  return new Vector2(
    (nx * VIEW_SIZE * aspect) / 2,
    (ny * VIEW_SIZE) / 2,
  )
}

interface LightDragState {
  index: number // which light (0 = torch1, 1 = torch2)
  offset: Vector2 // grab offset from light center
  pointerId: number
}

// ─── Stats Tracker ──────────────────────────────────────────────────────────

function StatsTracker({ onStats }: { onStats: (fps: number, draws: number) => void }) {
  const gl = useThree((s) => s.gl)
  const frameCount = useRef(0)
  const elapsed = useRef(0)
  useFrame((_, delta) => {
    frameCount.current++
    elapsed.current += delta
    if (elapsed.current >= 1) {
      const draws = (gl.info.render as any).drawCalls as number
      onStats(Math.round(frameCount.current / elapsed.current), draws)
      frameCount.current = 0
      elapsed.current = 0
    }
  })
  return null
}

// ─── Flatland Scene ─────────────────────────────────────────────────────────

interface FlatlandSceneProps {
  mode: LightingMode
  light1Enabled: boolean
  light2Enabled: boolean
}

function FlatlandScene({ mode, light1Enabled, light2Enabled }: FlatlandSceneProps) {
  const spriteSheet = useLoader(SpriteSheetLoader, './sprites/knight.json')
  const { renderer, size } = useThree()
  const flatlandRef = useRef<Flatland>(null)

  // Light state
  const [light1Pos, setLight1Pos] = useState(new Vector2(-80, 50))
  const [light2Pos, setLight2Pos] = useState(new Vector2(80, 50))

  // Refs for drag logic (avoid stale closures)
  const light1PosRef = useRef(light1Pos)
  const light2PosRef = useRef(light2Pos)
  light1PosRef.current = light1Pos
  light2PosRef.current = light2Pos

  // Flicker timer
  const flickerTimer = useRef(0)

  // Light2D refs for direct property access
  const torch1Ref = useRef<Light2D>(null)
  const torch2Ref = useRef<Light2D>(null)

  // Indicator sprite refs
  const indicator1Ref = useRef<Sprite2D>(null)
  const indicator2Ref = useRef<Sprite2D>(null)

  // Drag state
  const dragRef = useRef<LightDragState | null>(null)

  // Handle resize
  useEffect(() => {
    flatlandRef.current?.resize(size.width, size.height)
  }, [size.width, size.height])

  // Pointer drag for light indicators (touch + mouse)
  useEffect(() => {
    const canvas = renderer.domElement
    canvas.style.touchAction = 'none'

    const lightPositions = () => [light1PosRef.current, light2PosRef.current]
    const setters = [setLight1Pos, setLight2Pos]

    const onPointerDown = (e: PointerEvent) => {
      const wp = screenToWorld(e.clientX, e.clientY, canvas)
      const positions = lightPositions()
      for (let i = 0; i < positions.length; i++) {
        if (wp.distanceTo(positions[i]) < INDICATOR_SIZE) {
          dragRef.current = {
            index: i,
            offset: positions[i].clone().sub(wp),
            pointerId: e.pointerId,
          }
          canvas.style.cursor = 'grabbing'
          canvas.setPointerCapture(e.pointerId)
          return
        }
      }
    }

    const onPointerMove = (e: PointerEvent) => {
      const wp = screenToWorld(e.clientX, e.clientY, canvas)
      if (dragRef.current) {
        const newPos = wp.clone().add(dragRef.current.offset)
        setters[dragRef.current.index](newPos)
      } else {
        // Hover cursor
        const positions = lightPositions()
        let hovering = false
        for (const pos of positions) {
          if (wp.distanceTo(pos) < INDICATOR_SIZE) {
            hovering = true
            break
          }
        }
        canvas.style.cursor = hovering ? 'grab' : 'default'
      }
    }

    const onPointerUp = (e: PointerEvent) => {
      if (dragRef.current) {
        canvas.releasePointerCapture(e.pointerId)
        dragRef.current = null
        canvas.style.cursor = 'default'
      }
    }

    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerup', onPointerUp)
    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onPointerUp)
    }
  }, [renderer])

  // Update lights + indicators (runs in default update phase, before render)
  useFrame((_, delta) => {
    // Update light positions from React state
    if (torch1Ref.current) {
      torch1Ref.current.position.set(light1Pos.x, light1Pos.y, 0)
      torch1Ref.current.enabled = light1Enabled
    }
    if (torch2Ref.current) {
      torch2Ref.current.position.set(light2Pos.x, light2Pos.y, 0)
      torch2Ref.current.enabled = light2Enabled
    }

    // Update indicator positions
    if (indicator1Ref.current) {
      indicator1Ref.current.position.set(light1Pos.x, light1Pos.y, 0)
      indicator1Ref.current.alpha = light1Enabled ? 0.8 : 0.3
    }
    if (indicator2Ref.current) {
      indicator2Ref.current.position.set(light2Pos.x, light2Pos.y, 0)
      indicator2Ref.current.alpha = light2Enabled ? 0.8 : 0.3
    }

    // Update flicker — light intensity + indicator tint pulse
    flickerTimer.current += delta
    const t = flickerTimer.current

    if (light1Enabled) {
      const f1 = 1 + Math.sin(t * 15) * 0.1 + Math.sin(t * 23) * 0.05
      if (torch1Ref.current) torch1Ref.current.intensity = 1.2 * f1
      if (indicator1Ref.current) indicator1Ref.current.tint = [f1, f1, f1]
    }
    if (light2Enabled) {
      const f2 = 1 + Math.sin(t * 17 + 1) * 0.1 + Math.sin(t * 19 + 2) * 0.05
      if (torch2Ref.current) torch2Ref.current.intensity = 1.0 * f2
      if (indicator2Ref.current) indicator2Ref.current.tint = [f2, f2, f2]
    }
  })

  // Render phase — replaces R3F's auto-render so Flatland controls the pipeline
  useFrame(() => {
    flatlandRef.current?.render(renderer as unknown as WebGPURenderer)
  }, { phase: 'render' })

  return (
    <flatland
      ref={flatlandRef}
      viewSize={VIEW_SIZE}
      clearColor={0x0a0a12}
    >
      {/* Lighting effect — toggle between presets */}
      {mode === 'direct'
        ? <directLightEffect attach={attachLighting} />
        : mode === 'simple'
          ? <simpleLightEffect attach={attachLighting} />
          : <defaultLightEffect attach={attachLighting} />
      }

      {/* Lights — Light2D instances managed by Flatland */}
      <light2D
        ref={torch1Ref}
        lightType="point"
        position={[light1Pos.x, light1Pos.y, 0]}
        color={0xff6600}
        intensity={1.2}
        distance={150}
        decay={2}
      />
      <light2D
        ref={torch2Ref}
        lightType="point"
        position={[light2Pos.x, light2Pos.y, 0]}
        color={0xffaa00}
        intensity={1.0}
        distance={150}
        decay={2}
      />
      <light2D
        lightType="ambient"
        color={0x111122}
        intensity={0.15}
      />

      {/* Light indicator sprites — lit={false} so they always show at full brightness */}
      <sprite2D
        ref={indicator1Ref}
        texture={torch1Tex}
        position={[light1Pos.x, light1Pos.y, 0]}
        scale={[INDICATOR_SIZE, INDICATOR_SIZE, 1]}
        layer={Layers.FOREGROUND}
        alpha={light1Enabled ? 0.8 : 0.3}
        lit={false}
      />
      <sprite2D
        ref={indicator2Ref}
        texture={torch2Tex}
        position={[light2Pos.x, light2Pos.y, 0]}
        scale={[INDICATOR_SIZE, INDICATOR_SIZE, 1]}
        layer={Layers.FOREGROUND}
        alpha={light2Enabled ? 0.8 : 0.3}
        lit={false}
      />

      {/* Lit sprites — lit prop enables per-fragment lighting */}
      {spritePositions.map((pos, i) => (
        <LitSprite
          key={i}
          spriteSheet={spriteSheet}
          position={pos}
        />
      ))}
    </flatland>
  )
}

// ─── Mode Options ──────────────────────────────────────────────────────────

type LightingMode = 'default' | 'direct' | 'simple'

const MODE_OPTIONS = [
  { value: 'default', label: 'Default' },
  { value: 'direct', label: 'Direct' },
  { value: 'simple', label: 'Simple' },
] as const

// ─── App ────────────────────────────────────────────────────────────────────

export default function App() {
  const [mode, setMode] = useState<LightingMode>('default')
  const [light1Enabled, setLight1Enabled] = useState(true)
  const [light2Enabled, setLight2Enabled] = useState(true)
  const [stats, setStats] = useState({ fps: '-' as string | number, draws: '-' as string | number })
  const controlsRef = useRef<HTMLDivElement>(null)

  const handleStats = useCallback((fps: number, draws: number) => setStats({ fps, draws }), [])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '1') setLight1Enabled((v) => !v)
      if (e.key === '2') setLight2Enabled((v) => !v)
      if (e.key === 't' || e.key === 'T') {
        const modes: LightingMode[] = ['default', 'direct', 'simple']
        setMode((v) => modes[(modes.indexOf(v) + 1) % modes.length])
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Per-line pill rounding for wrapped radio groups
  useEffect(() => {
    const group = controlsRef.current?.querySelector('wa-radio-group')
    if (!group) return
    const update = () => {
      const radios = [...group.querySelectorAll('wa-radio')]
      if (!radios.length) return
      const lines: Element[][] = []
      let lastTop = -Infinity
      let line: Element[] = []
      for (const radio of radios) {
        const top = radio.getBoundingClientRect().top
        if (Math.abs(top - lastTop) > 2) {
          if (line.length) lines.push(line)
          line = []
          lastTop = top
        }
        line.push(radio)
      }
      if (line.length) lines.push(line)
      for (const ln of lines) {
        for (let i = 0; i < ln.length; i++) {
          const pos =
            ln.length === 1 ? 'solo' :
            i === 0 ? 'first' :
            i === ln.length - 1 ? 'last' : 'inner'
          ln[i]!.setAttribute('data-line-pos', pos)
        }
      }
    }
    const ro = new ResizeObserver(update)
    ro.observe(group)
    update()
    return () => ro.disconnect()
  }, [])

  const activeLights = [light1Enabled, light2Enabled].filter(Boolean).length + 1

  return (
    <>
      {/* Hide radio group label + pill rounding */}
      <style>{`
        .lighting-controls wa-radio-group::part(form-control-label) { display: none; }
        .lighting-controls wa-radio-group::part(form-control) { margin: 0; border: 0; padding: 0; }
        .lighting-controls wa-radio-group::part(form-control-input) { row-gap: 4px; justify-content: center; }
        wa-radio[data-line-pos="first"] {
          border-start-start-radius: var(--wa-border-radius-m);
          border-end-start-radius: var(--wa-border-radius-m);
          border-start-end-radius: 0;
          border-end-end-radius: 0;
        }
        wa-radio[data-line-pos="inner"] { border-radius: 0; }
        wa-radio[data-line-pos="last"] {
          border-start-end-radius: var(--wa-border-radius-m);
          border-end-end-radius: var(--wa-border-radius-m);
          border-start-start-radius: 0;
          border-end-start-radius: 0;
        }
        wa-radio[data-line-pos="solo"] { border-radius: var(--wa-border-radius-m); }
      `}</style>

      {/* Controls — centered bottom bar */}
      <div
        ref={controlsRef}
        className="lighting-controls"
        style={{
          position: 'fixed',
          bottom: 32,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 100,
          pointerEvents: 'auto',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          maxWidth: 'calc(100vw - 24px)',
        }}
      >
        <WaRadioGroup
          label="Lighting Mode"
          size="small"
          orientation="horizontal"
          value={mode}
          onChange={(e: any) =>
            setMode((e.target as HTMLInputElement).value as LightingMode)
          }
        >
          {MODE_OPTIONS.map((opt) => (
            <WaRadio key={opt.value} value={opt.value} size="small" appearance="button">
              {opt.label}
            </WaRadio>
          ))}
        </WaRadioGroup>
        <WaSwitch
          size="small"
          checked={light1Enabled}
          onChange={() => setLight1Enabled((v) => !v)}
        >
          Torch 1
        </WaSwitch>
        <WaSwitch
          size="small"
          checked={light2Enabled}
          onChange={() => setLight2Enabled((v) => !v)}
        >
          Torch 2
        </WaSwitch>
      </div>

      {/* Stats overlay */}
      <div
        style={{
          position: 'fixed',
          top: 12,
          right: 12,
          padding: '5px 10px',
          background: 'rgba(0, 2, 28, 0.7)',
          borderRadius: 6,
          color: '#4a9eff',
          fontFamily: 'monospace',
          fontSize: 10,
          lineHeight: 1.5,
          zIndex: 100,
          whiteSpace: 'pre',
        }}
      >
        {`FPS: ${stats.fps}\nDraws: ${stats.draws}\nLights: ${activeLights}\nMode: ${{ default: 'Default', direct: 'Direct', simple: 'Simple' }[mode]}`}
      </div>

      {/* Canvas */}
      <Canvas renderer={{ antialias: false }}>
        <Suspense fallback={null}>
          <StatsTracker onStats={handleStats} />
          <FlatlandScene
            mode={mode}
            light1Enabled={light1Enabled}
            light2Enabled={light2Enabled}
          />
        </Suspense>
      </Canvas>
    </>
  )
}
