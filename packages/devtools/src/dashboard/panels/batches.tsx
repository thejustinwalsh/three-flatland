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
import type { BatchPassSnapshot } from '../../devtools-client.js'

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

  const passTotals = useMemo(() => {
    let calls = 0
    let tris = 0
    let cpuMs = 0
    for (const p of batches.passes) {
      if (p.parent === -1) {
        calls += p.calls
        tris += p.triangles
        cpuMs += p.cpuMs
      }
    }
    return { calls, tris, cpuMs }
  }, [batches.frame])

  const runs = useMemo(() => {
    const m = new Map<string, GroupedRun>()
    for (const b of batches.batches) {
      const groupKey = `${b.kind}:${b.runKey}`
      let run = m.get(groupKey)
      if (run === undefined) {
        run = {
          runKey: b.runKey,
          layer: b.layer,
          materialId: b.materialId,
          materialName: b.materialName,
          kind: b.kind,
          totalSprites: 0,
          batches: [],
        }
        m.set(groupKey, run)
      }
      run.totalSprites += b.spriteCount
      run.batches.push({ batchIdx: b.batchIdx, spriteCount: b.spriteCount, label: b.label })
    }
    const arr = Array.from(m.values())
    arr.sort((a, b) =>
      a.kind.localeCompare(b.kind) || a.layer - b.layer || a.materialId - b.materialId,
    )
    return arr
  }, [batches.frame])

  const totalSprites = useMemo(() => {
    let n = 0
    for (const r of runs) n += r.totalSprites
    return n
  }, [runs])

  /**
   * Rebuild the pass tree from the flat array. Parents come before
   * children in the producer's emission order (frame first, then its
   * children, etc.) so one linear pass + index lookup suffices.
   */
  const passRoots = useMemo(() => {
    const nodes: PassNode[] = batches.passes.map((p, i) => ({
      pass: p,
      index: i,
      children: [],
    }))
    const roots: PassNode[] = []
    for (const n of nodes) {
      if (n.pass.parent === -1) roots.push(n)
      else nodes[n.pass.parent]?.children.push(n)
    }
    return roots
  }, [batches.frame])

  return (
    <section class="panel batches-panel">
      <header class="panel-header batches-header">
        <span>Batches</span>
        <span class="batches-header-meta">
          frame {batches.frame} · {passTotals.calls} draws · {runs.length} runs · {batches.batches.length} batches · {totalSprites} sprites
        </span>
      </header>

      <div class="batches-scroll">
        <div class="batches-section">
          <div class="batches-section-title">
            <span>Active batches</span>
            <span class="batches-section-count">{batches.batches.length}</span>
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
            <span class="batches-section-count">{batches.passes.length}</span>
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
                <PassRow
                  key={root.index}
                  node={root}
                  collapsed={collapsedPasses}
                  onToggle={toggleCollapsed}
                />
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
        ? children.map((c) => (
            <PassRow
              key={c.index}
              node={c}
              collapsed={collapsed}
              onToggle={onToggle}
            />
          ))
        : null}
    </>
  )
}

function formatTris(n: number): string {
  if (n >= 10_000) return `${(n / 1000).toFixed(1)}k`
  return n.toString()
}
