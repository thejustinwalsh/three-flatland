/** @jsxImportSource preact */
/**
 * Batch inspector — renders the two arrays in
 * `DevtoolsState.batches`:
 *
 * 1. **Active batches** (first) — the current contents of every batch
 *    source (ECS `BatchRegistry` + engine-owned `InstancedMesh`es like
 *    tilemap chunks) grouped by `(kind, runKey)`. Each run header
 *    shows a kind badge + material label + total instance count; each
 *    row shows the batch index or label and its live instance count.
 *
 * 2. **Passes** — a flat, indented list of render passes that fired
 *    this frame. Each parent pass (e.g. `frame`, `sdf`) has a caret
 *    that collapses its subtree. Collapse state is keyed by label
 *    (not index) so it survives frame-to-frame churn. Totals row at
 *    the bottom sums root-level entries.
 *
 * Sections themselves are not collapsible; the panel is always two
 * tables. The whole panel is a single scroll container — inner lists
 * don't create their own scrollbars.
 */
import { useMemo, useState } from 'preact/hooks'
import { useDevtoolsState } from '../hooks.js'
import type { BatchPassSnapshot, BatchSnapshot } from '../../devtools-client.js'

interface GroupedRun {
  runKey: number
  layer: number
  materialId: number
  materialName: string
  kind: string
  totalSprites: number
  batches: Array<{ batchIdx: number; spriteCount: number; label: string }>
}

interface PassNode {
  pass: BatchPassSnapshot
  index: number
  children: PassNode[]
}

interface DerivedBatches {
  frame: number
  passCount: number
  batchCount: number
  passTotals: { calls: number; tris: number; cpuMs: number }
  runs: GroupedRun[]
  totalSprites: number
  passRoots: PassNode[]
}

function deriveBatches(
  frame: number,
  passes: BatchSnapshot['passes'],
  activeBatches: BatchSnapshot['batches']
): DerivedBatches {
  let calls = 0
  let tris = 0
  let cpuMs = 0
  for (const pass of passes) {
    if (pass.parent === -1) {
      calls += pass.calls
      tris += pass.triangles
      cpuMs += pass.cpuMs
    }
  }

  const groupedRuns = new Map<string, GroupedRun>()
  let totalSprites = 0
  for (const batch of activeBatches) {
    const groupKey = `${batch.kind}:${batch.runKey}`
    let run = groupedRuns.get(groupKey)
    if (run === undefined) {
      run = {
        runKey: batch.runKey,
        layer: batch.layer,
        materialId: batch.materialId,
        materialName: batch.materialName,
        kind: batch.kind,
        totalSprites: 0,
        batches: [],
      }
      groupedRuns.set(groupKey, run)
    }
    run.totalSprites += batch.spriteCount
    totalSprites += batch.spriteCount
    run.batches.push({ batchIdx: batch.batchIdx, spriteCount: batch.spriteCount, label: batch.label })
  }
  const runs = Array.from(groupedRuns.values())
  runs.sort((a, b) => a.kind.localeCompare(b.kind) || a.layer - b.layer || a.materialId - b.materialId)

  const nodes: PassNode[] = passes.map((pass, index) => ({ pass, index, children: [] }))
  const passRoots: PassNode[] = []
  // Parents precede children in producer emission order, so the original
  // array index remains a stable parent lookup while deriving this tree.
  for (const node of nodes) {
    if (node.pass.parent === -1) passRoots.push(node)
    else nodes[node.pass.parent]?.children.push(node)
  }

  return {
    frame,
    passCount: passes.length,
    batchCount: activeBatches.length,
    passTotals: { calls, tris, cpuMs },
    runs,
    totalSprites,
    passRoots,
  }
}

export function BatchesPanel() {
  const state = useDevtoolsState()
  const batches = state.batches

  /**
   * Collapse state for pass subtrees. Keyed by pass label — labels
   * (`frame`, `sdf`, `sdf.seed`, etc.) are stable string constants
   * so the set survives per-frame rebuilds. Collapse state for leaf
   * passes is irrelevant (no children to hide) so this set only ever
   * contains parent labels.
   */
  const [collapsedPasses, setCollapsedPasses] = useState<Set<string>>(() => new Set())
  const toggleCollapsed = (label: string) => {
    setCollapsedPasses((prev) => {
      const next = new Set(prev)
      if (next.has(label)) next.delete(label)
      else next.add(label)
      return next
    })
  }

  const { frame, passes, batches: activeBatches } = batches
  const {
    frame: derivedFrame,
    passCount,
    batchCount,
    passTotals,
    runs,
    totalSprites,
    passRoots,
  } = useMemo(() => deriveBatches(frame, passes, activeBatches), [frame, passes, activeBatches])

  return (
    <section class="panel batches-panel">
      <header class="panel-header batches-header">
        <span>Batches</span>
        <span class="batches-header-meta">
          frame {derivedFrame} · {passTotals.calls} draws · {runs.length} runs · {batchCount} batches · {totalSprites}{' '}
          sprites
        </span>
      </header>

      <div class="batches-scroll">
        <div class="batches-section">
          <div class="batches-section-title">
            <span>Active batches</span>
            <span class="batches-section-count">{batchCount}</span>
          </div>
          <div class="batches-table-head batches-table-head--runs">
            <span class="batches-col-label">run / batch</span>
            <span class="batches-col-num">layer</span>
            <span class="batches-col-num">sprites</span>
          </div>
          <ul class="batches-run-list">
            {runs.length === 0 ? (
              <li class="batches-empty">no active batches</li>
            ) : (
              runs.map((r) => (
                <li key={`${r.kind}:${r.runKey}`} class="batches-run">
                  <div class="batches-run-head">
                    <span class="batches-col-label batches-run-label">
                      <span class={`batches-kind batches-kind--${r.kind}`}>{r.kind}</span>
                      <span class="batches-mat">{r.materialName}</span>
                      <span class="batches-run-sub">mat#{r.materialId}</span>
                    </span>
                    <span class="batches-col-num">{r.layer}</span>
                    <span class="batches-col-num">{r.totalSprites}</span>
                  </div>
                  {r.batches.length > 1 && (
                    <ul class="batches-run-children">
                      {r.batches.map((b) => (
                        <li key={b.batchIdx} class="batches-batch-row">
                          <span class="batches-col-label batches-batch-label">
                            {b.label.length > 0 ? b.label : `batch #${b.batchIdx}`}
                          </span>
                          <span class="batches-col-num">—</span>
                          <span class="batches-col-num">{b.spriteCount}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))
            )}
          </ul>
        </div>

        <div class="batches-section">
          <div class="batches-section-title">
            <span>Passes</span>
            <span class="batches-section-count">{passCount}</span>
          </div>
          <div class="batches-table-head batches-table-head--passes">
            <span class="batches-col-label">pass</span>
            <span class="batches-col-num">calls</span>
            <span class="batches-col-num">tris</span>
            <span class="batches-col-num">ms</span>
          </div>
          <ul class="batches-pass-list">
            {passRoots.length === 0 ? (
              <li class="batches-empty">no passes captured</li>
            ) : (
              passRoots.map((root) => (
                <PassRow key={root.index} node={root} collapsed={collapsedPasses} onToggle={toggleCollapsed} />
              ))
            )}
          </ul>
          <div class="batches-total-row">
            <span class="batches-col-label">total (root)</span>
            <span class="batches-col-num">{passTotals.calls}</span>
            <span class="batches-col-num">{formatTris(passTotals.tris)}</span>
            <span class="batches-col-num">{passTotals.cpuMs.toFixed(2)}</span>
          </div>
        </div>
      </div>
    </section>
  )
}

/**
 * Recursive row renderer for the pass tree. A pass is "expandable"
 * when it has children; clicking its caret toggles the subtree.
 * Leaf passes render without a caret. Indentation scales with depth
 * so the tree structure is obvious even without explicit tree lines.
 */
function PassRow({
  node,
  collapsed,
  onToggle,
}: {
  node: PassNode
  collapsed: Set<string>
  onToggle: (label: string) => void
}) {
  const { pass, children } = node
  const hasChildren = children.length > 0
  const isCollapsed = collapsed.has(pass.label)
  const pad = 8 + pass.depth * 12

  return (
    <>
      <li
        class={`batches-pass-row${hasChildren ? ' batches-pass-row--parent' : ''}`}
        style={{ paddingLeft: `${pad}px` }}
      >
        <span class="batches-col-label batches-pass-label">
          {hasChildren ? (
            <button
              type="button"
              class="batches-tree-caret"
              aria-expanded={!isCollapsed}
              onClick={() => onToggle(pass.label)}
            >
              {isCollapsed ? '▸' : '▾'}
            </button>
          ) : (
            <span class="batches-tree-caret batches-tree-caret--leaf" />
          )}
          <span>{pass.label}</span>
        </span>
        <span class="batches-col-num">{pass.calls}</span>
        <span class="batches-col-num">{formatTris(pass.triangles)}</span>
        <span class="batches-col-num">{pass.cpuMs.toFixed(2)}</span>
      </li>
      {hasChildren && !isCollapsed
        ? children.map((c) => <PassRow key={c.index} node={c} collapsed={collapsed} onToggle={onToggle} />)
        : null}
    </>
  )
}

function formatTris(n: number): string {
  if (n >= 10_000) return `${(n / 1000).toFixed(1)}k`
  return n.toString()
}
