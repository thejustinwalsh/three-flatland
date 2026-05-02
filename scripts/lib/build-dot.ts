// Shared graphviz dot-builder. Groups files into subgraph clusters by
// workspace package so module boundaries are visible at a glance, and
// colors cross-package edges differently from intra-package edges.

const PALETTE = [
  '#47cca9', '#0bafe6', '#d94c87', '#f7c93e', '#f09c60',
  '#732866', '#a6216e', '#17735f', '#2469b3', '#b38f24',
  '#b36159', '#343473', '#d94c87', '#0bafe6',
]

const BG = '#00021c'
const NODE_FILL = '#1c284d'
const NODE_FG = '#f0edd8'
const INTRA_EDGE = '#3a4a7a'
const CROSS_EDGE = '#d94c87'
const CYCLE_FILL = '#732866'
const CYCLE_STROKE = '#d94c87'

export const pkgOf = (p: string) => p.split('/').slice(0, 2).join('/')
const safeId = (s: string) => s.replace(/[^a-z0-9]/gi, '_')
const esc = (s: string) => s.replace(/"/g, '\\"')

export type DotOptions = {
  /** Files mapped to the files they depend on. */
  graph: Record<string, string[]>
  /** Files belonging to a cycle — gets cycle styling. */
  cyclicNodes?: Set<string>
  /** Edge color override (defaults to cross/intra coloring). */
  edgeStyle?: 'cross-vs-intra' | 'uniform'
  /** Direction: LR is wider; TB is taller. */
  rankdir?: 'LR' | 'TB'
}

export function buildClusteredDot(opts: DotOptions): string {
  const { graph, cyclicNodes = new Set(), edgeStyle = 'cross-vs-intra', rankdir = 'LR' } = opts

  const nodes = new Set<string>()
  for (const [from, deps] of Object.entries(graph)) {
    nodes.add(from)
    for (const to of deps) nodes.add(to)
  }

  const byPkg = new Map<string, string[]>()
  for (const n of nodes) {
    const p = pkgOf(n)
    const list = byPkg.get(p) ?? []
    list.push(n)
    byPkg.set(p, list)
  }

  const colorOf = new Map<string, string>()
  ;[...byPkg.keys()].sort().forEach((p, i) => colorOf.set(p, PALETTE[i % PALETTE.length]!))

  const lines: string[] = []
  lines.push('digraph G {')
  lines.push(`  bgcolor="${BG}";`)
  lines.push(`  rankdir=${rankdir};`)
  lines.push('  compound=true;')
  lines.push('  fontname="ui-monospace, monospace";')
  lines.push(`  fontcolor="${NODE_FG}";`)
  lines.push(
    `  node [shape=box, style="filled,rounded", fontname="ui-monospace, monospace", fontsize=9, fontcolor="${NODE_FG}", fillcolor="${NODE_FILL}", color="${NODE_FILL}", penwidth=1];`,
  )
  lines.push(`  edge [color="${INTRA_EDGE}", arrowsize=0.6, penwidth=0.8];`)
  lines.push('')

  for (const [pkg, files] of [...byPkg.entries()].sort()) {
    const color = colorOf.get(pkg)!
    lines.push(`  subgraph cluster_${safeId(pkg)} {`)
    lines.push(`    label="${esc(pkg)}";`)
    lines.push(`    labeljust="l";`)
    lines.push(`    fontsize=12;`)
    lines.push(`    fontcolor="${color}";`)
    lines.push(`    color="${color}";`)
    lines.push(`    style="rounded";`)
    lines.push(`    penwidth=2;`)
    for (const file of files.sort()) {
      const label = file.replace(pkg + '/', '')
      const isCycle = cyclicNodes.has(file)
      const fill = isCycle ? CYCLE_FILL : NODE_FILL
      const stroke = isCycle ? CYCLE_STROKE : color
      lines.push(`    "${esc(file)}" [label="${esc(label)}", fillcolor="${fill}", color="${stroke}"];`)
    }
    lines.push('  }')
  }

  lines.push('')
  for (const [from, deps] of Object.entries(graph)) {
    for (const to of deps) {
      const fromPkg = pkgOf(from)
      const toPkg = pkgOf(to)
      const cross = fromPkg !== toPkg
      const color = edgeStyle === 'uniform' ? INTRA_EDGE : cross ? CROSS_EDGE : INTRA_EDGE
      const penwidth = cross ? 1.5 : 0.8
      lines.push(`  "${esc(from)}" -> "${esc(to)}" [color="${color}", penwidth=${penwidth}];`)
    }
  }

  lines.push('}')
  return lines.join('\n') + '\n'
}

/** Collapse to one node per package, with edge weights = file-edge count. */
export function buildOverviewDot(graph: Record<string, string[]>): string {
  const pairs = new Map<string, number>()
  const pkgs = new Set<string>()
  for (const [from, deps] of Object.entries(graph)) {
    const fp = pkgOf(from)
    pkgs.add(fp)
    for (const to of deps) {
      const tp = pkgOf(to)
      pkgs.add(tp)
      if (fp === tp) continue
      const k = `${fp}|${tp}`
      pairs.set(k, (pairs.get(k) ?? 0) + 1)
    }
  }

  const colorOf = new Map<string, string>()
  ;[...pkgs].sort().forEach((p, i) => colorOf.set(p, PALETTE[i % PALETTE.length]!))

  const lines: string[] = []
  lines.push('digraph Overview {')
  lines.push(`  bgcolor="${BG}";`)
  lines.push('  rankdir=LR;')
  lines.push('  fontname="ui-monospace, monospace";')
  lines.push(`  fontcolor="${NODE_FG}";`)
  lines.push(
    `  node [shape=box, style="filled,rounded", fontname="ui-monospace, monospace", fontsize=14, fontcolor="${NODE_FG}", penwidth=2];`,
  )
  for (const p of [...pkgs].sort()) {
    const c = colorOf.get(p)!
    lines.push(`  "${esc(p)}" [fillcolor="${NODE_FILL}", color="${c}"];`)
  }
  for (const [k, n] of [...pairs.entries()].sort()) {
    const [from, to] = k.split('|') as [string, string]
    lines.push(`  "${esc(from)}" -> "${esc(to)}" [label="${n}", color="${CROSS_EDGE}", fontcolor="${NODE_FG}", penwidth=${Math.min(1 + Math.log2(n), 5)}];`)
  }
  lines.push('}')
  return lines.join('\n') + '\n'
}
