import * as stylex from '@stylexjs/stylex'
import { Button, NumberField, Panel } from '@three-flatland/design-system'
import { vscode } from '@three-flatland/design-system/tokens/vscode-theme.stylex'
import { space } from '@three-flatland/design-system/tokens/space.stylex'
import type { GridSpec } from '@three-flatland/preview/grid'
import { splitRegionByGrid, splitRegionRowsCols, tilesFromGrid, tilesFromPicked } from './gridOps'
import type { EditableRegion } from './regionOps'

const s = stylex.create({
  body: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.md,
  },
  fieldRow: {
    display: 'flex',
    alignItems: 'center',
    gap: space.md,
  },
  fieldLabel: {
    width: 64,
    flexShrink: 0,
    fontSize: '11px',
    color: vscode.descriptionFg,
  },
  field: {
    width: 64,
    flexShrink: 0,
  },
  hint: {
    fontSize: '11px',
    color: vscode.descriptionFg,
    margin: 0,
  },
  sectionTitle: {
    fontSize: '11px',
    fontWeight: 600,
    color: vscode.panelTitleFg,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    marginTop: space.sm,
  },
})

export type GridSettings = {
  tileW: number
  tileH: number
  offsetX: number
  offsetY: number
}

export type GridSlicePanelProps = {
  /** Whether the canvas grid overlay is currently shown (toolbar toggle). */
  gridMode: boolean
  /** The live grid — numeric settings materialized (plus any hand-dragged
   * edge tweaks). Null until the image has loaded. */
  grid: GridSpec | null
  picked: ReadonlySet<string>
  settings: GridSettings
  onSettingsChange: (patch: Partial<GridSettings>) => void
  /** The single selected region, or null (split needs exactly one). */
  selectedRegion: EditableRegion | null
  selectionCount: number
  splitRows: number
  splitCols: number
  onSplitRowsChange: (rows: number) => void
  onSplitColsChange: (cols: number) => void
  onGenerate: () => void
  onSplitByGrid: () => void
  onSplitRowsCols: () => void
}

/**
 * The tilemap workflow (C3): align a tile grid over the image, generate
 * one region per tile (or per picked subset), and split existing regions
 * — by the aligned grid or into rows × cols — Photoshop-slice style.
 * Every button label carries the exact region count it will produce (the
 * count-confirm), and generate/split are each ONE undo step (see the
 * store's addRegionsAction/splitRegionAction).
 */
export function GridSlicePanel({
  gridMode,
  grid,
  picked,
  settings,
  onSettingsChange,
  selectedRegion,
  selectionCount,
  splitRows,
  splitCols,
  onSplitRowsChange,
  onSplitColsChange,
  onGenerate,
  onSplitByGrid,
  onSplitRowsCols,
}: GridSlicePanelProps) {
  const pickedCount = grid ? tilesFromPicked(grid, picked).length : 0
  const generateCount = grid ? (pickedCount > 0 ? pickedCount : tilesFromGrid(grid).length) : 0
  const splitByGridCount =
    grid && selectedRegion ? splitRegionByGrid(selectedRegion, grid).length : 0
  const splitRowsColsCount = selectedRegion
    ? splitRegionRowsCols(selectedRegion, splitRows, splitCols).length
    : 0

  return (
    <Panel title="Grid & Split" bodyPadding="normal" bodyOverflow="visible">
      <div {...stylex.props(s.body)}>
        <div {...stylex.props(s.fieldRow)}>
          <span {...stylex.props(s.fieldLabel)}>Tile size</span>
          <div {...stylex.props(s.field)}>
            <NumberField
              value={settings.tileW}
              min={1}
              max={4096}
              step={1}
              onChange={(v) => onSettingsChange({ tileW: Math.max(1, Math.round(v)) })}
              aria-label="Tile width"
            />
          </div>
          <div {...stylex.props(s.field)}>
            <NumberField
              value={settings.tileH}
              min={1}
              max={4096}
              step={1}
              onChange={(v) => onSettingsChange({ tileH: Math.max(1, Math.round(v)) })}
              aria-label="Tile height"
            />
          </div>
        </div>
        <div {...stylex.props(s.fieldRow)}>
          <span {...stylex.props(s.fieldLabel)}>Offset</span>
          <div {...stylex.props(s.field)}>
            <NumberField
              value={settings.offsetX}
              min={0}
              max={4096}
              step={1}
              onChange={(v) => onSettingsChange({ offsetX: Math.max(0, Math.round(v)) })}
              aria-label="Grid offset X"
            />
          </div>
          <div {...stylex.props(s.field)}>
            <NumberField
              value={settings.offsetY}
              min={0}
              max={4096}
              step={1}
              onChange={(v) => onSettingsChange({ offsetY: Math.max(0, Math.round(v)) })}
              aria-label="Grid offset Y"
            />
          </div>
        </div>
        {!gridMode && (
          <p {...stylex.props(s.hint)}>
            Toggle the grid in the toolbar to align it on the canvas — drag lines to fine-tune,
            click cells to pick a subset.
          </p>
        )}
        <Button
          icon="layout"
          disabled={!gridMode || generateCount === 0}
          onClick={onGenerate}
          title={
            pickedCount > 0
              ? `One region per picked grid cell (${pickedCount})`
              : `One region per grid cell (${generateCount})`
          }
        >
          Generate {generateCount} region{generateCount === 1 ? '' : 's'}
        </Button>

        <span {...stylex.props(s.sectionTitle)}>Split selected</span>
        {selectionCount !== 1 ? (
          <p {...stylex.props(s.hint)}>
            {selectionCount === 0
              ? 'Select a region (canvas or list) to split it.'
              : 'Select exactly one region to split.'}
          </p>
        ) : (
          <>
            <Button
              secondary
              icon="split-horizontal"
              disabled={splitByGridCount < 2}
              onClick={onSplitByGrid}
              title={
                splitByGridCount < 2
                  ? 'No grid line crosses this region — align the grid first'
                  : `Cut along every grid line crossing the region (${splitByGridCount} pieces, edge remainders kept)`
              }
            >
              Split by grid ({splitByGridCount})
            </Button>
            <div {...stylex.props(s.fieldRow)}>
              <span {...stylex.props(s.fieldLabel)}>Rows × cols</span>
              <div {...stylex.props(s.field)}>
                <NumberField
                  value={splitRows}
                  min={1}
                  max={64}
                  step={1}
                  onChange={(v) => onSplitRowsChange(Math.max(1, Math.round(v)))}
                  aria-label="Split rows"
                />
              </div>
              <div {...stylex.props(s.field)}>
                <NumberField
                  value={splitCols}
                  min={1}
                  max={64}
                  step={1}
                  onChange={(v) => onSplitColsChange(Math.max(1, Math.round(v)))}
                  aria-label="Split columns"
                />
              </div>
            </div>
            <Button
              secondary
              icon="split-vertical"
              disabled={splitRowsColsCount < 2}
              onClick={onSplitRowsCols}
              title={`Split the selected region into ${splitRows}×${splitCols} (${splitRowsColsCount} pieces; children inherit its explicit fields)`}
            >
              Split into {splitRowsColsCount} regions
            </Button>
          </>
        )}
      </div>
    </Panel>
  )
}
