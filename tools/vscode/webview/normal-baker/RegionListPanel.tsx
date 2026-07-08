import * as stylex from '@stylexjs/stylex'
import { Panel, ToolbarButton } from '@three-flatland/design-system'
import { vscode } from '@three-flatland/design-system/tokens/vscode-theme.stylex'
import { space } from '@three-flatland/design-system/tokens/space.stylex'
import type { NormalBakerDefaults } from './normalBakerStore'
import { directionColor } from './direction'
import { resolveDirection } from './fieldResolution'
import type { EditableRegion } from './regionOps'

const s = stylex.create({
  list: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    fontFamily: vscode.monoFontFamily,
    fontSize: '12px',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: space.md,
    paddingInline: space.md,
    paddingBlock: space.sm,
    cursor: 'pointer',
    backgroundColor: 'transparent',
    color: vscode.fg,
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: vscode.panelBorder,
    userSelect: 'none',
  },
  rowSelected: {
    backgroundColor: vscode.listActiveSelectionBg,
    color: vscode.listActiveSelectionFg,
  },
  swatch: {
    width: 10,
    height: 10,
    borderRadius: '50%',
    flexShrink: 0,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'rgba(0, 0, 0, 0.3)',
  },
  label: {
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  coords: {
    opacity: 0.7,
    flexShrink: 0,
  },
  reorderCol: {
    display: 'flex',
    flexDirection: 'column',
    flexShrink: 0,
  },
  empty: {
    padding: space.lg,
    color: vscode.descriptionFg,
    fontSize: '12px',
  },
})

export type RegionListPanelProps = {
  regions: readonly EditableRegion[]
  defaults: NormalBakerDefaults
  selectedIds: ReadonlySet<string>
  onSelect: (id: string, additive: boolean) => void
  onAdd: () => void
  onDelete: () => void
  onMove: (fromIndex: number, toIndex: number) => void
}

export function RegionListPanel({
  regions,
  defaults,
  selectedIds,
  onSelect,
  onAdd,
  onDelete,
  onMove,
}: RegionListPanelProps) {
  return (
    <Panel
      title={`Regions (${regions.length})`}
      bodyPadding="none"
      headerActions={
        <>
          <ToolbarButton icon="add" title="Add region" onClick={onAdd} />
          <ToolbarButton
            icon="trash"
            title="Delete selected"
            onClick={onDelete}
            disabled={selectedIds.size === 0}
          />
        </>
      }
    >
      {regions.length === 0 ? (
        <div {...stylex.props(s.empty)}>No regions yet — draw one on the canvas or click Add.</div>
      ) : (
        <ul {...stylex.props(s.list)}>
          {regions.map((r, i) => {
            const selected = selectedIds.has(r.id)
            const direction = resolveDirection(r, defaults)
            return (
              <li
                key={r.id}
                {...stylex.props(s.row, selected && s.rowSelected)}
                onClick={(e) => onSelect(r.id, e.shiftKey)}
              >
                <span
                  {...stylex.props(s.swatch)}
                  style={{ backgroundColor: directionColor(direction) }}
                />
                <span {...stylex.props(s.label)}>region {i}</span>
                <span {...stylex.props(s.coords)}>
                  {r.x},{r.y} {r.w}×{r.h}
                </span>
                <span {...stylex.props(s.reorderCol)}>
                  <ToolbarButton
                    icon="chevron-up"
                    title="Move up"
                    disabled={i === 0}
                    onClick={(e) => {
                      e.stopPropagation()
                      onMove(i, i - 1)
                    }}
                  />
                  <ToolbarButton
                    icon="chevron-down"
                    title="Move down"
                    disabled={i === regions.length - 1}
                    onClick={(e) => {
                      e.stopPropagation()
                      onMove(i, i + 2)
                    }}
                  />
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )
}
