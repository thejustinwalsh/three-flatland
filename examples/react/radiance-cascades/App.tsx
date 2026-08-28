import { useEffect, useMemo, useRef } from 'react'
import { Canvas, extend, useFrame, useThree } from '@react-three/fiber/webgpu'
import { CanvasTexture, SRGBColorSpace } from 'three'
import type { WebGPURenderer } from 'three/webgpu'
import {
  Flatland,
  HIERARCHICAL_RADIANCE_CASCADES_PRESETS,
  Light2D,
  Sprite2D,
  attachLighting,
} from 'three-flatland/react'
import {
  DdaFixedRadianceLightEffect,
  HierarchicalRadianceLightEffect,
  RadianceLightEffect,
} from '@three-flatland/presets'
import '@three-flatland/presets/react'
import { usePane, usePaneFolder, usePaneInput } from '@three-flatland/devtools/react'
import { ExampleFallback } from './ExampleFallback'
import { configureExampleRendererColor } from './rendererColorManagement'

extend({
  Flatland,
  Light2D,
  Sprite2D,
  RadianceLightEffect,
  DdaFixedRadianceLightEffect,
  HierarchicalRadianceLightEffect,
})

type Algorithm = 'rc' | 'dda-rc-fixed' | 'hrc' | 'dda-float' | 'dda-integer' | 'dda-fixed'
type CompositionMode = 'hierarchical' | 'holographic'

interface SceneProps {
  algorithm: Algorithm
  compositionMode: CompositionMode
  intensity: number
  warmIntensity: number
  coolIntensity: number
  occluders: boolean
  wallOpen: boolean
  ddaPixelSize: number
  ddaBleedThreshold: number
  ddaQuantizationBits: number
  ddaTransferRange: number
  ddaRadianceRange: number
  ddaPaletteBands: number
  ddaPaletteExposure: number
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

function RadianceScene({
  algorithm,
  compositionMode,
  intensity,
  warmIntensity,
  coolIntensity,
  occluders,
  wallOpen,
  ddaPixelSize,
  ddaBleedThreshold,
  ddaQuantizationBits,
  ddaTransferRange,
  ddaRadianceRange,
  ddaPaletteBands,
  ddaPaletteExposure,
}: SceneProps) {
  const renderer = useThree((state) => state.renderer)
  const flatlandRef = useRef<Flatland>(null)
  const rcRef = useRef<InstanceType<typeof RadianceLightEffect>>(null)
  const ddaRcRef = useRef<InstanceType<typeof DdaFixedRadianceLightEffect>>(null)
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
    configureExampleRendererColor(renderer as unknown as WebGPURenderer)
  }, [renderer])

  useEffect(() => {
    const effect = algorithm === 'rc' ? rcRef.current : algorithm === 'dda-rc-fixed' ? ddaRcRef.current : hrcRef.current
    if (!effect) return

    effect.radianceIntensity = intensity

    if (effect instanceof HierarchicalRadianceLightEffect) {
      effect.radiance.compositionMode = algorithm === 'hrc' ? compositionMode : 'holographic'
      effect.radiance.holographicTraversal =
        algorithm === 'dda-float'
          ? 'dda-float'
          : algorithm === 'dda-integer'
            ? 'dda-integer'
            : algorithm === 'dda-fixed'
              ? 'dda-fixed'
              : 'sdf'
      effect.radiance.ddaPixelSize = ddaPixelSize
      effect.radiance.ddaBleedThreshold = ddaBleedThreshold
      effect.radiance.ddaQuantizationBits = ddaQuantizationBits
      effect.radiance.ddaTransferRange = ddaTransferRange
      effect.radiance.ddaRadianceRange = ddaRadianceRange
      effect.radiance.ddaPaletteBands = ddaPaletteBands
      effect.radiance.ddaPaletteExposure = ddaPaletteExposure
    }
    if (effect instanceof DdaFixedRadianceLightEffect) {
      effect.radiance.ddaPixelSize = ddaPixelSize
      effect.radiance.ddaBleedThreshold = ddaBleedThreshold
      effect.radiance.ddaQuantizationBits = ddaQuantizationBits
      effect.radiance.ddaRadianceRange = ddaRadianceRange
      effect.radiance.ddaPaletteBands = ddaPaletteBands
      effect.radiance.ddaPaletteExposure = ddaPaletteExposure
    }
  }, [
    algorithm,
    compositionMode,
    ddaBleedThreshold,
    ddaPixelSize,
    ddaQuantizationBits,
    ddaTransferRange,
    ddaRadianceRange,
    ddaPaletteBands,
    ddaPaletteExposure,
    intensity,
  ])

  useFrame(
    () => {
      const flatland = flatlandRef.current
      const effect =
        algorithm === 'rc' ? rcRef.current : algorithm === 'dda-rc-fixed' ? ddaRcRef.current : hrcRef.current
      if (!flatland || !effect) return

      flatland.render(renderer as unknown as WebGPURenderer)
      framesRef.current++

      const finalImage = effect.radiance.finalRadianceTexture.image as {
        width: number
        height: number
      }
      if (statusRef.current) {
        const mode = algorithm === 'rc' || algorithm === 'dda-rc-fixed' ? '' : '/holographic'
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
      {algorithm === 'rc' ? (
        <radianceLightEffect ref={rcRef} attach={attachLighting} radianceIntensity={intensity} />
      ) : algorithm === 'dda-rc-fixed' ? (
        <ddaFixedRadianceLightEffect ref={ddaRcRef} attach={attachLighting} radianceIntensity={intensity} />
      ) : (
        <hierarchicalRadianceLightEffect ref={hrcRef} attach={attachLighting} radianceIntensity={intensity} />
      )}

      <sprite2D texture={textures.floor} scale={[330, 210, 1]} position={[0, 0, -20]} lit />
      <sprite2D
        texture={textures.wall}
        scale={[22, 156, 1]}
        position={occluders && !wallOpen ? [5, 0, 2] : [10000, 0, 2]}
        lit={false}
        castsShadow={occluders && !wallOpen}
      />
      <sprite2D
        texture={textures.ledge}
        scale={[86, 18, 1]}
        position={occluders ? [-70, -58, 2] : [10000, -58, 2]}
        lit={false}
        castsShadow={occluders}
      />
      <sprite2D
        texture={textures.ledge}
        scale={[82, 18, 1]}
        position={occluders ? [94, 58, 2] : [10000, 58, 2]}
        lit={false}
        castsShadow={occluders}
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
  const hrcDefaults = HIERARCHICAL_RADIANCE_CASCADES_PRESETS.balanced
  const { pane } = usePane()
  const radiance = usePaneFolder(pane, 'Radiance Cascades', {
    expanded: true,
  })
  const [algorithmValue] = usePaneInput(radiance, 'algorithm', 'hrc', {
    options: {
      RC: 'rc',
      'DDA RC Fixed': 'dda-rc-fixed',
      HRC: 'hrc',
      'DDA Float': 'dda-float',
      'DDA Integer': 'dda-integer',
      'DDA Fixed': 'dda-fixed',
    },
  })
  const [compositionModeValue] = usePaneInput(radiance, 'mode', hrcDefaults.compositionMode, {
    options: { Holographic: 'holographic', 'Legacy interval': 'hierarchical' },
  })
  const [intensity] = usePaneInput(
    radiance,
    'intensity',
    HierarchicalRadianceLightEffect.lightSchema.radianceIntensity,
    {
      min: 0,
      max: 4,
      step: 0.01,
    }
  )
  const [warmIntensity] = usePaneInput(radiance, 'warm', 1, {
    min: 0,
    max: 4,
    step: 0.01,
  })
  const [coolIntensity] = usePaneInput(radiance, 'cool', 1, {
    min: 0,
    max: 4,
    step: 0.01,
  })
  const [occluders] = usePaneInput(radiance, 'occluders', true)
  const [wallOpen] = usePaneInput(radiance, 'center wall open', false)
  const [ddaPixelSize] = usePaneInput(radiance, 'lighting pixel size', hrcDefaults.ddaPixelSize, {
    min: 1,
    max: 32,
    step: 1,
  })
  const [ddaBleedThreshold] = usePaneInput(radiance, 'bleed color threshold', hrcDefaults.ddaBleedThreshold, {
    min: 0,
    max: 2,
    step: 0.05,
  })
  const [ddaQuantizationBits] = usePaneInput(radiance, 'fixed-point bits', hrcDefaults.ddaQuantizationBits, {
    min: 2,
    max: 8,
    step: 1,
  })
  const [ddaTransferRange] = usePaneInput(radiance, 'fixed transfer range', hrcDefaults.ddaTransferRange, {
    min: 0.25,
    max: 16,
    step: 0.25,
  })
  const [ddaRadianceRange] = usePaneInput(radiance, 'fixed R0 range', hrcDefaults.ddaRadianceRange, {
    min: 0.25,
    max: 16,
    step: 0.25,
  })
  const [ddaPaletteBands] = usePaneInput(radiance, 'lighting palette', hrcDefaults.ddaPaletteBands, {
    options: { Off: 0, '4 bands': 4, '8 bands': 8, '16 bands': 16, '32 bands': 32 },
  })
  const [ddaPaletteExposure] = usePaneInput(radiance, 'palette exposure', hrcDefaults.ddaPaletteExposure, {
    min: 0.25,
    max: 64,
    step: 0.25,
  })

  return (
    <Canvas dpr={1} renderer={{ antialias: false }} fallback={<ExampleFallback />}>
      <color attach="background" args={['#111418']} />
      <RadianceScene
        algorithm={algorithmValue as Algorithm}
        compositionMode={compositionModeValue as CompositionMode}
        intensity={intensity}
        warmIntensity={warmIntensity}
        coolIntensity={coolIntensity}
        occluders={occluders}
        wallOpen={wallOpen}
        ddaPixelSize={ddaPixelSize}
        ddaBleedThreshold={ddaBleedThreshold}
        ddaQuantizationBits={ddaQuantizationBits}
        ddaTransferRange={ddaTransferRange}
        ddaRadianceRange={ddaRadianceRange}
        ddaPaletteBands={ddaPaletteBands}
        ddaPaletteExposure={ddaPaletteExposure}
      />
    </Canvas>
  )
}
