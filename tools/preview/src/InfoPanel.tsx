import { useState } from 'react'
import * as stylex from '@stylexjs/stylex'
import { vscode } from '@three-flatland/design-system/tokens/vscode-theme.stylex'
import { space } from '@three-flatland/design-system/tokens/space.stylex'
import { radius } from '@three-flatland/design-system/tokens/radius.stylex'
import { useCursorStore } from './CanvasStage'
import { useCursor, type CursorReading } from './cursorStore'
import { useViewport } from './Viewport'

export type CoordMode = 'px' | 'uv+' | 'uv-'
export type ColorMode = 'hex' | 'rgba' | 'float'

const NEXT: Record<CoordMode, CoordMode> = { 'px': 'uv+', 'uv+': 'uv-', 'uv-': 'px' }
const NEXT_COLOR: Record<ColorMode, ColorMode> = { 'hex': 'rgba', 'rgba': 'float', 'float': 'hex' }

// Match HoverFrameChip's breakpoint so the two panels stack together
// at the same canvas width. Keep in sync.
const NARROW = '@container (max-width: 480px)'

const s = stylex.create({
  bar: {
    position: 'absolute',
    // Full-width strip when narrow (left: 0); natural-width tab on the
    // right when wide (left: auto).
    left: { default: 'auto', [NARROW]: 0 },
    right: 0,
    bottom: 0,
    display: { default: 'inline-flex', [NARROW]: 'flex' },
    alignItems: 'center',
    // Spread swatch + coord across the available width when stretched;
    // tight gap when sitting as a natural-width tab.
    justifyContent: { default: 'flex-start', [NARROW]: 'space-between' },
    gap: space.lg,
    paddingInline: space.md,
    paddingBlock: space.xs,
    backgroundColor: vscode.panelBg,
    borderTopWidth: 1,
    borderTopStyle: 'solid',
    borderTopColor: vscode.panelBorder,
    // Left border + top-left radius only when bar is on the right side
    // (wide layout). Drops when stretched to full width.
    borderLeftWidth: { default: 1, [NARROW]: 0 },
    borderLeftStyle: 'solid',
    borderLeftColor: vscode.panelBorder,
    borderTopLeftRadius: { default: radius.md, [NARROW]: 0 },
    color: vscode.fg,
    fontFamily: vscode.monoFontFamily,
    fontSize: '11px',
    pointerEvents: 'none',
  },
  swatchWrap: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: space.sm,
  },
  swatch: {
    width: 12,
    height: 12,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: vscode.panelBorder,
    borderRadius: radius.sm,
    flexShrink: 0,
  },
  swatchFill: (color: string) => ({ backgroundColor: color }),
  clickable: {
    cursor: 'pointer',
    pointerEvents: 'auto',
    userSelect: 'none',
    paddingInline: space.sm,
    paddingBlock: space.xs,
    borderRadius: radius.sm,
    backgroundColor: {
      default: 'transparent',
      ':hover': vscode.bg,
    },
  },
  // Per-mode min-width reservations for the color display.
  // Sized to the longest possible value in each mode so the panel
  // never shifts while the cursor is scanning — only reflows on a click.
  colorHex: { minWidth: '9ch' },   // #rrggbbaa = 9 chars
  colorRgba: { minWidth: '18ch' }, // 255, 255, 255, 255 = 18 chars
  colorFloat: { minWidth: '26ch' }, // 1.000, 1.000, 1.000, 1.000 = 26 chars
  // Per-mode min-width reservations for the coord display.
  coordPx: { minWidth: '14ch' },  // px: 9999, 9999 = 14 chars
  coordUv: { minWidth: '17ch' },  // uv+: 1.000, 1.000 = 17 chars
  coord: {
    cursor: 'pointer',
    pointerEvents: 'auto',
    userSelect: 'none',
    paddingInline: space.sm,
    paddingBlock: space.xs,
    borderRadius: radius.sm,
    backgroundColor: {
      default: 'transparent',
      ':hover': vscode.bg,
    },
  },
  empty: { opacity: 0.5 },
  // Out-of-bounds: render in dim foreground so the user can see the readout
  // is positional / wrapped rather than a live sample.
  oob: { color: vscode.descriptionFg },
})

function hex2(n: number): string {
  return n.toString(16).padStart(2, '0')
}

const ZERO_RGBA: [number, number, number, number] = [0, 0, 0, 0]

function formatColor(
  rgba: [number, number, number, number] | null,
  mode: ColorMode,
): string {
  // Out-of-bounds / no sample: show 0s in the active format rather than `—`,
  // so the panel still communicates the format without going blank.
  const [r, g, b, a] = rgba ?? ZERO_RGBA
  if (mode === 'hex') {
    return a < 255
      ? `#${hex2(r)}${hex2(g)}${hex2(b)}${hex2(a)}`
      : `#${hex2(r)}${hex2(g)}${hex2(b)}`
  }
  if (mode === 'rgba') {
    return `${r}, ${g}, ${b}, ${a}`
  }
  // float
  return [r, g, b, a].map((v) => (v / 255).toFixed(3)).join(', ')
}

/** Modulo that wraps negative inputs into [0, m). JS `%` keeps the sign. */
function wrap(v: number, m: number): number {
  return ((v % m) + m) % m
}

function formatCoord(reading: CursorReading | null, mode: CoordMode, w: number, h: number): string {
  if (!reading) return mode === 'px' ? 'px: —, —' : `${mode}: —, —`
  if (mode === 'px') return `px: ${reading.x}, ${reading.y}`
  // UV: divide by image dimensions. uv+ has Y-up (WebGPU/three.js TSL); uv-
  // matches the DOM/image convention. When out of bounds we wrap into [0,1)
  // so the readout still shows a meaningful tile-space coord rather than
  // values that march off the texture (useful when the user's cursor is
  // floating in the dim margin around the image).
  const ux = reading.inBounds ? reading.x / w : wrap(reading.x, w) / w
  const vyRaw = reading.inBounds ? reading.y / h : wrap(reading.y, h) / h
  const vy = mode === 'uv+' ? 1 - vyRaw : vyRaw
  return `${mode}: ${ux.toFixed(3)}, ${vy.toFixed(3)}`
}

export type InfoPanelProps = {
  /** Controlled color format. Falls back to local state if omitted. */
  colorMode?: ColorMode
  onColorModeChange?: (next: ColorMode) => void
  /** Controlled coord format. Falls back to local state if omitted. */
  coordMode?: CoordMode
  onCoordModeChange?: (next: CoordMode) => void
}

/**
 * Bottom-of-viewport status bar showing the color and coordinates under
 * the cursor. Click the color display to cycle hex → rgba → float rgba.
 * Click the coord display to cycle px → uv+ → uv-. Reads from the
 * `<CanvasStage>` cursor store + viewport context; renders nothing until
 * the viewport (image dimensions) is known.
 *
 * Mount inside `<CanvasStage>` as a child so it has access to both
 * contexts and positions absolutely against the stage.
 */
export function InfoPanel({
  colorMode: colorModeProp,
  onColorModeChange,
  coordMode: coordModeProp,
  onCoordModeChange,
}: InfoPanelProps = {}) {
  const store = useCursorStore()
  const reading = useCursor(store)
  const vp = useViewport()
  const [coordModeLocal, setCoordModeLocal] = useState<CoordMode>('px')
  const [colorModeLocal, setColorModeLocal] = useState<ColorMode>('hex')

  if (!vp) return null

  const coordMode = coordModeProp ?? coordModeLocal
  const colorMode = colorModeProp ?? colorModeLocal

  const cycleCoord = () => {
    const next = NEXT[coordMode]
    if (onCoordModeChange) onCoordModeChange(next)
    else setCoordModeLocal(next)
  }
  const cycleColor = () => {
    const next = NEXT_COLOR[colorMode]
    if (onColorModeChange) onColorModeChange(next)
    else setColorModeLocal(next)
  }

  const colorMinWidth = colorMode === 'hex' ? s.colorHex : colorMode === 'rgba' ? s.colorRgba : s.colorFloat
  const coordMinWidth = coordMode === 'px' ? s.coordPx : s.coordUv

  // Cursor over canvas but outside image: dim everything so it's visually
  // distinct from a live in-bounds reading.
  const oob = reading != null && !reading.inBounds

  return (
    <div {...stylex.props(s.bar)}>
      <span {...stylex.props(s.swatchWrap)}>
        <span
          {...stylex.props(
            s.swatch,
            s.swatchFill(
              reading?.rgba
                ? `rgba(${reading.rgba[0]}, ${reading.rgba[1]}, ${reading.rgba[2]}, ${reading.rgba[3] / 255})`
                : 'transparent',
            ),
          )}
        />
        <span
          {...stylex.props(s.clickable, colorMinWidth, !reading && s.empty, oob && s.oob)}
          onClick={cycleColor}
          title="Cycle hex → rgba → float rgba"
        >
          {formatColor(reading?.rgba ?? null, colorMode)}
        </span>
      </span>
      <span
        {...stylex.props(s.coord, coordMinWidth, !reading && s.empty, oob && s.oob)}
        onClick={cycleCoord}
        title="Cycle px → uv+ → uv-"
      >
        {formatCoord(reading, coordMode, vp.imageW, vp.imageH)}
      </span>
    </div>
  )
}
