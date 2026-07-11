import { Suspense, useEffect, useMemo, useRef, useState, useLayoutEffect } from 'react'
import { Canvas, createPortal, extend, useFrame, useThree } from '@react-three/fiber/webgpu'
import type { WebGPURenderer } from 'three/webgpu'
import { Color, type OrthographicCamera as ThreeOrthographicCamera } from 'three'
import { Flatland } from 'three-flatland/react'
import { SlugText } from '@three-flatland/slug/react'
import { SlugFontLoader } from '@three-flatland/slug/react'
import type { SlugFont } from '@three-flatland/slug'
import { DevtoolsProvider } from '@three-flatland/devtools/react'
import {
  Container,
  Text,
  VanillaFullscreen,
  VanillaText,
  withOpacity,
  setPreferredColorScheme,
  useRenderContext,
  useSetup,
  canvasInputProps,
  type FullscreenProperties,
} from '@three-flatland/uikit/react'
import { suspend } from 'suspend-react'
import { gemGradientNode } from './GemBackground'
import { GEM } from './gem'

extend({ Flatland, SlugText, VanillaFullscreen })
setPreferredColorScheme('dark')

const VIEW_SIZE = 800
const WHITE = '#f5f6fa'
const MUTED = '#9aa0ac'
const INK = '#0b0d11'

// the gem taxonomy — colorization comes for free, per Slug text
const AMETHYST = '#995bff'
const EMERALD = '#12b981'
const RUBY = '#eb3c67'
const GOLD = '#e0a100'
const DIAMOND = '#5bc8ff'

// ============================================================================
// Slug showcase — analytic Bézier text, rendered straight from font outlines
// with NO atlas. Scale a glyph to fill the screen and it stays razor-sharp;
// colorize and outline it for free; and the live HUD shows the whole frame
// costs almost nothing. This is the winning combo MSDF atlases can't touch.
// ============================================================================

function useSlugFont(url: string): SlugFont {
  return suspend(() => SlugFontLoader.load(url, { forceRuntime: true }), [url, 'slug-showcase'])
}

function HudFullscreen({
  camera,
  children,
  ...props
}: FullscreenProperties & { camera: ThreeOrthographicCamera }) {
  const renderer = useThree((s) => s.gl)
  const renderContext = useRenderContext()
  const ref = useRef<VanillaFullscreen>(null)
  const args = useMemo(
    () => [renderer, props, undefined, { renderContext }],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [renderer, renderContext]
  )
  const outProps = useSetup(ref, props, args)
  return createPortal(
    <vanillaFullscreen {...outProps} ref={ref}>
      {children}
    </vanillaFullscreen>,
    camera,
    { injectScene: false, camera }
  )
}

function OrthoCamera({ viewSize }: { viewSize: number }) {
  const set = useThree((s) => s.set)
  const size = useThree((s) => s.size)
  const camRef = useRef<ThreeOrthographicCamera | null>(null)
  const aspect = size.width / size.height
  useLayoutEffect(() => {
    const cam = camRef.current
    if (!cam) return
    cam.left = (-viewSize * aspect) / 2
    cam.right = (viewSize * aspect) / 2
    cam.top = viewSize / 2
    cam.bottom = -viewSize / 2
    cam.updateProjectionMatrix()
    set({ camera: cam })
  }, [viewSize, aspect, set])
  return <orthographicCamera ref={camRef} position={[0, 0, 100]} near={0.1} far={1000} manual />
}

/** One stat cell in the HUD. */
function Stat({ label, unit, valueRef }: { label: string; unit?: string; valueRef: React.Ref<VanillaText> }) {
  return (
    <Container flexDirection="column" gap={2} alignItems="flex-start">
      <Text color={MUTED} fontSize={11}>
        {label}
      </Text>
      <Container flexDirection="row" alignItems="baseline" gap={3}>
        <Text ref={valueRef} color={WHITE} fontSize={22} fontWeight="bold">
          —
        </Text>
        {unit != null && (
          <Text color={MUTED} fontSize={11}>
            {unit}
          </Text>
        )}
      </Container>
    </Container>
  )
}

/**
 * SlugText needs `.update(camera)` every frame to compute its analytic coverage
 * for the current on-screen scale — that is what keeps it razor-sharp at any
 * size. This wrapper owns a ref and drives that update from a shared camera ref.
 */
function Sign({
  cam,
  ...props
}: { cam: React.MutableRefObject<ThreeOrthographicCamera | null> } & Record<string, unknown>) {
  const ref = useRef<SlugText>(null)
  useFrame(() => {
    const c = cam.current
    if (c) ref.current?.update(c)
  })
  return <slugText ref={ref} {...props} />
}

function Scene() {
  const { gl } = useThree()
  const flatlandRef = useRef<Flatland>(null)
  const [flatlandCamera, setFlatlandCamera] = useState<ThreeOrthographicCamera | null>(null)
  const cameraRef = useRef<ThreeOrthographicCamera | null>(null)
  cameraRef.current = flatlandCamera
  const font = useSlugFont('./Inter-Regular.ttf')

  // the oversized hero that breathes its size — live resize, still razor-sharp
  const heroRef = useRef<SlugText>(null)
  const sizeReadRef = useRef<VanillaText>(null)

  // HUD stat cells
  const fpsRef = useRef<VanillaText>(null)
  const gpuRef = useRef<VanillaText>(null)
  const memRef = useRef<VanillaText>(null)
  const drawRef = useRef<VanillaText>(null)
  const triRef = useRef<VanillaText>(null)

  const t = useRef(0)
  const fpsAccum = useRef(0)
  const fpsFrames = useRef(0)

  useEffect(() => {
    const flatland = flatlandRef.current
    if (!flatland) return
    const node = gemGradientNode({ gem: GEM })
    const scene = (flatland as unknown as { scene: { backgroundNode: unknown } }).scene
    scene.backgroundNode = node
  }, [])

  useEffect(() => {
    const flatland = flatlandRef.current
    if (!flatland) return
    flatland.add(flatland.camera)
    setFlatlandCamera(flatland.camera)
  }, [])

  useFrame((_, rawDelta) => {
    const delta = Math.min(0.05, rawDelta)
    t.current += delta

    // breathe the hero between a legible size and an oversized one
    const s = 0.5 - 0.5 * Math.cos(t.current * 0.7)
    const fontSize = Math.round(130 + s * 330) // 130 → 460 px, analytic the whole way
    const hero = heroRef.current
    if (hero) {
      hero.fontSize = fontSize
      if (cameraRef.current) hero.update(cameraRef.current)
    }
    sizeReadRef.current?.setProperties({ text: `${fontSize}px` })

    // ── live perf HUD ──
    fpsAccum.current += delta
    fpsFrames.current += 1
    if (fpsAccum.current >= 0.5) {
      fpsRef.current?.setProperties({ text: `${Math.round(fpsFrames.current / fpsAccum.current)}` })
      fpsAccum.current = 0
      fpsFrames.current = 0
      const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory
      if (mem) memRef.current?.setProperties({ text: `${Math.round(mem.usedJSHeapSize / 1048576)}` })
    }
  })

  useFrame(
    () => {
      flatlandRef.current?.render(gl as unknown as WebGPURenderer)
      // read AFTER flatland's render, when gl.info reflects the actual scene
      const render = (
        gl as unknown as {
          info?: { render?: { drawCalls?: number; triangles?: number; timestamp?: number } }
        }
      ).info?.render
      if (render) {
        drawRef.current?.setProperties({ text: `${render.drawCalls ?? 0}` })
        triRef.current?.setProperties({ text: `${((render.triangles ?? 0) / 1000).toFixed(1)}k` })
        const ts = render.timestamp
        gpuRef.current?.setProperties({ text: ts != null && ts > 0 ? ts.toFixed(2) : '—' })
      }
    },
    { phase: 'render' }
  )

  const outlineInk = useMemo(() => new Color(INK), [])

  return (
    <>
      <OrthoCamera viewSize={VIEW_SIZE} />
      <flatland ref={flatlandRef} viewSize={VIEW_SIZE}>
        {/* the oversized, live-resizing, outlined hero */}
        <slugText
          ref={heroRef}
          font={font}
          text="Aa"
          fontSize={220}
          color={AMETHYST}
          outline={{ width: 0.04, color: outlineInk }}
          align="center"
          maxWidth={900}
          position={[-450, -70, 0]}
        />
        {/* a size ramp — the same word tiny to large, every one crisp */}
        <Sign cam={cameraRef} font={font} text="flatland" fontSize={18} color={DIAMOND} position={[-360, -210, 1]} />
        <Sign cam={cameraRef} font={font} text="flatland" fontSize={34} color={EMERALD} position={[-360, -250, 1]} />
        <Sign cam={cameraRef} font={font} text="flatland" fontSize={58} color={GOLD} position={[-360, -305, 1]} />
        {/* a colorized, outlined counterpoint */}
        <Sign
          cam={cameraRef}
          font={font}
          text="no atlas."
          fontSize={64}
          color={RUBY}
          outline={{ width: 0.05, color: outlineInk }}
          position={[120, -260, 1]}
        />
      </flatland>

      {flatlandCamera && (
        <HudFullscreen
          camera={flatlandCamera}
          flexDirection="column"
          justifyContent="space-between"
          padding={22}
          fontFamilies={{ inter: { normal: font } }}
        >
          {/* top: live perf HUD */}
          <Container flexDirection="row" justifyContent="space-between" alignItems="flex-start" width="100%">
            <Container
              flexDirection="column"
              gap={2}
              backgroundColor={withOpacity(INK, 0.6)}
              borderRadius={12}
              borderWidth={1}
              borderColor={withOpacity(AMETHYST, 0.35)}
              padding={14}
            >
              <Text color={MUTED} fontSize={11}>
                Slug · analytic Bézier · no atlas
              </Text>
              <Container flexDirection="row" alignItems="baseline" gap={6}>
                <Text ref={sizeReadRef} color={AMETHYST} fontSize={26} fontWeight="bold">
                  220px
                </Text>
                <Text color={MUTED} fontSize={12}>
                  live · razor-sharp
                </Text>
              </Container>
            </Container>

            <Container
              flexDirection="row"
              gap={20}
              backgroundColor={withOpacity(INK, 0.6)}
              borderRadius={12}
              borderWidth={1}
              borderColor={withOpacity('white', 0.1)}
              paddingX={18}
              paddingY={12}
            >
              <Stat label="FPS" valueRef={fpsRef} />
              <Stat label="GPU" unit="ms" valueRef={gpuRef} />
              <Stat label="MEM" unit="MB" valueRef={memRef} />
              <Stat label="DRAWS" valueRef={drawRef} />
              <Stat label="TRIS" valueRef={triRef} />
            </Container>
          </Container>

          {/* bottom: the pitch */}
          <Container flexDirection="column" gap={4}>
            <Text color={WHITE} fontSize={15} fontWeight="bold">
              One glyph. Any size. Zero blur.
            </Text>
            <Text color={MUTED} fontSize={12}>
              Rendered straight from the font's Bézier outlines — resolution-independent, colorized and
              outlined, on WebGPU + WebGL2 through TSL.
            </Text>
          </Container>
        </HudFullscreen>
      )}
    </>
  )
}

export default function App() {
  return (
    <Canvas {...canvasInputProps} renderer={{ antialias: false }}>
      <DevtoolsProvider name="slug-showcase" />
      <Suspense fallback={null}>
        <Scene />
      </Suspense>
    </Canvas>
  )
}
