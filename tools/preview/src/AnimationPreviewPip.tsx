import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import * as stylex from '@stylexjs/stylex'
import { Canvas, extend, useLoader, useThree } from '@react-three/fiber/webgpu'
import {
  NearestFilter,
  LinearFilter,
  type OrthographicCamera as ThreeOrthographicCamera,
  type Texture,
} from 'three'
import { Sprite2D, TextureLoader } from 'three-flatland/react'
import { vscode } from '@three-flatland/design-system/tokens/vscode-theme.stylex'
import { space } from '@three-flatland/design-system/tokens/space.stylex'
import { radius } from '@three-flatland/design-system/tokens/radius.stylex'
import type { Rect } from './RectOverlay'

extend({ Sprite2D })

/** Retained for back-compat callers; the PIP itself is pinned to TR. */
export type PipCorner = 'tl' | 'tr' | 'br' | 'bl'

/** Sprite scale toggled via the PIP transport bar — cycles 1 → 2 → 4. */
export type AnimationPipScale = 1 | 2 | 4

export type AnimationPreviewPipProps = {
  /** Active animation name; renders nothing when null. */
  animationName: string | null
  /** Frame names in playback order (with duplicates). */
  frames: readonly string[]
  /** Rect lookup for thumbnail positioning. */
  rectsByName: Record<string, Rect>
  atlasImageUri: string | null
  atlasSize: { w: number; h: number } | null
  /** Current playhead index (post-duplication). */
  playhead: number
  isPlaying: boolean
  onTogglePlay(): void
  /**
   * Pixel-art filtering. When true, the shared atlas texture's
   * min/mag filter switches to `NearestFilter` (which propagates to
   * the main canvas, since both share the cached texture instance via
   * `useLoader`) and the fit math snaps to integer scale ratios so a
   * single source pixel maps to an integer count of screen pixels.
   */
  pixelArt?: boolean
  /**
   * When true (canvas pan-mode active or space held), the PIP fades
   * + drops pointer events so it doesn't eat the user's pan gesture
   * over the area beneath it.
   */
  panMode?: boolean
  /**
   * Sprite render scale (screen px per source px). Drives the PIP box
   * size: `box ≈ max(MIN_INNER, frameMax × scale)`. Defaults to 1.
   */
  pipScale?: AnimationPipScale
  /** Click handler for the scale toggle in the transport bar. */
  onCycleScale?(): void
  /**
   * Per-frame event tags from the active animation's `events` block,
   * keyed by post-duplication frame index. When the playhead lands on
   * a tagged frame, the PIP surfaces the tag as a yellow flag in the
   * top-left of the body (matching the editor's event badge styling).
   */
  events?: Record<string, string>
}

const TRANSPORT_HEIGHT = 14
const PIP_INSET = 8
// Floor the box at this width even when the sprite × scale would be
// smaller — keeps tiny sprites readable and gives the transport bar
// enough room for the play/scale/name controls.
const MIN_INNER_SIZE = 80
// Cap the box so a giant atlas frame at 4× doesn't grow the PIP off-
// screen. Empirical comfortable max for the corner overlay slot.
const MAX_INNER_SIZE = 320

const s = stylex.create({
  shell: {
    // Width / height are set inline now (depend on the active frame
    // size × user-chosen `pipScale`, floored at MIN_INNER_SIZE).
    position: 'absolute',
    backgroundColor: vscode.bg,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: vscode.focusRing,
    borderRadius: radius.sm,
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
    display: 'flex',
    flexDirection: 'column',
    cursor: 'pointer',
    overflow: 'hidden',
    userSelect: 'none',
    zIndex: 3,
  },
  // PIP is pinned to the top-right of the canvas — every other
  // corner conflicts with existing UI (InfoPanel, HoverFrameChip,
  // zoom badge). Kept as a stylex variant to make a future "user-
  // movable" mode trivial to add back.
  cornerTr: { top: PIP_INSET, right: PIP_INSET },
  body: {
    flex: 1,
    backgroundImage:
      'conic-gradient(var(--vscode-editorWidget-background) 90deg, var(--vscode-editor-background) 0 180deg, var(--vscode-editorWidget-background) 0 270deg, var(--vscode-editor-background) 0)',
    backgroundSize: '12px 12px',
    backgroundRepeat: 'repeat',
    position: 'relative',
  },
  bar: {
    height: TRANSPORT_HEIGHT,
    paddingInline: space.sm,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    color: vscode.fg,
    display: 'flex',
    alignItems: 'center',
    gap: space.sm,
    fontSize: '9px',
    fontFamily: vscode.monoFontFamily,
  },
  play: {
    color: vscode.focusRing,
    fontWeight: 700,
    cursor: 'pointer',
  },
  // Inline button for cycling the sprite scale. Compact, monospaced,
  // sits in the transport bar between the animation name and the
  // frame count. Click cycles 1× → 2× → 4× → 1×.
  scaleBtn: {
    color: vscode.fg,
    cursor: 'pointer',
    paddingInline: space.xs,
    borderRadius: radius.sm,
    backgroundColor: { default: 'transparent', ':hover': 'rgba(255, 255, 255, 0.12)' },
    fontFamily: vscode.monoFontFamily,
    opacity: 0.8,
  },
  meta: {
    marginInlineStart: 'auto',
    opacity: 0.7,
  },
  // Event flag badge — mirrors the editor timeline's `eventBadge`
  // styling (black translucent pill, yellow text). Sits at the top-
  // left of the body so the sprite below stays unobscured.
  //
  // Visibility model: the badge renders for ~500 ms regardless of how
  // long the underlying frame is on screen, so single-frame events at
  // 60 fps (16 ms each) still get a chance to be read. New events
  // arriving mid-fade stomp the old one instantly via React `key`
  // change (remount → animation replays from 0).
  //
  // Keyframes: pop-in (0–8%), hold visible (8–60%), fade out (60–100%).
  // Total 500 ms = ~40 ms pop-in, ~260 ms hold, ~200 ms fade.
  eventFlag: {
    position: 'absolute',
    top: space.xs,
    left: space.xs,
    paddingInline: space.xs,
    paddingBlock: 0,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    color: '#ffd060',
    fontSize: '9px',
    lineHeight: 1.4,
    fontFamily: vscode.monoFontFamily,
    pointerEvents: 'none',
    maxWidth: '85%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    animationName: stylex.keyframes({
      '0%': { opacity: 0, transform: 'translateY(-2px) scale(0.96)' },
      '8%': { opacity: 1, transform: 'translateY(0) scale(1)' },
      '60%': { opacity: 1, transform: 'translateY(0) scale(1)' },
      '100%': { opacity: 0, transform: 'translateY(0) scale(1)' },
    }),
    animationDuration: '500ms',
    animationTimingFunction: 'ease-out',
    animationFillMode: 'forwards',
  },
})

/**
 * Inner R3F scene — loads the atlas texture, applies the current
 * filter, and renders one Sprite2D centered + scaled to show the
 * active frame. The orthographic frustum is sized so each source pixel
 * maps to exactly `pipScale` screen pixels: `viewSize = innerSize /
 * pipScale`. When the sprite × scale is smaller than `MIN_INNER_SIZE`,
 * the PIP body is floored at the minimum and the sprite renders
 * centered with empty space around it.
 */
function PipScene({
  imageUri,
  frame,
  pixelArt,
  innerSize,
  pipScale,
}: {
  imageUri: string
  frame: { x: number; y: number; w: number; h: number; atlasW: number; atlasH: number }
  pixelArt: boolean
  innerSize: number
  pipScale: AnimationPipScale
}) {
  const texture = useLoader(TextureLoader, imageUri) as Texture
  const set = useThree((s) => s.set)

  // Apply nearest / linear filter on the shared texture instance —
  // useLoader caches by URL, so the main canvas (ThreeLayer) sees this
  // same Texture and inherits the filter automatically. No additional
  // plumbing needed to keep the two views in sync.
  useEffect(() => {
    const f = pixelArt ? NearestFilter : LinearFilter
    if (texture.magFilter !== f || texture.minFilter !== f) {
      texture.magFilter = f
      texture.minFilter = f
      texture.needsUpdate = true
    }
  }, [texture, pixelArt])

  const viewSize = innerSize / pipScale

  // Build the SpriteFrame in normalized atlas coords. SpriteFrame's
  // y is in BOTTOM-LEFT origin (matches three.js texture UV convention
  // — see SpriteSheetLoader.ts which does the same flip), but our
  // editor-side rect coords are TOP-LEFT (DOM/image convention). Flip
  // y on the way in so the sampled region lands on the right pixels.
  const spriteFrame = useMemo(() => {
    const normalizedHeight = frame.h / frame.atlasH
    return {
      name: 'pip',
      x: frame.x / frame.atlasW,
      y: 1 - (frame.y / frame.atlasH) - normalizedHeight,
      width: frame.w / frame.atlasW,
      height: normalizedHeight,
      sourceWidth: frame.w,
      sourceHeight: frame.h,
    }
  }, [frame.x, frame.y, frame.w, frame.h, frame.atlasW, frame.atlasH])

  return (
    <>
      <orthographicCamera
        ref={(cam: ThreeOrthographicCamera | null) => {
          if (!cam) return
          cam.left = -viewSize / 2
          cam.right = viewSize / 2
          cam.top = viewSize / 2
          cam.bottom = -viewSize / 2
          ;(cam as unknown as { manual: boolean }).manual = true
          cam.near = 0.1
          cam.far = 1000
          cam.position.set(0, 0, 100)
          cam.updateProjectionMatrix()
          set({ camera: cam })
        }}
      />
      <sprite2D
        texture={texture}
        frame={spriteFrame}
        anchor={[0.5, 0.5]}
        scale={[frame.w, frame.h, 1]}
        pixelPerfect={pixelArt}
      />
    </>
  )
}

/**
 * Floating preview window inside the canvas. Click anywhere on the PIP
 * (other than the transport ▶/⏸) to hop corners. Body is a real
 * three-flatland render — same engine, same texture, same filter as
 * the main canvas. Edits to the frame's rect propagate next frame.
 */
export function AnimationPreviewPip(props: AnimationPreviewPipProps) {
  const {
    animationName, frames, rectsByName, atlasImageUri, atlasSize,
    playhead, isPlaying, onTogglePlay,
    pixelArt = false,
    panMode = false,
    pipScale = 1,
    onCycleScale,
    events,
  } = props

  if (!animationName || frames.length === 0 || !atlasImageUri || !atlasSize) return null

  const currentFrameIndex = Math.min(playhead, frames.length - 1)
  const currentName = frames[currentFrameIndex]!
  const rect = rectsByName[currentName]
  const frame = rect
    ? { x: rect.x, y: rect.y, w: rect.w, h: rect.h, atlasW: atlasSize.w, atlasH: atlasSize.h }
    : null
  // Event tag for the current playhead frame, if any. Keyed by frame
  // index (as string, matching the sidecar storage shape). The
  // editor's timeline uses the same lookup pattern.
  const currentEvent = events?.[String(currentFrameIndex)] ?? null

  // Latched event display: every time the playhead lands on a tagged
  // frame we capture (text, stamp). The badge below renders against
  // this latch — not `currentEvent` directly — so it survives the
  // playhead moving off the tag and gets a chance to fade out cleanly.
  // New events stomp the latch instantly via React `key` so the badge
  // remounts and its keyframes replay from frame 0. The `onAnimationEnd`
  // handler clears the latch at fade completion so the DOM doesn't
  // hold a 0-opacity badge forever.
  const [eventLatch, setEventLatch] = useState<{ text: string; stamp: number } | null>(null)
  const stampRef = useRef(0)

  useEffect(() => {
    if (currentEvent) {
      stampRef.current += 1
      setEventLatch({ text: currentEvent, stamp: stampRef.current })
    }
  }, [currentEvent, currentFrameIndex])

  // Reset on animation switch — leftover badge from the previous
  // animation would otherwise linger over the new sprite.
  useEffect(() => {
    setEventLatch(null)
  }, [animationName])

  // Box size is `frame.maxDim × pipScale`, floored at MIN_INNER_SIZE
  // (so tiny sprites still get a usable widget) and capped at
  // MAX_INNER_SIZE (so huge frames at 4× don't run off the canvas).
  // When the floor kicks in, the sprite renders centered with empty
  // space around it — the camera frustum widens to inner / pipScale.
  const frameMax = frame ? Math.max(frame.w, frame.h) : 0
  const innerSize = Math.max(
    MIN_INNER_SIZE,
    Math.min(MAX_INNER_SIZE, frameMax * pipScale),
  )
  const outerWidth = innerSize + 2 // 1px L + 1px R border
  const outerHeight = innerSize + TRANSPORT_HEIGHT + 2

  return (
    <div
      {...stylex.props(s.shell, s.cornerTr)}
      style={{
        width: outerWidth,
        height: outerHeight,
        opacity: panMode ? 0.25 : 1,
        pointerEvents: panMode ? 'none' : undefined,
        transition: 'opacity 120ms',
      }}
    >
      <div {...stylex.props(s.body)}>
        {frame ? (
          <Canvas
            dpr={1}
            renderer={{ antialias: false }}
            style={{ position: 'absolute', inset: 0, background: 'transparent' }}
          >
            <Suspense fallback={null}>
              <PipScene
                imageUri={atlasImageUri}
                frame={frame}
                pixelArt={pixelArt}
                innerSize={innerSize}
                pipScale={pipScale}
              />
            </Suspense>
          </Canvas>
        ) : null}
        {eventLatch ? (
          <div
            key={eventLatch.stamp}
            {...stylex.props(s.eventFlag)}
            onAnimationEnd={() => {
              // Only clear if no newer event has stomped the latch
              // since this render — guard against a race where a
              // fresh event lands during the previous fade.
              setEventLatch((cur) => (cur && cur.stamp === eventLatch.stamp ? null : cur))
            }}
          >
            ⚑ {eventLatch.text}
          </div>
        ) : null}
      </div>
      <div {...stylex.props(s.bar)}>
        <span
          data-pip-transport=""
          {...stylex.props(s.play)}
          onClick={(e) => { e.stopPropagation(); onTogglePlay() }}
        >
          {isPlaying ? '⏸' : '▶'}
        </span>
        <span>{animationName}</span>
        {onCycleScale ? (
          <span
            data-pip-transport=""
            role="button"
            aria-label={`Cycle PIP scale (currently ${pipScale}×)`}
            title={`Sprite scale: ${pipScale}× — click to cycle`}
            {...stylex.props(s.scaleBtn)}
            onClick={(e) => { e.stopPropagation(); onCycleScale() }}
          >
            {pipScale}×
          </span>
        ) : null}
        <span {...stylex.props(s.meta)}>{playhead + 1}/{frames.length}</span>
      </div>
    </div>
  )
}
