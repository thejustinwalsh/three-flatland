import { Suspense, useEffect, useMemo, useRef } from 'react'
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

export type PipCorner = 'tl' | 'tr' | 'br' | 'bl'

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
  /** Current corner; click anywhere = hop to next corner. */
  corner: PipCorner
  onChangeCorner(next: PipCorner): void
  /**
   * Pixel-art filtering. When true, the shared atlas texture's
   * min/mag filter switches to `NearestFilter` (which propagates to
   * the main canvas, since both share the cached texture instance via
   * `useLoader`) and the fit math snaps to integer scale ratios so a
   * single source pixel maps to an integer count of screen pixels.
   */
  pixelArt?: boolean
}

const CORNERS: PipCorner[] = ['tl', 'tr', 'br', 'bl']
function nextCorner(c: PipCorner): PipCorner {
  return CORNERS[(CORNERS.indexOf(c) + 1) % CORNERS.length]!
}

const PIP_SIZE = 120
const TRANSPORT_HEIGHT = 14
const PIP_INSET = 8
const PIP_INNER_SIZE = PIP_SIZE - TRANSPORT_HEIGHT - 2 // 2 = top/bottom border

const s = stylex.create({
  shell: {
    position: 'absolute',
    width: PIP_SIZE,
    height: PIP_SIZE,
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
  cornerTl: { top: PIP_INSET, left: PIP_INSET },
  cornerTr: { top: PIP_INSET, right: PIP_INSET },
  cornerBr: { bottom: PIP_INSET, right: PIP_INSET },
  cornerBl: { bottom: PIP_INSET, left: PIP_INSET },
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
  meta: {
    marginInlineStart: 'auto',
    opacity: 0.7,
  },
})

/**
 * Pick the largest pixel-perfect scale that fits a `frameMax` size
 * inside `inner`. Integer ratios when zooming up (1×, 2×, 3×…),
 * unit-fractions when zooming down (1/2, 1/3, 1/4…). Always tries 1×
 * first; only scales if the frame doesn't natively fit.
 */
function pixelPerfectScale(frameMax: number, inner: number): number {
  if (frameMax <= 0) return 1
  const fit = inner / frameMax
  if (fit >= 1) return Math.max(1, Math.floor(fit))
  return 1 / Math.ceil(1 / fit)
}

/**
 * Inner R3F scene — loads the atlas texture, applies the current
 * filter, and renders one Sprite2D centered + scaled to show the
 * active frame. Three.js camera ortho-fits the frame at the chosen
 * scale; canvas pixel size stays fixed (PIP_INNER_SIZE) so the
 * resulting screen-px-per-image-px ratio is exactly `scale`.
 */
function PipScene({
  imageUri,
  frame,
  pixelArt,
}: {
  imageUri: string
  frame: { x: number; y: number; w: number; h: number; atlasW: number; atlasH: number }
  pixelArt: boolean
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

  // Compute pixel-perfect scale + the ortho viewSize that yields it.
  // viewSize × scale = canvas pixel size → viewSize = inner / scale.
  const frameMax = Math.max(frame.w, frame.h)
  const scale = pixelArt
    ? pixelPerfectScale(frameMax, PIP_INNER_SIZE)
    : Math.min(PIP_INNER_SIZE / frame.w, PIP_INNER_SIZE / frame.h)
  const viewSize = PIP_INNER_SIZE / scale

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
    corner, onChangeCorner,
    pixelArt = false,
  } = props

  const onShellClickRef = useRef<((target: HTMLElement) => void) | null>(null)
  onShellClickRef.current = (target) => {
    if (target.closest('[data-pip-transport]')) return
    onChangeCorner(nextCorner(corner))
  }

  if (!animationName || frames.length === 0 || !atlasImageUri || !atlasSize) return null

  const cornerStyle =
    corner === 'tl' ? s.cornerTl :
    corner === 'tr' ? s.cornerTr :
    corner === 'br' ? s.cornerBr : s.cornerBl

  const currentName = frames[Math.min(playhead, frames.length - 1)]!
  const rect = rectsByName[currentName]
  const frame = rect
    ? { x: rect.x, y: rect.y, w: rect.w, h: rect.h, atlasW: atlasSize.w, atlasH: atlasSize.h }
    : null

  return (
    <div
      {...stylex.props(s.shell, cornerStyle)}
      onClick={(e) => onShellClickRef.current?.(e.target as HTMLElement)}
      title="Click to move corner"
    >
      <div {...stylex.props(s.body)}>
        {frame ? (
          <Canvas
            dpr={1}
            renderer={{ antialias: false }}
            style={{ position: 'absolute', inset: 0, background: 'transparent' }}
          >
            <Suspense fallback={null}>
              <PipScene imageUri={atlasImageUri} frame={frame} pixelArt={pixelArt} />
            </Suspense>
          </Canvas>
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
        <span {...stylex.props(s.meta)}>{playhead + 1}/{frames.length}</span>
      </div>
    </div>
  )
}
