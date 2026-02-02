import { Suspense, useMemo, useState, useRef, useEffect, useCallback } from 'react'
import { Canvas, extend, useFrame, useThree, useLoader } from '@react-three/fiber/webgpu'
import { MeshBasicNodeMaterial } from 'three/webgpu'
import { vec4 } from 'three/tsl'
import { PlaneGeometry, Color, Vector2 } from 'three'
import {
  Flatland,
  Light2D,
  Sprite2D,
  Sprite2DMaterial,
  SpriteSheetLoader,
  type SpriteSheet,
} from '@three-flatland/react'

// Register with R3F
extend({ Flatland, Sprite2D, Light2D })

// Shared geometry for light indicators
const indicatorGeometry = new PlaneGeometry(1, 1)

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

interface LightIndicatorProps {
  position: Vector2
  color: Color
  enabled: boolean
  onDrag: (newPos: Vector2) => void
}

function LightIndicator({ position, color, enabled, onDrag }: LightIndicatorProps) {
  const meshRef = useRef<THREE.Mesh>(null)
  const { gl } = useThree()
  const dragging = useRef(false)

  const material = useMemo(() => {
    const mat = new MeshBasicNodeMaterial()
    mat.transparent = true
    const r = color.r
    const g = color.g
    const b = color.b
    mat.colorNode = vec4(r, g, b, enabled ? 0.8 : 0.3)
    return mat
  }, [color, enabled])

  const handlePointerDown = useCallback((e: THREE.ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    dragging.current = true
    gl.domElement.style.cursor = 'grabbing'
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }, [gl])

  const handlePointerMove = useCallback((e: THREE.ThreeEvent<PointerEvent>) => {
    if (!dragging.current) return

    // Convert screen to world coordinates
    const rect = gl.domElement.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1
    const y = -((e.clientY - rect.top) / rect.height) * 2 + 1

    // Approximate world coordinates (viewSize 300)
    const worldX = x * 150 * (rect.width / rect.height)
    const worldY = y * 150

    onDrag(new Vector2(worldX, worldY))
  }, [gl, onDrag])

  const handlePointerUp = useCallback(() => {
    dragging.current = false
    gl.domElement.style.cursor = 'default'
  }, [gl])

  return (
    <mesh
      ref={meshRef}
      geometry={indicatorGeometry}
      material={material}
      position={[position.x, position.y, 1]}
      scale={[20, 20, 1]}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onPointerEnter={() => {
        if (!dragging.current) gl.domElement.style.cursor = 'grab'
      }}
      onPointerOut={() => {
        if (!dragging.current) gl.domElement.style.cursor = 'default'
      }}
    />
  )
}

interface LitSpriteProps {
  spriteSheet: SpriteSheet
  position: [number, number]
  material: Sprite2DMaterial
}

function LitSprite({ spriteSheet, position, material: litMaterial }: LitSpriteProps) {
  const spriteRef = useRef<Sprite2D>(null)
  const animStateRef = useRef({
    frameIndex: 0,
    timer: 0,
  })

  // Apply the lit material
  useEffect(() => {
    const sprite = spriteRef.current
    if (sprite) {
      sprite.material = litMaterial
    }
  }, [litMaterial])

  // Animate sprite
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
    />
  )
}

function FlatlandScene() {
  const spriteSheet = useLoader(SpriteSheetLoader, './sprites/knight.json')
  const { gl, size } = useThree()
  const flatlandRef = useRef<Flatland>(null)

  // Light state
  const [light1Pos, setLight1Pos] = useState(new Vector2(-80, 50))
  const [light2Pos, setLight2Pos] = useState(new Vector2(80, 50))
  const [light1Enabled, setLight1Enabled] = useState(true)
  const [light2Enabled, setLight2Enabled] = useState(true)
  const [ambientLevel, setAmbientLevel] = useState(0.15)

  // Flicker timer
  const flickerTimer = useRef(0)

  // Light2D refs for direct property access
  const torch1Ref = useRef<Light2D>(null)
  const torch2Ref = useRef<Light2D>(null)
  const ambientRef = useRef<Light2D>(null)

  // Create lit material — uses lit: true for deferred auto-lighting by Flatland
  const litMaterial = useMemo(() => {
    return new Sprite2DMaterial({
      map: spriteSheet.texture,
      lit: true,
    })
  }, [spriteSheet])

  // Handle resize
  useEffect(() => {
    flatlandRef.current?.resize(size.width, size.height)
  }, [size.width, size.height])

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '1') setLight1Enabled((v) => !v)
      if (e.key === '2') setLight2Enabled((v) => !v)
      if (e.key === 'ArrowUp') setAmbientLevel((v) => Math.min(1, v + 0.05))
      if (e.key === 'ArrowDown') setAmbientLevel((v) => Math.max(0, v - 0.05))
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Sync React state to Light2D properties + render
  useFrame((_, delta) => {
    const flatland = flatlandRef.current
    if (!flatland) return

    // Update light positions from React state
    if (torch1Ref.current) {
      torch1Ref.current.position.set(light1Pos.x, light1Pos.y, 0)
      torch1Ref.current.enabled = light1Enabled
    }
    if (torch2Ref.current) {
      torch2Ref.current.position.set(light2Pos.x, light2Pos.y, 0)
      torch2Ref.current.enabled = light2Enabled
    }
    if (ambientRef.current) {
      ambientRef.current.intensity = ambientLevel
    }

    // Update flicker — just set Light2D properties directly
    flickerTimer.current += delta
    const t = flickerTimer.current

    if (light1Enabled && torch1Ref.current) {
      torch1Ref.current.intensity = 1.2 * (1 + Math.sin(t * 15) * 0.1 + Math.sin(t * 23) * 0.05)
    }
    if (light2Enabled && torch2Ref.current) {
      torch2Ref.current.intensity = 1.0 * (1 + Math.sin(t * 17 + 1) * 0.1 + Math.sin(t * 19 + 2) * 0.05)
    }

    // Render — Flatland syncs light uniforms and updates batches
    flatland.render(gl)
  })

  return (
    <>
      <flatland
        ref={flatlandRef}
        viewSize={300}
        clearColor={0x0a0a12}
      >
        {/* Lights — Light2D instances managed by Flatland */}
        <light2D
          ref={torch1Ref}
          lightType="point"
          position={[light1Pos.x, light1Pos.y, 0]}
          color={0xff6600}
          intensity={1.2}
          radius={150}
          falloff={2}
        />
        <light2D
          ref={torch2Ref}
          lightType="point"
          position={[light2Pos.x, light2Pos.y, 0]}
          color={0xffaa00}
          intensity={1.0}
          radius={150}
          falloff={2}
        />
        <light2D
          ref={ambientRef}
          lightType="ambient"
          color={0x111122}
          intensity={ambientLevel}
        />

        {/* Lit sprites — lit: true on material, Flatland auto-configures */}
        {spritePositions.map((pos, i) => (
          <LitSprite
            key={i}
            spriteSheet={spriteSheet}
            position={pos}
            material={litMaterial}
          />
        ))}
      </flatland>

      {/* Light indicators (draggable UI overlays) */}
      <LightIndicator
        position={light1Pos}
        color={new Color(0xff6600)}
        enabled={light1Enabled}
        onDrag={setLight1Pos}
      />
      <LightIndicator
        position={light2Pos}
        color={new Color(0xffaa00)}
        enabled={light2Enabled}
        onDrag={setLight2Pos}
      />
    </>
  )
}

export default function App() {
  return (
    <>
      {/* UI */}
      <div
        style={{
          position: 'fixed',
          top: 20,
          left: 20,
          color: '#fff',
          fontSize: 14,
          fontFamily: 'monospace',
          zIndex: 100,
        }}
      >
        <div style={{ fontWeight: 'bold', marginBottom: 12 }}>Dungeon Torchlight</div>
        <div style={{ fontSize: 11, color: '#aaa', lineHeight: 1.8 }}>
          <kbd style={{ background: 'rgba(255,255,255,0.15)', padding: '2px 6px', borderRadius: 3 }}>
            Drag
          </kbd>{' '}
          Move torches
          <br />
          <kbd style={{ background: 'rgba(255,255,255,0.15)', padding: '2px 6px', borderRadius: 3 }}>
            1
          </kbd>{' '}
          Toggle Torch 1
          <br />
          <kbd style={{ background: 'rgba(255,255,255,0.15)', padding: '2px 6px', borderRadius: 3 }}>
            2
          </kbd>{' '}
          Toggle Torch 2
          <br />
          <kbd style={{ background: 'rgba(255,255,255,0.15)', padding: '2px 6px', borderRadius: 3 }}>
            Up/Down
          </kbd>{' '}
          Adjust ambient
        </div>
      </div>

      {/* Canvas */}
      <Canvas
        gl={{ antialias: false }}
      >
        <color attach="background" args={['#0a0a12']} />
        <Suspense fallback={null}>
          <FlatlandScene />
        </Suspense>
      </Canvas>
    </>
  )
}
