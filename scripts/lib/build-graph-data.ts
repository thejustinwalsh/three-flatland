// Builds a normalized JSON graph the cytoscape viewer can render.
// Includes per-package metadata (so the viewer can paint compound parent
// nodes) and tags edges that cross package boundaries.

const PALETTE = [
  '#47cca9', '#0bafe6', '#d94c87', '#f7c93e', '#f09c60',
  '#732866', '#a6216e', '#17735f', '#2469b3', '#b38f24',
  '#b36159', '#343473', '#d94c87', '#0bafe6',
]

export const pkgOf = (p: string) => p.split('/').slice(0, 2).join('/')

export type GraphNode = {
  id: string
  label: string
  package: string
  cyclic?: boolean
}
export type GraphEdge = {
  id: string
  source: string
  target: string
  cross: boolean
  weight?: number
}
export type GraphPackage = {
  id: string
  label: string
  color: string
}
export type GraphData = {
  nodes: GraphNode[]
  edges: GraphEdge[]
  packages: GraphPackage[]
  meta: { fileCount: number; edgeCount: number; crossCount: number; cycleCount: number }
}

export type BuildOptions = {
  graph: Record<string, string[]>
  cyclicNodes?: Set<string>
  cycleCount?: number
}

export function buildGraphData(opts: BuildOptions): GraphData {
  const { graph, cyclicNodes = new Set(), cycleCount = 0 } = opts

  const nodeIds = new Set<string>()
  for (const [from, deps] of Object.entries(graph)) {
    nodeIds.add(from)
    for (const to of deps) nodeIds.add(to)
  }

  const pkgIds = [...new Set([...nodeIds].map(pkgOf))].sort()
  const packages: GraphPackage[] = pkgIds.map((id, i) => ({
    id,
    label: id,
    color: PALETTE[i % PALETTE.length]!,
  }))

  const nodes: GraphNode[] = [...nodeIds].sort().map((id) => {
    const p = pkgOf(id)
    return {
      id,
      label: id.replace(p + '/', ''),
      package: p,
      ...(cyclicNodes.has(id) ? { cyclic: true as const } : {}),
    }
  })

  const edges: GraphEdge[] = []
  let i = 0
  let crossCount = 0
  for (const [source, deps] of Object.entries(graph)) {
    const fp = pkgOf(source)
    for (const target of deps) {
      const cross = pkgOf(target) !== fp
      if (cross) crossCount++
      edges.push({ id: `e${i++}`, source, target, cross })
    }
  }

  return {
    nodes,
    edges,
    packages,
    meta: { fileCount: nodes.length, edgeCount: edges.length, crossCount, cycleCount },
  }
}

/** Collapse to a one-node-per-package graph (overview view). */
export function buildOverviewData(graph: Record<string, string[]>): GraphData {
  const counts = new Map<string, number>()
  const pkgIds = new Set<string>()
  for (const [from, deps] of Object.entries(graph)) {
    const fp = pkgOf(from)
    pkgIds.add(fp)
    for (const to of deps) {
      const tp = pkgOf(to)
      pkgIds.add(tp)
      if (fp === tp) continue
      const k = `${fp}|${tp}`
      counts.set(k, (counts.get(k) ?? 0) + 1)
    }
  }

  const sortedPkgs = [...pkgIds].sort()
  // Flat nodes — no compound parents in the overview view.
  const nodes: GraphNode[] = sortedPkgs.map((p) => ({
    id: p,
    label: p,
    package: '',
  }))

  const edges: GraphEdge[] = []
  let i = 0
  for (const [k, n] of [...counts.entries()].sort()) {
    const [source, target] = k.split('|') as [string, string]
    edges.push({ id: `e${i++}`, source, target, cross: true, weight: n })
  }

  // Color the overview nodes via the packages array (viewer maps node.id -> color).
  const packages: GraphPackage[] = sortedPkgs.map((id, i) => ({
    id,
    label: id,
    color: PALETTE[i % PALETTE.length]!,
  }))

  return {
    nodes,
    edges,
    packages,
    meta: {
      fileCount: nodes.length,
      edgeCount: edges.length,
      crossCount: edges.length,
      cycleCount: 0,
    },
  }
}
