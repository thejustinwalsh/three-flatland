import { useState } from 'react'
import * as stylex from '@stylexjs/stylex'
import { vscode } from '@three-flatland/design-system/tokens/vscode-theme.stylex'
import { space } from '@three-flatland/design-system/tokens/space.stylex'
import { radius } from '@three-flatland/design-system/tokens/radius.stylex'
import { useCursorStore } from './CanvasStage'
import { useCursor, type CursorReading } from './cursorStore'
import { useViewport } from './Viewport'

type CoordMode = 'px' | 'uv+' | 'uv-'

const NEXT: Record<CoordMode, CoordMode> = { 'px': 'uv+', 'uv+': 'uv-', 'uv-': 'px' }

const s = stylex.create({
  bar: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    display: 'inline-flex',
    alignItems: 'center',
    gap: space.lg,
    paddingInline: space.md,
    paddingBlock: space.xs,
    backgroundColor: vscode.panelBg,
    borderTopWidth: 1,
    borderTopStyle: 'solid',
    borderTopColor: vscode.panelBorder,
    borderLeftWidth: 1,
    borderLeftStyle: 'solid',
    borderLeftColor: vscode.panelBorder,
    borderTopLeftRadius: radius.md,
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
  },
  swatchFill: (color: string) => ({ backgroundColor: color }),
  hex: { opacity: 0.8 },
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
})

function hex2(n: number): string {
  return n.toString(16).padStart(2, '0')
}

function formatColor(rgba: [number, number, number, number] | null): string {
  if (!rgba) return '—'
  const [r, g, b, a] = rgba
  return a < 255 ? `#${hex2(r)}${hex2(g)}${hex2(b)}${hex2(a)}` : `#${hex2(r)}${hex2(g)}${hex2(b)}`
}

function formatCoord(reading: CursorReading | null, mode: CoordMode, w: number, h: number): string {
  if (!reading) return mode === 'px' ? 'px: —, —' : `${mode}: —, —`
  if (mode === 'px') return `px: ${reading.x}, ${reading.y}`
  // UV: divide by image dimensions. uv+ has Y-up (WebGPU/three.js TSL); uv-
  // matches the DOM/image convention.
  const u = reading.x / w
  const vRaw = reading.y / h
  const v = mode === 'uv+' ? 1 - vRaw : vRaw
  return `${mode}: ${u.toFixed(3)}, ${v.toFixed(3)}`
}

export type InfoPanelProps = Record<string, never>

/**
 * Bottom-of-viewport status bar showing the color and coordinates under
 * the cursor. Click the coord display to cycle px → uv+ → uv-. Reads from
 * the `<CanvasStage>` cursor store + viewport context; renders nothing
 * until the viewport (image dimensions) is known.
 *
 * Mount inside `<CanvasStage>` as a child so it has access to both
 * contexts and positions absolutely against the stage.
 */
export function InfoPanel(_: InfoPanelProps = {} as InfoPanelProps) {
  const store = useCursorStore()
  const reading = useCursor(store)
  const vp = useViewport()
  const [mode, setMode] = useState<CoordMode>('px')

  if (!vp) return null

  const cycle = () => setMode((m) => NEXT[m])

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
        <span {...stylex.props(s.hex, !reading && s.empty)}>{formatColor(reading?.rgba ?? null)}</span>
      </span>
      <span {...stylex.props(s.coord, !reading && s.empty)} onClick={cycle} title="Cycle px → uv+ → uv-">
        {formatCoord(reading, mode, vp.imageW, vp.imageH)}
      </span>
    </div>
  )
}
