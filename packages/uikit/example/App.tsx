import { Suspense, useEffect, useMemo, useRef, useState, type ComponentRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber/webgpu'
import { Color } from 'three'
import { Inspector } from 'three/addons/inspector/Inspector.js'
import { signal, type Signal } from '@preact/signals-core'
import {
  Fullscreen,
  Container,
  Image as UikitImage,
  Text,
  VanillaText,
  VanillaContainer,
  VanillaImage,
  withOpacity,
  setPreferredColorScheme,
  basedOnPreferredColorScheme,
  noEvents,
  PointerEvents,
} from '@three-flatland/uikit/react'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Button,
  Input,
  Textarea,
  Slider,
  Switch,
  Checkbox,
  RadioGroup,
  RadioGroupItem,
  Progress,
  Badge,
  Separator,
  Label,
  Video,
  Toggle,
  ToggleGroup,
  ToggleGroupItem,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionTriggerIcon,
  AccordionContent,
  Alert,
  AlertTitle,
  AlertDescription,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationPrevious,
  PaginationNext,
  PaginationEllipsis,
  Skeleton,
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
  VanillaProgress,
  VanillaVideo,
  VanillaDialog,
  VanillaAlertDialog,
} from '@three-flatland/uikit-default/react'
import {
  User,
  Volume2,
  Zap,
  Bold,
  Italic,
  Underline,
  Info,
  Star,
  Palette,
  Play,
  Pause,
  Gauge,
  Type,
  Sun,
  Moon,
  Image,
  FileText,
  Compass,
  CircleHelp,
  Target,
  Maximize2,
  RotateCcw,
} from '@three-flatland/uikit-lucide/react'
import { SlugFontLoader } from '@three-flatland/slug/react'
import type { SlugFont } from '@three-flatland/slug'
import { suspend } from 'suspend-react'

setPreferredColorScheme('dark')

// Foreground + surfaces are theme-reactive via signals, so the Dark-mode toggle
// repaints text + backgrounds with no React re-render. GEM (accent) reads on both
// modes; INK stays a plain string for the R3F <color> arg (which can't take a signal).
const th = basedOnPreferredColorScheme({
  dark: { fg: '#f5f6fa', muted: '#8b8f9a', surface: '#0b0d11', inset: '#05070a' },
  light: { fg: '#20222a', muted: '#5b6070', surface: '#e7e8ee', inset: '#f2f3f7' },
})
const WHITE = th.fg
const MUTED = th.muted
const SURFACE = th.surface
const INSET = th.inset
// GEM is the app-wide accent — a SIGNAL, so the Palette card can recolor every
// icon/chip/border (color={GEM}) across the whole gallery live by setting GEM.value.
const GEM = signal<string>('#995bff')
const INK = '#0b0d11'
const GAP = 12
const PAD = 16

// ============================================================================
// A bento gallery for @three-flatland/uikit-default — every control the kit
// ships, as cards in a masonry grid. Self-contained in the component library:
// plain uikit <Fullscreen>, no scene. Two cards market the tech: a live Slug
// text card (resize + colorize, analytic and razor-sharp), and a live perf
// card (FPS / GPU / memory / draws / tris) reading straight off the renderer.
// ============================================================================

function useSlugFont(url: string): SlugFont {
  return suspend(() => SlugFontLoader.load(url, { forceRuntime: true }), [url, 'uikit-bento-font'])
}

function Col({ children }: { children: React.ReactNode }) {
  return (
    <Container
      flexDirection="column"
      gap={GAP}
      flexGrow={1}
      flexShrink={1}
      flexBasis={0}
      height="100%"
    >
      {children}
    </Container>
  )
}

/** A bento tile. `grow` distributes the column's spare height so tiles fill it. */
function Tile({
  title,
  hint,
  icon,
  grow = 1,
  action,
  children,
}: {
  title: string
  hint?: string
  icon?: React.ReactNode
  grow?: number
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <Card
      flexDirection="column"
      gap={10}
      padding={16}
      flexGrow={grow}
      flexShrink={1}
      flexBasis="auto"
    >
      <CardHeader padding={0} gap={2}>
        <Container flexDirection="row" alignItems="center" gap={8}>
          {icon}
          <CardTitle>
            <Text fontSize={15}>{title}</Text>
          </CardTitle>
          {action != null && (
            <>
              <Container flexGrow={1} />
              {action}
            </>
          )}
        </Container>
        {hint != null && (
          <CardDescription>
            <Text fontSize={11}>{hint}</Text>
          </CardDescription>
        )}
      </CardHeader>
      <CardContent padding={0} flexDirection="column" gap={10} flexGrow={1} justifyContent="center">
        {children}
      </CardContent>
    </Card>
  )
}

function Row({ children, ...props }: { children: React.ReactNode; [key: string]: unknown }) {
  return (
    <Container flexDirection="row" alignItems="center" gap={10} {...props}>
      {children}
    </Container>
  )
}

function Stat({
  label,
  unit,
  valueRef,
}: {
  label: string
  unit?: string
  valueRef: React.Ref<VanillaText>
}) {
  return (
    // Fixed equal-width cell (flexGrow + flexBasis 0) so a changing number never
    // reflows its neighbours — the readout stays put instead of dancing.
    <Container
      flexDirection="column"
      gap={1}
      alignItems="flex-start"
      flexGrow={1}
      flexBasis={0}
      minWidth={0}
    >
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

/** Live Slug showcase card — a word that resizes + recolors every frame, drawn
 *  analytically so it stays razor-sharp at any size (uikit Text is Slug). */
function SlugCard() {
  const textRef = useRef<VanillaText>(null)
  const sizeRef = useRef<VanillaText>(null)
  const t = useRef(0)
  const labelAcc = useRef(0)
  const BASE = 120
  useFrame((_, rawDelta) => {
    const delta = Math.min(0.05, rawDelta)
    t.current += delta
    const s = 0.5 - 0.5 * Math.cos(t.current * 0.7)
    const scale = 0.75 + s * 0.4 // 0.75 → 1.15 of the 120px base (~90 → 138 on screen)
    // Scale via TRANSFORM, not fontSize. Slug is analytic, so a matrix scale stays
    // razor-sharp at any size AND skips the per-frame reshape + reflow that changing
    // fontSize forces — that reshape is what was burning GPU time. This is the Slug
    // advantage made literal: resize for free, no atlas, no blur.
    textRef.current?.setProperties({ transformScale: scale })
    labelAcc.current += delta
    if (labelAcc.current >= 0.16) {
      sizeRef.current?.setProperties({ text: `${Math.round(BASE * scale)}px` })
      labelAcc.current = 0
    }
  })
  return (
    <Tile
      title="Slug text"
      hint="live resize · analytic Bézier · no atlas"
      icon={<Type width={16} height={16} color={GEM} />}
      grow={1.5}
    >
      <Container
        flexGrow={1}
        minHeight={160}
        justifyContent="center"
        alignItems="center"
        overflow="hidden"
        borderRadius={12}
        backgroundColor={INSET}
      >
        {/* -0.05em tracking to match the website wordmark. uikit letterSpacing is
            absolute px (added after xadvance·fontSize), so at fontSize 120 that's -6;
            the hero scales via transformScale, so the tracking stays proportional. */}
        <Text ref={textRef} fontSize={120} fontWeight="bold" letterSpacing={-6} color={WHITE}>
          uikit
        </Text>
      </Container>
      <Row justifyContent="space-between">
        <Text color={MUTED} fontSize={12}>
          Crisp at any size — one glyph, zero blur.
        </Text>
        <Text ref={sizeRef} color={MUTED} fontSize={12}>
          80px
        </Text>
      </Row>
    </Tile>
  )
}

/** Live perf card — reads FPS + memory + draw calls/triangles straight off the
 *  renderer each frame, proving the whole gallery costs almost nothing. */
function PerfCard() {
  const gl = useThree((s) => s.gl)
  const fpsRef = useRef<VanillaText>(null)
  const gpuRef = useRef<VanillaText>(null)
  const memRef = useRef<VanillaText>(null)
  const drawRef = useRef<VanillaText>(null)
  const triRef = useRef<VanillaText>(null)
  const acc = useRef(0)
  const frames = useRef(0)
  const gpuMs = useRef(0)
  // Read the renderer's own counters in the 'finish' phase — AFTER R3F's auto-render,
  // so three's once-per-frame `info.reset()` falls outside the read (a default-phase
  // read straddles the reset and yields 0; this is the same reason the devtools
  // sampler brackets with 'start'/'finish'). GPU time comes straight off WebGPU
  // timestamp queries: `resolveTimestampsAsync` drains them every frame and fills
  // `info.render.timestamp` (ms). The whole readout publishes at 2 Hz so the number
  // glyphs stay legible instead of strobing.
  useFrame(
    (_, rawDelta) => {
      acc.current += Math.min(0.05, rawDelta)
      frames.current += 1

      const renderer = gl as unknown as {
        info?: { render?: { drawCalls?: number; triangles?: number; timestamp?: number } }
        resolveTimestampsAsync?: (type: string) => Promise<unknown>
      }
      const resolved = renderer.resolveTimestampsAsync?.('render')
      if (resolved)
        resolved
          .then(() => {
            const ts = renderer.info?.render?.timestamp
            if (ts != null && ts > 0) gpuMs.current = ts
          })
          .catch(() => {})

      if (acc.current < 0.5) return
      const render = renderer.info?.render
      if (render) {
        drawRef.current?.setProperties({ text: `${render.drawCalls ?? 0}` })
        triRef.current?.setProperties({ text: `${((render.triangles ?? 0) / 1000).toFixed(1)}k` })
      }
      gpuRef.current?.setProperties({ text: gpuMs.current > 0 ? gpuMs.current.toFixed(2) : '—' })
      fpsRef.current?.setProperties({ text: `${Math.round(frames.current / acc.current)}` })
      const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory
      if (mem)
        memRef.current?.setProperties({ text: `${Math.round(mem.usedJSHeapSize / 1048576)}` })
      acc.current = 0
      frames.current = 0
    },
    { phase: 'finish' }
  )
  return (
    <Tile
      title="Performance"
      hint="live · this frame"
      icon={<Gauge width={16} height={16} color={GEM} />}
      grow={1}
    >
      <Container flexDirection="column" gap={12}>
        <Container flexDirection="row" gap={10}>
          <Stat label="FPS" valueRef={fpsRef} />
          <Stat label="GPU" unit="ms" valueRef={gpuRef} />
          <Stat label="MEM" unit="MB" valueRef={memRef} />
        </Container>
        <Container flexDirection="row" gap={10}>
          <Stat label="DRAWS" valueRef={drawRef} />
          <Stat label="TRIS" valueRef={triRef} />
          {/* spacer keeps the 3-column grid aligned across both rows */}
          <Container flexGrow={1} flexBasis={0} />
        </Container>
      </Container>
    </Tile>
  )
}

/** Output level: the meter stays a live fake-EQ animation (random transients + exponential
 *  decay, amethyst→ruby fill). Only the dB READOUT changed — it now tracks the Volume slider
 *  across a MIN_DB..MAX_DB scale (Boost nudges it louder) instead of measuring the animated
 *  level, so the number reflects what you set, not what the meter is doing. */
function OutputCard() {
  const meterRef = useRef<VanillaProgress>(null)
  const readRef = useRef<VanillaText>(null)
  const volume = useRef(0.65) // Volume slider position, 0..1 — loudness ceiling + readout
  const boost = useRef(false) // Boost switch — a little EQ gain + a nudge to the readout
  const t = useRef(0) // song time
  const level = useRef(0) // current EQ level 0..1 (drives the meter only)
  const nextBeat = useRef(0.2) // song time of the next transient
  const from = useMemo(() => new Color('#995bff'), [])
  const to = useMemo(() => new Color('#eb3c67'), [])
  const cur = useMemo(() => new Color(), [])
  const MIN_DB = -60
  const MAX_DB = 0
  // The dB readout tracks the SLIDER, not the meter: linear across MIN_DB..MAX_DB, Boost adds
  // a nudge. Imperative + slider-driven, so it never live-updates off the EQ animation.
  const paintReadout = () => {
    const setpoint = Math.min(1, volume.current + (boost.current ? 0.15 : 0))
    const db = MIN_DB + setpoint * (MAX_DB - MIN_DB)
    readRef.current?.setProperties({ text: `${db.toFixed(1)} dB` })
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    paintReadout()
  }, [])
  // Fake EQ: transients land at song-like random intervals — each snaps the level UP instantly
  // (fast attack), then it decays exponentially (slow fall-off). Volume sets the loudness
  // ceiling the hits scale to; Boost adds a little gain. Drives the meter (value + colour) only.
  useFrame((_, rawDelta) => {
    const dt = Math.min(0.05, rawDelta)
    t.current += dt
    level.current *= Math.exp(-2.4 * dt) // decay / fall-off (gentle, so it pulses not strobes)
    while (t.current >= nextBeat.current) {
      const r = Math.random()
      const peak = 0.4 + r * r * 0.6 // skew low, occasional near-full spike
      const gain = Math.min(1, volume.current * (boost.current ? 1.25 : 1))
      level.current = Math.min(1, Math.max(level.current, peak * gain))
      nextBeat.current += 0.45 + Math.random() * 0.6 // next hit 0.45–1.05s later (relaxed BPM)
    }
    // Floor the value so the fill never collapses into a deformed sliver at tiny widths.
    const value = Math.max(4, Math.round(level.current * 100))
    meterRef.current?.setProperties({ value })
    cur.copy(from).lerp(to, level.current)
    meterRef.current?.fill.setProperties({ backgroundColor: `#${cur.getHexString()}` })
  })
  return (
    <Tile
      title="Output level"
      hint="fake EQ · peak + decay · Boost = louder"
      icon={<Volume2 width={16} height={16} color={GEM} />}
    >
      <Row justifyContent="space-between">
        <Label>
          <Text fontSize={13}>Volume</Text>
        </Label>
        <Text ref={readRef} color={MUTED} fontSize={12}>
          -21.0 dB
        </Text>
      </Row>
      <Slider
        defaultValue={65}
        min={0}
        max={100}
        step={1}
        width="100%"
        onValueChange={(v: number) => {
          volume.current = v / 100
          paintReadout()
        }}
      />
      <Progress ref={meterRef} value={4} />
      <Row justifyContent="space-between">
        <Row gap={8}>
          <Zap width={14} height={14} color={GEM} />
          <Label>
            <Text fontSize={13}>Boost</Text>
          </Label>
        </Row>
        <Switch
          onCheckedChange={(on: boolean) => {
            boost.current = on
            paintReadout()
          }}
        />
      </Row>
    </Tile>
  )
}

/** Profile card that fakes an async load: a skeleton for ~5s, then the real
 *  profile. The refresh button replays the skeleton — Skeleton in its natural home. */
function ProfileCard() {
  const [loading, setLoading] = useState(true)
  const [nonce, setNonce] = useState(0)
  useEffect(() => {
    setLoading(true)
    const id = setTimeout(() => setLoading(false), 5000)
    return () => clearTimeout(id)
  }, [nonce])
  return (
    <Tile
      title="Profile"
      hint="Avatar · Input · Badge"
      icon={<User width={16} height={16} color={GEM} />}
      action={
        <Button
          variant="ghost"
          width={28}
          height={28}
          padding={0}
          borderRadius={8}
          justifyContent="center"
          alignItems="center"
          onClick={() => setNonce((n) => n + 1)}
        >
          <RotateCcw width={14} height={14} color={MUTED} />
        </Button>
      }
    >
      {/* full-width frame so the skeleton→loaded swap never resizes the card. The
          skeleton is a pixel placeholder for the real controls: avatar 52, name bar =
          Input's natural height 40, pills = badge height 20 — identical column so the
          reveal doesn't move anything. */}
      <Container minHeight={66} width="100%" justifyContent="center">
        {loading ? (
          <Row width="100%">
            <Skeleton width={52} height={52} borderRadius={999} />
            <Container flexDirection="column" gap={6} flexGrow={1}>
              <Skeleton width="100%" height={40} borderRadius={8} />
              <Row gap={6}>
                <Skeleton width={50} height={20} borderRadius={999} />
                <Skeleton width={58} height={20} borderRadius={999} />
              </Row>
            </Container>
          </Row>
        ) : (
          <Row width="100%">
            <Container
              width={52}
              height={52}
              borderRadius={999}
              backgroundColor={withOpacity(GEM, 0.22)}
              borderWidth={1}
              borderColor={withOpacity(GEM, 0.5)}
              justifyContent="center"
              alignItems="center"
            >
              <User width={26} height={26} color={GEM} />
            </Container>
            <Container flexDirection="column" gap={6} flexGrow={1}>
              <Input placeholder="Display name" defaultValue="Ranger" fontSize={14} width="100%" />
              <Row gap={6}>
                <Badge variant="secondary" height={20} alignItems="center" justifyContent="center">
                  <Text fontSize={11}>Lv 12</Text>
                </Badge>
                <Badge
                  flexDirection="row"
                  gap={4}
                  height={20}
                  alignItems="center"
                  justifyContent="center"
                >
                  <Star width={11} height={11} />
                  <Text fontSize={11}>Pro</Text>
                </Badge>
              </Row>
            </Container>
          </Row>
        )}
      </Container>
    </Tile>
  )
}

/** Video card with its OWN local play/pause state — toggling it re-renders only this
 *  card, never the whole gallery (which would reset other cards' imperative slider
 *  values via uikit's per-render resetProperties). */
function ReelCard() {
  const videoRef = useRef<VanillaVideo>(null)
  const [playing, setPlaying] = useState(false)
  const toggleVideo = () => {
    const el = videoRef.current?.video.element.peek()
    if (el == null) return
    if (el.paused) {
      void el.play()
      setPlaying(true)
    } else {
      el.pause()
      setPlaying(false)
    }
  }
  return (
    <Tile
      title="Reel"
      hint="Video · play / pause"
      icon={<Play width={16} height={16} color={GEM} />}
      grow={2}
    >
      <Container
        width="100%"
        height={130}
        borderRadius={6}
        overflow="hidden"
        backgroundColor="black"
      >
        {/* cover: fill the box exactly (keepAspectRatio false so it doesn't grow past
            the box and get its rounded bottom rect-clipped), crop via objectFit — all
            four of the video's own rounded corners land on the box edges. */}
        <Video
          ref={videoRef}
          src="./example.mp4"
          width="100%"
          height="100%"
          objectFit="cover"
          keepAspectRatio={false}
          controls={false}
          borderRadius={6}
        />
      </Container>
      <Button variant="secondary" gap={8} onClick={toggleVideo}>
        {playing ? <Pause width={15} height={15} /> : <Play width={15} height={15} />}
        <Text>{playing ? 'Pause' : 'Play'}</Text>
      </Button>
    </Tile>
  )
}

/** FAQ accordion — its own component; defaults to "Is it themed?" (value "2")
 *  expanded via the Accordion's openItemValue signal (no declarative default exists). */
function FaqCard() {
  const faqRef = useRef<ComponentRef<typeof Accordion>>(null)
  useEffect(() => {
    if (faqRef.current) faqRef.current.openItemValue.value = '2'
  }, [])
  return (
    <Tile
      title="FAQ"
      hint="Accordion"
      grow={2}
      icon={<CircleHelp width={16} height={16} color={GEM} />}
    >
      {/* minHeight reserves the one-item-open height so opening an accordion
          doesn't grow the card and shift the column. */}
      <Accordion ref={faqRef} minHeight={150}>
        <AccordionItem value="1">
          <AccordionTrigger>
            <Text fontSize={14}>Is it fast?</Text>
            <AccordionTriggerIcon />
          </AccordionTrigger>
          <AccordionContent>
            <Text color={MUTED} fontSize={13}>
              Very — WebGPU-rendered and sprite-batched.
            </Text>
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="2">
          <AccordionTrigger>
            <Text fontSize={14}>Is it themed?</Text>
            <AccordionTriggerIcon />
          </AccordionTrigger>
          <AccordionContent>
            <Text color={MUTED} fontSize={13}>
              Fully — token-driven, light and dark.
            </Text>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </Tile>
  )
}

/** Photo card — own component with a local image ref + slider handlers (opacity/radius
 *  set imperatively so dragging never re-renders). Opacity starts at 80%. */
function PhotoCard() {
  const imageRef = useRef<VanillaImage>(null)
  const opacityReadRef = useRef<VanillaText>(null)
  const setImgOpacity = (v: number) => {
    imageRef.current?.setProperties({ opacity: v / 100 })
    opacityReadRef.current?.setProperties({ text: `${Math.round(v)}%` })
  }
  const setImgRadius = (v: number) => {
    imageRef.current?.setProperties({ borderRadius: Math.round((v / 100) * 60) })
  }
  return (
    <Tile title="Photo" hint="Opacity · radius" icon={<Image width={16} height={16} color={GEM} />}>
      <Container
        width="100%"
        height={96}
        borderRadius={12}
        overflow="hidden"
        backgroundColor={INSET}
      >
        <UikitImage
          ref={imageRef}
          src="https://picsum.photos/seed/flatland/640/360"
          width="100%"
          height="100%"
          objectFit="cover"
          keepAspectRatio={false}
          opacity={0.8}
          borderRadius={12}
        />
      </Container>
      <Row justifyContent="space-between">
        <Label>
          <Text fontSize={12}>Opacity</Text>
        </Label>
        <Text ref={opacityReadRef} color={MUTED} fontSize={12}>
          80%
        </Text>
      </Row>
      <Slider
        defaultValue={80}
        min={10}
        max={100}
        step={1}
        width="100%"
        onValueChange={setImgOpacity}
      />
      <Row gap={10}>
        <Label>
          <Text fontSize={12}>Radius</Text>
        </Label>
        <Slider
          defaultValue={20}
          min={0}
          max={100}
          step={1}
          flexGrow={1}
          onValueChange={setImgRadius}
        />
      </Row>
    </Tile>
  )
}

function DifficultyCard() {
  return (
    <Tile title="Difficulty" hint="RadioGroup" icon={<Target width={16} height={16} color={GEM} />}>
      <RadioGroup defaultValue="normal" flexDirection="column" gap={10}>
        {['Easy', 'Normal', 'Hardcore'].map((d) => (
          <RadioGroupItem key={d} value={d.toLowerCase()}>
            <Text color={WHITE} fontSize={14}>
              {d}
            </Text>
          </RadioGroupItem>
        ))}
      </RadioGroup>
    </Tile>
  )
}

const GEMS = [
  { name: 'amethyst', color: '#995bff' },
  { name: 'emerald', color: '#12b981' },
  { name: 'ruby', color: '#eb3c67' },
  { name: 'gold', color: '#e0a100' },
]

/** Swatches set the app-wide GEM accent signal, recoloring every color={GEM}
 *  icon/chip/border across the gallery. Only the accent NAME text needs a ref. */
function PaletteCard() {
  const accentTextRef = useRef<VanillaText>(null)
  const setAccent = (g: { name: string; color: string }) => {
    GEM.value = g.color
    accentTextRef.current?.setProperties({ text: g.name })
  }
  return (
    <Tile
      title="Palette"
      hint="Swatches recolor the showcase"
      icon={<Palette width={16} height={16} color={GEM} />}
    >
      <Row gap={8}>
        {GEMS.map((g) => (
          <Button
            key={g.name}
            variant="ghost"
            padding={0}
            width={28}
            height={28}
            borderRadius={999}
            backgroundColor={g.color}
            active={{ transformScale: 0.9 }}
            onClick={() => setAccent(g)}
          />
        ))}
      </Row>
      <Row gap={12}>
        <Container width={46} height={46} borderRadius={12} backgroundColor={GEM} />
        <Container flexDirection="column" gap={6} flexGrow={1}>
          <Badge backgroundColor={GEM}>
            <Text fontSize={11}>accent</Text>
          </Badge>
          <Text ref={accentTextRef} fontSize={13} color={GEM}>
            amethyst
          </Text>
        </Container>
      </Row>
    </Tile>
  )
}

function NotesCard() {
  return (
    <Tile
      title="Notes"
      hint="Textarea · Checkbox"
      icon={<FileText width={16} height={16} color={GEM} />}
    >
      <Textarea width="100%" placeholder="Write a note…" />
      <Row gap={10}>
        <Checkbox defaultChecked={true} />
        <Label>
          <Text fontSize={13}>Render as markdown</Text>
        </Label>
      </Row>
    </Tile>
  )
}

function FormatCard() {
  return (
    <Tile
      title="Format"
      hint="ToggleGroup · Toggle"
      icon={<Bold width={16} height={16} color={GEM} />}
    >
      <ToggleGroup>
        <ToggleGroupItem>
          <Bold width={16} height={16} />
        </ToggleGroupItem>
        <ToggleGroupItem defaultChecked={true}>
          <Italic width={16} height={16} />
        </ToggleGroupItem>
        <ToggleGroupItem>
          <Underline width={16} height={16} />
        </ToggleGroupItem>
      </ToggleGroup>
      <Row gap={8}>
        <Toggle>
          <Star width={15} height={15} />
        </Toggle>
        <Label>
          <Text fontSize={13} color={MUTED}>
            Favorite
          </Text>
        </Label>
      </Row>
    </Tile>
  )
}

function AppearanceCard() {
  return (
    <Tile
      title="Appearance"
      hint="Theme · light / dark"
      icon={<Sun width={16} height={16} color={GEM} />}
    >
      <Row justifyContent="space-between">
        <Row gap={8}>
          <Moon width={15} height={15} color={MUTED} />
          <Label>
            <Text fontSize={13}>Dark mode</Text>
          </Label>
        </Row>
        <Switch
          defaultChecked={true}
          onCheckedChange={(on: boolean) => setPreferredColorScheme(on ? 'dark' : 'light')}
        />
      </Row>
      <Text color={MUTED} fontSize={11}>
        Every card re-themes from tokens — both modes stay saturated.
      </Text>
    </Tile>
  )
}

/** Resize demo — local refs; the slider imperatively grows a panel's height. */
function ResizeCard() {
  const heightPanelRef = useRef<VanillaContainer>(null)
  const heightReadRef = useRef<VanillaText>(null)
  const setPanelHeight = (v: number) => {
    const h = Math.round(20 + (v / 100) * 120)
    heightPanelRef.current?.setProperties({ height: h })
    heightReadRef.current?.setProperties({ text: `${h}px` })
  }
  return (
    <Tile
      title="Resize"
      hint="Slider drives the panel height"
      icon={<Maximize2 width={16} height={16} color={GEM} />}
    >
      <Container
        ref={heightPanelRef}
        width="100%"
        height={64}
        borderRadius={10}
        backgroundColor={withOpacity(GEM, 0.35)}
        borderWidth={1}
        borderColor={withOpacity(GEM, 0.6)}
      />
      <Row justifyContent="space-between">
        <Label>
          <Text fontSize={12}>Height</Text>
        </Label>
        <Text ref={heightReadRef} color={MUTED} fontSize={12}>
          64px
        </Text>
      </Row>
      <Slider
        defaultValue={38}
        min={0}
        max={100}
        step={1}
        width="100%"
        onValueChange={setPanelHeight}
      />
    </Tile>
  )
}

function NavigateCard() {
  return (
    <Tile
      title="Navigate"
      hint="Tabs · Pagination"
      icon={<Compass width={16} height={16} color={GEM} />}
    >
      <Tabs defaultValue="a">
        <TabsList width="100%">
          <TabsTrigger value="a" flexGrow={1}>
            <Text>Overview</Text>
          </TabsTrigger>
          <TabsTrigger value="b" flexGrow={1}>
            <Text>Detail</Text>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="a" flexDirection="column">
          <Text color={MUTED} fontSize={13}>
            Resolution-independent, one draw path.
          </Text>
        </TabsContent>
        <TabsContent value="b" flexDirection="column">
          <Text color={MUTED} fontSize={13}>
            Every card here batches into the same pipeline.
          </Text>
        </TabsContent>
      </Tabs>
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious />
          </PaginationItem>
          <PaginationItem>
            <PaginationLink>
              <Text>1</Text>
            </PaginationLink>
          </PaginationItem>
          <PaginationItem>
            <PaginationLink isActive>
              <Text>2</Text>
            </PaginationLink>
          </PaginationItem>
          <PaginationItem>
            <PaginationEllipsis />
          </PaginationItem>
          <PaginationItem>
            <PaginationNext />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </Tile>
  )
}

/** Notices card — the triggers only. The dialog/alert signals are owned by
 *  BentoGallery and passed in, because the modals themselves MUST render at the
 *  <Fullscreen> root (see NoticesModals), not inside this column. */
function NoticesCard({
  dialog,
  alert,
}: {
  dialog: Signal<VanillaDialog | undefined>
  alert: Signal<VanillaAlertDialog | undefined>
}) {
  return (
    <Tile
      title="Notices"
      hint="Alert · Dialog · Tooltip"
      icon={<Info width={16} height={16} color={GEM} />}
    >
      <Alert>
        <AlertTitle>
          <Text fontSize={14}>Heads up</Text>
        </AlertTitle>
        <AlertDescription>
          <Text color={MUTED} fontSize={12}>
            Modals, tooltips — all in-scene.
          </Text>
        </AlertDescription>
      </Alert>
      <Row gap={8}>
        <Tooltip flexGrow={1} flexBasis={0}>
          <TooltipTrigger flexGrow={1}>
            <Button variant="outline" width="100%">
              <Text>Hover</Text>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <Text>In-scene tooltip</Text>
          </TooltipContent>
        </Tooltip>
        <DialogTrigger dialog={dialog} flexGrow={1} flexBasis={0}>
          <Button variant="outline" width="100%">
            <Text>Dialog</Text>
          </Button>
        </DialogTrigger>
        <AlertDialogTrigger dialog={alert} flexGrow={1} flexBasis={0}>
          <Button variant="outline" width="100%">
            <Text>Alert</Text>
          </Button>
        </AlertDialogTrigger>
      </Row>
    </Tile>
  )
}

/** The Notices modals — MUST render at the <Fullscreen> root, NOT inside a column:
 *  uikit dialogs size/position relative to their parent, so nesting them in a
 *  quarter-width column shrinks them. BentoGallery renders this as a Fullscreen child. */
function NoticesModals({
  dialog,
  alert,
}: {
  dialog: Signal<VanillaDialog | undefined>
  alert: Signal<VanillaAlertDialog | undefined>
}) {
  return (
    <>
      <Dialog ref={(d) => void (dialog.value = d ?? undefined)}>
        <DialogContent sm={{ maxWidth: 420 }}>
          <DialogHeader>
            <DialogTitle>
              <Text>Edit profile</Text>
            </DialogTitle>
            <DialogDescription>
              <Text>Make changes here, then save.</Text>
            </DialogDescription>
          </DialogHeader>
          <Container flexDirection="column" gap={10} paddingY={12}>
            <Input placeholder="Name" defaultValue="Ranger" width="100%" />
            <Input placeholder="Handle" defaultValue="@ranger" width="100%" />
          </Container>
          <DialogFooter>
            <Button>
              <Text>Save</Text>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog ref={(d) => void (alert.value = d ?? undefined)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              <Text>Are you sure?</Text>
            </AlertDialogTitle>
            <AlertDialogDescription>
              <Text>This cannot be undone.</Text>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              <Text>Cancel</Text>
            </AlertDialogCancel>
            <AlertDialogAction>
              <Text>Continue</Text>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function BentoGallery({ font, fontBold }: { font: SlugFont; fontBold: SlugFont }) {
  // Owned here (not in NoticesCard) so the modals can render at the Fullscreen root.
  const dialog = useMemo(() => signal<VanillaDialog | undefined>(undefined), [])
  const alert = useMemo(() => signal<VanillaAlertDialog | undefined>(undefined), [])
  return (
    <Fullscreen
      flexDirection="row"
      gap={GAP}
      padding={PAD}
      backgroundColor={SURFACE}
      fontFamilies={{ inter: { normal: font, bold: fontBold } }}
    >
      {/* ── Column A ── */}
      <Col>
        <SlugCard />
        <ProfileCard />
        <DifficultyCard />
      </Col>

      {/* ── Column B ── */}
      <Col>
        <PerfCard />
        <OutputCard />
        <PaletteCard />
        <NotesCard />
      </Col>

      {/* ── Column C ── */}
      <Col>
        <ReelCard />
        <FormatCard />
        <PhotoCard />
        <AppearanceCard />
      </Col>

      {/* ── Column D ── */}
      <Col>
        <FaqCard />
        <ResizeCard />
        <NavigateCard />
        <NoticesCard dialog={dialog} alert={alert} />
      </Col>

      {/* modals live at the Fullscreen root so they overlay the whole screen */}
      <NoticesModals dialog={dialog} alert={alert} />
    </Fullscreen>
  )
}

/** HTML loading splash (outside the Canvas): a large bold Inter-700 "uikit" pulsing
 *  in the centre on near-black. Fades out once the scene has drawn a few frames. */
function LoadingSplash({ hidden }: { hidden: boolean }) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'grid',
        placeItems: 'center',
        background: '#0b0d11',
        zIndex: 10,
        pointerEvents: 'none',
        opacity: hidden ? 0 : 1,
        transition: 'opacity 500ms ease',
      }}
    >
      <style>{`
        @font-face {
          font-family: 'InterSplash';
          src: url('${import.meta.env.BASE_URL}Inter-Bold.woff') format('woff');
          font-weight: 700;
          font-display: block; /* keep the word invisible until real Inter 700 loads — no FOUT */
        }
        @keyframes uikitSplashPulse { 0%, 100% { opacity: 0.8 } 50% { opacity: 1 } }
        @media (prefers-reduced-motion: reduce) {
          .uikit-splash-word { animation: none !important; opacity: 0.85 }
        }
      `}</style>
      <span
        className="uikit-splash-word"
        style={{
          fontFamily: "'InterSplash', Inter, system-ui, sans-serif",
          fontWeight: 700,
          fontSize: 'clamp(72px, 13vw, 180px)',
          letterSpacing: '-0.05em',
          color: '#f5f6fa',
          animation: 'uikitSplashPulse 2.2s ease-in-out infinite',
        }}
      >
        uikit
      </span>
    </div>
  )
}

/** Fires once the renderer has drawn a few frames — the cue to fade the splash. */
function ReadySignal({ onReady }: { onReady: () => void }) {
  const frames = useRef(0)
  useFrame(() => {
    frames.current += 1
    if (frames.current === 3) onReady()
  })
  return null
}

/**
 * three.js' built-in WebGPU Inspector (r180+): per-pass GPU timings, scene
 * graph, and console, overlaid on the canvas. Assigning `renderer.inspector`
 * turns on `trackTimestamp` and mounts the panel next to the canvas; the
 * renderer then drives it from the render loop — no per-frame wiring needed.
 * The `__inspector` guard makes it idempotent under StrictMode's double-mount.
 */
function ThreeInspector() {
  const gl = useThree((s) => s.gl)
  useEffect(() => {
    // Opt-in only: ?inspector=true. Keeps the showcase clean by default while
    // letting anyone summon three's GPU/scene inspector on demand.
    if (new URLSearchParams(window.location.search).get('inspector') !== 'true') return
    const renderer = gl as unknown as { inspector: Inspector; __inspector?: boolean }
    if (renderer.__inspector) return
    renderer.__inspector = true
    const inspector = new Inspector()
    renderer.inspector = inspector
    // three auto-mounts the panel from Inspector.init(), appending it to
    // renderer.domElement.parentElement. Under R3F that first runs before the
    // canvas is attached to its container (parentElement null -> append skipped),
    // so re-run it on the next frame, when the canvas is in the DOM. init() is
    // idempotent: it no-ops once the panel already has a parent.
    requestAnimationFrame(() => inspector.init())
  }, [gl])
  return null
}

function BentoApp({ onReady }: { onReady: () => void }) {
  const font = useSlugFont('./Inter-Regular.ttf')
  // real Inter 700 (WOFF 1.0, which opentype.js parses) so fontWeight="bold" renders
  // true bold with proper kerning instead of faux-bolding the 400 outline.
  const fontBold = useSlugFont('./Inter-Bold.woff')
  return (
    <>
      <BentoGallery font={font} fontBold={fontBold} />
      <ReadySignal onReady={onReady} />
    </>
  )
}

export default function App() {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    // Safety net: never let the loading splash stick if the ready signal is missed.
    const id = setTimeout(() => setReady(true), 6000)
    return () => clearTimeout(id)
  }, [])
  return (
    <>
      {/* frameloop="always" keeps every useFrame ticking (live perf readout + breathing
          hero) without a manual invalidate loop. R3F v10 only dispatches to JSX-prop
          handlers; uikit's Slider/Textarea drag via imperative Object3D listeners +
          pointer capture — so events={noEvents} turns off R3F's dispatcher and
          <PointerEvents/> routes DOM events through @pmndrs/pointer-events instead. */}
      <Canvas
        events={noEvents}
        frameloop="always"
        renderer={{ trackTimestamp: true }}
        style={{ height: '100dvh', touchAction: 'none' }}
      >
        <color attach="background" args={[INK]} />
        <ambientLight intensity={0.5} />
        <directionalLight intensity={0} position={[5, 1, 10]} />
        <PointerEvents />
        <ThreeInspector />
        <Suspense fallback={null}>
          <BentoApp onReady={() => setReady(true)} />
        </Suspense>
      </Canvas>
      <LoadingSplash hidden={ready} />
    </>
  )
}
