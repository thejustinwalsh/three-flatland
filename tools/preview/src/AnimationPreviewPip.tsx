import type { CSSProperties, MouseEvent as ReactMouseEvent } from 'react'
import * as stylex from '@stylexjs/stylex'
import { vscode } from '@three-flatland/design-system/tokens/vscode-theme.stylex'
import { space } from '@three-flatland/design-system/tokens/space.stylex'
import { radius } from '@three-flatland/design-system/tokens/radius.stylex'
import type { Rect } from './RectOverlay'

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
}

const CORNERS: PipCorner[] = ['tl', 'tr', 'br', 'bl']
function nextCorner(c: PipCorner): PipCorner {
  return CORNERS[(CORNERS.indexOf(c) + 1) % CORNERS.length]!
}

const PIP_SIZE = 120
const TRANSPORT_HEIGHT = 14
const PIP_INSET = 8

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
  spritePane: {
    position: 'absolute',
    inset: 0,
    backgroundRepeat: 'no-repeat',
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
 * Floating preview window inside the canvas. Click anywhere on the PIP
 * (other than the transport ▶/⏸) to hop corners. Sprite is a CSS
 * background-image off the live atlas image with sprite-sheet
 * positioning, so frame edits propagate next render — no snapshot.
 */
export function AnimationPreviewPip(props: AnimationPreviewPipProps) {
  const {
    animationName, frames, rectsByName, atlasImageUri, atlasSize,
    playhead, isPlaying, onTogglePlay,
    corner, onChangeCorner,
  } = props

  if (!animationName || frames.length === 0) return null

  const cornerStyle =
    corner === 'tl' ? s.cornerTl :
    corner === 'tr' ? s.cornerTr :
    corner === 'br' ? s.cornerBr : s.cornerBl

  const currentName = frames[Math.min(playhead, frames.length - 1)]!
  const rect = rectsByName[currentName]
  const innerSize = PIP_SIZE - TRANSPORT_HEIGHT - 2 // 2 = top/bottom border
  const spriteStyle: CSSProperties = {}
  if (rect && atlasImageUri && atlasSize) {
    const scale = Math.min(innerSize / rect.w, innerSize / rect.h)
    spriteStyle.backgroundImage = `url(${atlasImageUri})`
    spriteStyle.backgroundSize = `${atlasSize.w * scale}px ${atlasSize.h * scale}px`
    const offX = (innerSize - rect.w * scale) / 2 - rect.x * scale
    const offY = (innerSize - rect.h * scale) / 2 - rect.y * scale
    spriteStyle.backgroundPosition = `${offX}px ${offY}px`
  }

  const onShellClick = (e: ReactMouseEvent<HTMLDivElement>) => {
    // Transport buttons mark themselves with a data attr so they don't
    // trigger a corner hop when clicked.
    const target = e.target as HTMLElement
    if (target.closest('[data-pip-transport]')) return
    onChangeCorner(nextCorner(corner))
  }

  return (
    <div
      {...stylex.props(s.shell, cornerStyle)}
      onClick={onShellClick}
      title="Click to move corner"
    >
      <div {...stylex.props(s.body)}>
        <div {...stylex.props(s.spritePane)} style={spriteStyle} />
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
