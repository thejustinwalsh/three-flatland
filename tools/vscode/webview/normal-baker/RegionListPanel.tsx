import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import * as stylex from '@stylexjs/stylex'
import { Icon, Panel, ToolbarButton } from '@three-flatland/design-system'
import { vscode } from '@three-flatland/design-system/tokens/vscode-theme.stylex'
import { space } from '@three-flatland/design-system/tokens/space.stylex'
import type { NormalBakerDefaults } from './normalBakerStore'
import { directionColor } from './direction'
import { resolveDirection } from './fieldResolution'
import { presentationDragMoveArgs, presentationStepMoveArgs, toPresentationOrder } from './presentationOrder'
import type { EditableRegion } from './regionOps'

const s = stylex.create({
  list: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    fontFamily: vscode.monoFontFamily,
    fontSize: '12px',
    position: 'relative',
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
  rowDragging: {
    opacity: 0.4,
  },
  grip: {
    display: 'inline-flex',
    alignItems: 'center',
    flexShrink: 0,
    color: vscode.descriptionFg,
    cursor: 'grab',
    touchAction: 'none',
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
  dropIndicator: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: vscode.focusRing,
    pointerEvents: 'none',
  },
  // Bounded (not content-sized) — this list scrolls INTERNALLY once
  // regions.length grows (see the scrollIntoView effect below), which
  // requires a definite height for the default bodyOverflow="auto" to
  // actually scroll instead of collapsing to 0 (Panel's
  // flex-1-with-no-stretching-ancestor bug — see design-system
  // AGENTS.md). The sidebar's Regions/Info grid split gives this row a
  // definite height (the user drags the splitter to trade list space
  // against the Info panel), so fill it.
  bounded: {
    height: '100%',
    minHeight: 0,
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

type DragState = {
  pointerId: number
  fromPresentationIndex: number
  dropBeforeIndex: number
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
  // Top of the list = paints LAST = wins overlapping pixels (Photoshop/
  // Figma layers-panel convention) — the reverse of the descriptor's own
  // serialization/paint order (see presentationOrder.ts's header comment
  // and packages/normals/src/bake.ts's bakeNormalMap loop, where index 0
  // paints first and the last index wins). This is a presentation-only
  // transform — Save always serializes `regions` (descriptor order)
  // untouched, never this reversed view.
  const presentation = toPresentationOrder(regions)

  const listRef = useRef<HTMLUListElement>(null)
  const rowRefs = useRef<Map<string, HTMLLIElement>>(new Map())
  const [drag, setDrag] = useState<DragState | null>(null)

  // Scroll the most-recently-selected row into view whenever the
  // selection changes — including from a canvas click (stakeholder:
  // "selecting a region also doesn't scroll the right pane into view
  // when it is out of view... we should fix it everywhere"). `Set`
  // preserves insertion order, so the last entry is whichever action
  // most recently selected something. `scrollIntoView({block:'nearest'})`
  // is a no-op if the row is already visible.
  useEffect(() => {
    if (selectedIds.size === 0) return
    const lastId = Array.from(selectedIds).at(-1)
    if (!lastId) return
    rowRefs.current.get(lastId)?.scrollIntoView({ block: 'nearest' })
  }, [selectedIds])

  const computeDropBeforeIndex = (clientY: number): number => {
    const rows = presentation.map((r) => rowRefs.current.get(r.id)).filter((el): el is HTMLLIElement => el != null)
    for (let i = 0; i < rows.length; i++) {
      const rect = rows[i]!.getBoundingClientRect()
      if (clientY < rect.top + rect.height / 2) return i
    }
    return rows.length
  }

  const handleGripPointerDown = (presentationIndex: number, e: ReactPointerEvent) => {
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    setDrag({
      pointerId: e.pointerId,
      fromPresentationIndex: presentationIndex,
      dropBeforeIndex: presentationIndex,
    })
  }

  const handleGripPointerMove = (e: ReactPointerEvent) => {
    if (!drag || e.pointerId !== drag.pointerId) return
    const dropBeforeIndex = computeDropBeforeIndex(e.clientY)
    if (dropBeforeIndex !== drag.dropBeforeIndex) {
      setDrag({ ...drag, dropBeforeIndex })
    }
  }

  const endDrag = (e: ReactPointerEvent, commit: boolean) => {
    if (!drag || e.pointerId !== drag.pointerId) return
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
    if (commit) {
      const { fromIndex, toIndex } = presentationDragMoveArgs(
        drag.fromPresentationIndex,
        drag.dropBeforeIndex,
        regions.length
      )
      onMove(fromIndex, toIndex)
    }
    setDrag(null)
  }

  return (
    <Panel
      title={`Regions (${regions.length})`}
      bodyPadding="none"
      style={s.bounded}
      headerActions={
        <>
          <ToolbarButton icon="add" title="Add region" onClick={onAdd} />
          <ToolbarButton icon="trash" title="Delete selected" onClick={onDelete} disabled={selectedIds.size === 0} />
        </>
      }
    >
      {regions.length === 0 ? (
        <div {...stylex.props(s.empty)}>No regions yet — draw one on the canvas or click Add.</div>
      ) : (
        <ul ref={listRef} {...stylex.props(s.list)}>
          {presentation.map((r, i) => {
            const selected = selectedIds.has(r.id)
            const direction = resolveDirection(r, defaults)
            const descriptorIndex = regions.length - 1 - i
            const dragging = drag?.fromPresentationIndex === i
            return (
              <li
                key={r.id}
                ref={(el) => {
                  if (el) rowRefs.current.set(r.id, el)
                  else rowRefs.current.delete(r.id)
                }}
                data-region-id={r.id}
                {...stylex.props(s.row, selected && s.rowSelected, dragging && s.rowDragging)}
                onClick={(e) => onSelect(r.id, e.shiftKey)}
              >
                <span
                  {...stylex.props(s.grip)}
                  title="Drag to reorder — higher in the list paints over lower regions"
                  onPointerDown={(e) => handleGripPointerDown(i, e)}
                  onPointerMove={handleGripPointerMove}
                  onPointerUp={(e) => endDrag(e, true)}
                  onPointerCancel={(e) => endDrag(e, false)}
                >
                  <Icon name="gripper" />
                </span>
                <span {...stylex.props(s.swatch)} style={{ backgroundColor: directionColor(direction) }} />
                <span {...stylex.props(s.label)}>region {descriptorIndex}</span>
                <span {...stylex.props(s.coords)}>
                  {r.x},{r.y} {r.w}×{r.h}
                </span>
                <span {...stylex.props(s.reorderCol)}>
                  <ToolbarButton
                    icon="chevron-up"
                    title="Move up (paints later, wins over more)"
                    disabled={i === 0}
                    onClick={(e) => {
                      e.stopPropagation()
                      const { fromIndex, toIndex } = presentationStepMoveArgs(descriptorIndex, 'up')
                      onMove(fromIndex, toIndex)
                    }}
                  />
                  <ToolbarButton
                    icon="chevron-down"
                    title="Move down (paints earlier, wins over less)"
                    disabled={i === presentation.length - 1}
                    onClick={(e) => {
                      e.stopPropagation()
                      const { fromIndex, toIndex } = presentationStepMoveArgs(descriptorIndex, 'down')
                      onMove(fromIndex, toIndex)
                    }}
                  />
                </span>
              </li>
            )
          })}
          {drag ? (
            <DropIndicator dropBeforeIndex={drag.dropBeforeIndex} rowRefs={rowRefs} presentation={presentation} />
          ) : null}
        </ul>
      )}
    </Panel>
  )
}

/**
 * Horizontal line at the boundary the dragged row would land at. Reads
 * row positions relative to the `<ul>` via `offsetTop`, not
 * `getBoundingClientRect()` — the indicator is absolutely positioned
 * inside the (relatively positioned) list, so it needs list-local
 * coordinates, not viewport ones.
 */
function DropIndicator({
  dropBeforeIndex,
  rowRefs,
  presentation,
}: {
  dropBeforeIndex: number
  rowRefs: React.RefObject<Map<string, HTMLLIElement>>
  presentation: readonly EditableRegion[]
}) {
  const targetRow =
    dropBeforeIndex < presentation.length
      ? rowRefs.current?.get(presentation[dropBeforeIndex]!.id)
      : rowRefs.current?.get(presentation[presentation.length - 1]!.id)
  if (!targetRow) return null
  const top = dropBeforeIndex < presentation.length ? targetRow.offsetTop : targetRow.offsetTop + targetRow.offsetHeight
  return <div {...stylex.props(s.dropIndicator)} style={{ top }} />
}
