import { useEffect, useMemo, useRef } from 'react'
import { Canvas, extend, useFrame, useThree } from '@react-three/fiber/webgpu'
import { CanvasTexture, SRGBColorSpace } from 'three'
import type { WebGPURenderer } from 'three/webgpu'
import { Flatland, Light2D, Sprite2D, attachLighting } from 'three-flatland/react'
import { HierarchicalRadianceLightEffect, RadianceLightEffect } from '@three-flatland/presets'
import '@three-flatland/presets/react'
import { usePane, usePaneFolder, usePaneInput } from '@three-flatland/devtools/react'

extend({
  Flatland,
  Light2D,
  Sprite2D,
  RadianceLightEffect,
  HierarchicalRadianceLightEffect,
})

type Algorithm = 'rc' | 'hrc'
type CompositionMode = 'hierarchical' | 'holographic'

interface SceneProps {
  algorithm: Algorithm
  compositionMode: CompositionMode
  intensity: number
  warmIntensity: number
  coolIntensity: number
  occluders: boolean
}

function solidTexture(color: string): CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 1
  canvas.height = 1
  const context = canvas.getContext('2d')
  if (!context) throw new Error('2D canvas context is unavailable')
  context.fillStyle = color
  context.fillRect(0, 0, 1, 1)

  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.needsUpdate = true
  return texture
}

function RadianceScene({ algorithm, compositionMode, intensity, warmIntensity, coolIntensity, occluders }: SceneProps) {
  const renderer = useThree((state) => state.renderer)
  const flatlandRef = useRef<Flatland>(null)
  const rcRef = useRef<InstanceType<typeof RadianceLightEffect>>(null)
  const hrcRef = useRef<InstanceType<typeof HierarchicalRadianceLightEffect>>(null)
  const framesRef = useRef(0)
  const statusRef = useRef<HTMLElement | null>(null)
  const textures = useMemo(
    () => ({
      floor: solidTexture('#d8d6ca'),
      wall: solidTexture('#1a1f29'),
      ledge: solidTexture('#252b35'),
      warm: solidTexture('#b84a3d'),
      cool: solidTexture('#3b76c4'),
    }),
    []
  )

  useEffect(() => {
    statusRef.current = document.querySelector('#status')
  }, [])

  useEffect(() => {
    const effect = algorithm === 'hrc' ? hrcRef.current : rcRef.current
    if (!effect) return

    effect.radianceIntensity = intensity
    effect.radiance.filterRadius = 0.7
    effect.radiance.filterStrength = 1
    effect.radiance.filterDiagonals = false
    effect.radiance.filterJitterStrength = 0
    effect.radiance.raymarchSteps = 64
    effect.radiance.blueNoiseStrength = 0
    effect.radiance.intervalOverlap = 0
    effect.radiance.sceneRadianceDownsampleFactor = 1
    effect.radiance.mipBlur = 0
    effect.radiance.mipStrength = 0.4
    effect.radiance.wideDownsampleFactor = 2
    effect.radiance.wideLevels = 1

    if (effect instanceof HierarchicalRadianceLightEffect) {
      effect.radiance.compositionMode = compositionMode
      effect.radiance.shortIntervalCount = 4
      effect.radiance.compositionLevels = 2
      effect.radiance.holographicFinalResolutionScale = 2
    }
  }, [algorithm, compositionMode, intensity])

  useFrame(
    () => {
      const flatland = flatlandRef.current
      const effect = algorithm === 'hrc' ? hrcRef.current : rcRef.current
      if (!flatland || !effect) return

      flatland.render(renderer as unknown as WebGPURenderer)
      framesRef.current++

      const finalImage = effect.radiance.finalRadianceTexture.image as {
        width: number
        height: number
      }
      if (statusRef.current) {
        const mode = algorithm === 'hrc' ? `/${compositionMode}` : ''
        statusRef.current.textContent = `${algorithm}${mode} frames:${framesRef.current} final:${finalImage.width}x${finalImage.height}`
      }

      ;(
        window as Window & {
          __radianceCascadeProbe?: unknown
        }
      ).__radianceCascadeProbe = {
        variant: 'react',
        algorithm,
        compositionMode,
        frames: framesRef.current,
        finalRadiance: {
          width: finalImage.width,
          height: finalImage.height,
        },
        estimatedPassCount: effect.radiance.estimatedPassCount,
        estimatedRaymarchSampleCount: effect.radiance.estimatedRaymarchSampleCount,
      }
    },
    { phase: 'render' }
  )

  return (
    <flatland ref={flatlandRef} viewSize={360} clearColor={0x111418}>
      {algorithm === 'hrc' ? (
        <hierarchicalRadianceLightEffect ref={hrcRef} attach={attachLighting} radianceIntensity={intensity} />
      ) : (
        <radianceLightEffect ref={rcRef} attach={attachLighting} radianceIntensity={intensity} />
      )}

      <sprite2D texture={textures.floor} scale={[330, 210, 1]} position={[0, 0, -20]} lit />
      <sprite2D
        texture={textures.wall}
        scale={[22, 156, 1]}
        position={[5, 0, 2]}
        lit={false}
        castsShadow={occluders}
        visible={occluders}
      />
      <sprite2D
        texture={textures.ledge}
        scale={[86, 18, 1]}
        position={[-70, -58, 2]}
        lit={false}
        castsShadow={occluders}
        visible={occluders}
      />
      <sprite2D
        texture={textures.ledge}
        scale={[82, 18, 1]}
        position={[94, 58, 2]}
        lit={false}
        castsShadow={occluders}
        visible={occluders}
      />
      <sprite2D texture={textures.warm} scale={[36, 36, 1]} position={[-122, 70, 1]} />
      <sprite2D texture={textures.cool} scale={[36, 36, 1]} position={[124, -70, 1]} />

      <light2D
        lightType="point"
        color={0xff8a45}
        intensity={warmIntensity}
        distance={135}
        decay={2}
        position={[-128, 4, 0]}
      />
      <light2D
        lightType="point"
        color={0x4c9dff}
        intensity={coolIntensity}
        distance={120}
        decay={2}
        position={[128, -10, 0]}
      />
      <light2D lightType="ambient" color={0x1c2230} intensity={0.2} />
    </flatland>
  )
}

export default function App() {
  const { pane } = usePane()
  const radiance = usePaneFolder(pane, 'Radiance Cascades', {
    expanded: true,
  })
  const [algorithmValue] = usePaneInput(radiance, 'algorithm', 'hrc', { options: { RC: 'rc', HRC: 'hrc' } })
  const [compositionModeValue] = usePaneInput(radiance, 'mode', 'holographic', {
    options: { Holographic: 'holographic', Hierarchical: 'hierarchical' },
  })
  const [intensity] = usePaneInput(radiance, 'intensity', 0.005, {
    min: 0,
    max: 0.12,
    step: 0.005,
  })
  const [warmIntensity] = usePaneInput(radiance, 'warm', 6.1, {
    min: 0,
    max: 12,
    step: 0.1,
  })
  const [coolIntensity] = usePaneInput(radiance, 'cool', 9.7, {
    min: 0,
    max: 12,
    step: 0.1,
  })
  const [occluders] = usePaneInput(radiance, 'occluders', true)

  return (
    <Canvas dpr={1} renderer={{ antialias: false }}>
      <color attach="background" args={['#111418']} />
      <RadianceScene
        algorithm={algorithmValue as Algorithm}
        compositionMode={compositionModeValue as CompositionMode}
        intensity={intensity}
        warmIntensity={warmIntensity}
        coolIntensity={coolIntensity}
        occluders={occluders}
      />
    </Canvas>
  )
}
