import { Suspense, useMemo, useState, use, useRef, useEffect, useCallback } from 'react'
import { Canvas, extend, useFrame, useThree } from '@react-three/fiber/webgpu'
import { MeshBasicNodeMaterial } from 'three/webgpu'
import { uniform, vec4, float, length, max, add, Fn } from 'three/tsl'
import { NearestFilter, PlaneGeometry, Color, Vector2, Vector4 } from 'three'
import {
  Flatland,
  Light2D,
  Sprite2D,
  SpriteSheetLoader,
  sampleSprite,
  type SpriteSheet,
} from '@three-flatland/react'

// Register with R3F
extend({ Flatland, Sprite2D, Light2D })

// Load sprite sheet
const spriteSheetPromise = SpriteSheetLoader.load('./sprites/knight.json').then(
  (sheet) => {
    sheet.texture.minFilter = NearestFilter
    sheet.texture.magFilter = NearestFilter
    return sheet
  }
)

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
    mat.colorNode = vec4(
      uniform(color).mul(uniform(enabled ? 1 : 0.3)),
      float(enabled ? 0.8 : 0.3)
    )
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
  lightUniforms: ReturnType<typeof createLightUniforms>
  animationIndex: number
}

function createLightUniforms() {
  return {
    light1Pos: uniform(new Vector2(-80, 50)),
    light1Color: uniform(new Color(0xff6600)),
    light1Intensity: uniform(1.2),
    light1Radius: uniform(150),
    light1Enabled: uniform(1),
    light2Pos: uniform(new Vector2(80, 50)),
    light2Color: uniform(new Color(0xffaa00)),
    light2Intensity: uniform(1.0),
    light2Radius: uniform(150),
    light2Enabled: uniform(1),
    ambientColor: uniform(new Color(0x111122)),
    ambientIntensity: uniform(0.15),
  }
}

function LitSprite({ spriteSheet, position, lightUniforms, animationIndex }: LitSpriteProps) {
  const spriteRef = useRef<Sprite2D>(null)
  const animStateRef = useRef({
    frameIndex: 0,
    timer: 0,
  })

  // Create lit material once
  const litMaterial = useMemo(() => {
    const mat = new MeshBasicNodeMaterial()
    mat.transparent = true

    mat.colorNode = Fn(() => {
      const frameUniform = uniform(new Vector4(0, 0, 0.125, 0.125))
      const spriteColor = sampleSprite(spriteSheet.texture, frameUniform, { alphaTest: 0.01 })

      // Point light 1
      const toLight1 = lightUniforms.light1Pos.sub(new Vector2(position[0], position[1]))
      const dist1 = length(toLight1)
      const attenuation1 = max(float(0), float(1).sub(dist1.div(lightUniforms.light1Radius))).pow(float(2))
      const light1 = lightUniforms.light1Color.mul(attenuation1).mul(lightUniforms.light1Intensity).mul(lightUniforms.light1Enabled)

      // Point light 2
      const toLight2 = lightUniforms.light2Pos.sub(new Vector2(position[0], position[1]))
      const dist2 = length(toLight2)
      const attenuation2 = max(float(0), float(1).sub(dist2.div(lightUniforms.light2Radius))).pow(float(2))
      const light2 = lightUniforms.light2Color.mul(attenuation2).mul(lightUniforms.light2Intensity).mul(lightUniforms.light2Enabled)

      // Ambient
      const ambient = lightUniforms.ambientColor.mul(lightUniforms.ambientIntensity)

      // Combine
      const totalLight = add(add(light1, light2), ambient)
      return vec4(spriteColor.rgb.mul(totalLight), spriteColor.a)
    })()

    return mat
  }, [spriteSheet, lightUniforms, position])

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

  // Apply custom material
  useEffect(() => {
    const sprite = spriteRef.current
    if (sprite) {
      ;(sprite as any).material = litMaterial
    }
  }, [litMaterial])

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
  const spriteSheet = use(spriteSheetPromise) as SpriteSheet
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

  // Light uniforms (need to be created once and updated)
  const lightUniforms = useMemo(() => createLightUniforms(), [])

  // Update light uniforms when state changes
  useEffect(() => {
    lightUniforms.light1Pos.value.copy(light1Pos)
  }, [light1Pos, lightUniforms])

  useEffect(() => {
    lightUniforms.light2Pos.value.copy(light2Pos)
  }, [light2Pos, lightUniforms])

  useEffect(() => {
    lightUniforms.light1Enabled.value = light1Enabled ? 1 : 0
  }, [light1Enabled, lightUniforms])

  useEffect(() => {
    lightUniforms.light2Enabled.value = light2Enabled ? 1 : 0
  }, [light2Enabled, lightUniforms])

  useEffect(() => {
    lightUniforms.ambientIntensity.value = ambientLevel
  }, [ambientLevel, lightUniforms])

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

  // Animation and render loop
  useFrame((_, delta) => {
    const flatland = flatlandRef.current
    if (!flatland) return

    // Update flicker
    flickerTimer.current += delta
    const t = flickerTimer.current

    if (light1Enabled) {
      lightUniforms.light1Intensity.value = 1.2 * (1 + Math.sin(t * 15) * 0.1 + Math.sin(t * 23) * 0.05)
    }
    if (light2Enabled) {
      lightUniforms.light2Intensity.value = 1.0 * (1 + Math.sin(t * 17 + 1) * 0.1 + Math.sin(t * 19 + 2) * 0.05)
    }

    // Update batches and render
    flatland.spriteGroup.update()
    gl.render(flatland.scene, flatland.camera)
  })

  return (
    <>
      <flatland
        ref={flatlandRef}
        viewSize={300}
        clearColor={0x0a0a12}
      >
        {/* Lit sprites */}
        {spritePositions.map((pos, i) => (
          <LitSprite
            key={i}
            spriteSheet={spriteSheet}
            position={pos}
            lightUniforms={lightUniforms}
            animationIndex={i}
          />
        ))}

        {/* Light2D instances (for potential future use with built-in lighting) */}
        <light2D
          type="point"
          position={[light1Pos.x, light1Pos.y]}
          color={0xff6600}
          intensity={light1Enabled ? 1.2 : 0}
          radius={150}
          falloff={2}
        />
        <light2D
          type="point"
          position={[light2Pos.x, light2Pos.y]}
          color={0xffaa00}
          intensity={light2Enabled ? 1.0 : 0}
          radius={150}
          falloff={2}
        />
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
