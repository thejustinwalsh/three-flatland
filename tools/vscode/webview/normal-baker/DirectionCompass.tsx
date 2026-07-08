import * as stylex from '@stylexjs/stylex'
import type { NormalDirection } from '@three-flatland/normals'
import { vscode } from '@three-flatland/design-system/tokens/vscode-theme.stylex'
import { space } from '@three-flatland/design-system/tokens/space.stylex'
import { radius } from '@three-flatland/design-system/tokens/radius.stylex'
import { activeCompassDirection, COMPASS_LAYOUT, directionColor } from './direction'

// Local primitive — a 9-way (8 compass + flat) direction picker, doubling
// as the legend for the canvas's direction-tinted region fills (each cell
// is colored with `directionColor()`, the same function `RegionColorOverlay`
// uses). No design-system equivalent exists; promote if a second tool
// needs a direction picker.

const CELL = 28

const s = stylex.create({
  grid: {
    display: 'grid',
    gridTemplateColumns: `repeat(3, ${CELL}px)`,
    gridTemplateRows: `repeat(3, ${CELL}px)`,
    gap: space.xs,
  },
  cell: {
    width: CELL,
    height: CELL,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderStyle: 'solid',
    borderColor: 'transparent',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
  },
  cellActive: {
    borderColor: vscode.fg,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
  },
  flatGlyph: {
    width: 10,
    height: 2,
    backgroundColor: vscode.bg,
  },
})

export type DirectionCompassProps = {
  value: NormalDirection | undefined
  onChange: (next: NormalDirection) => void
  disabled?: boolean
  'aria-label'?: string
}

/**
 * 3×3 compass grid: 8 named directions around a center `'flat'` cell.
 * Cells are tinted with the same `directionColor()` mapping used to color
 * region fills on the canvas, so the picker also reads as a legend. Only
 * highlights a cell when `value` resolves (by angle) to a named
 * direction — a custom numeric angle leaves the compass with no active
 * cell rather than guessing.
 */
export function DirectionCompass({
  value,
  onChange,
  disabled = false,
  'aria-label': ariaLabel,
}: DirectionCompassProps) {
  const active = activeCompassDirection(value)
  return (
    <div {...stylex.props(s.grid)} role="group" aria-label={ariaLabel ?? 'Direction'}>
      {COMPASS_LAYOUT.map(({ direction }) => {
        const isActive = active === direction
        const label = typeof direction === 'string' ? direction : String(direction)
        return (
          <button
            key={label}
            type="button"
            disabled={disabled}
            aria-pressed={isActive}
            aria-label={label}
            title={label}
            onClick={() => onChange(direction)}
            {...stylex.props(s.cell, isActive && s.cellActive)}
            style={{
              backgroundColor: directionColor(direction, { alpha: isActive ? 0.9 : 0.55 }),
              opacity: disabled ? 0.5 : 1,
              cursor: disabled ? 'not-allowed' : 'pointer',
            }}
          >
            {direction === 'flat' ? (
              <span {...stylex.props(s.flatGlyph)} />
            ) : (
              <span {...stylex.props(s.dot)} />
            )}
          </button>
        )
      })}
    </div>
  )
}
