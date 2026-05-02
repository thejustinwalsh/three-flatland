// Build a TYPE-ONLY dependency graph by diffing two madge runs:
//   * all edges (skipTypeImports: false)  →  runtime + type imports
//   * runtime-only (skipTypeImports: true) →  runtime imports only
// The set difference is the edges contributed solely by `import type` (or
// type-only specifiers in mixed imports).
//
// Type-only edges don't break runtime — `verbatimModuleSyntax: true` erases
// them — but they still create type-time coupling. If they cross package
// boundaries, the imported package usually needs to be in the importer's
// `dependencies` or `peerDependencies` so consumer `tsc` runs can resolve
// the published .d.ts.

import madge from 'madge'
import { writeFileSync, mkdirSync } from 'node:fs'
import { execSync } from 'node:child_process'

const TARGETS = ['packages', 'minis', 'tools']
const BASE = {
  fileExtensions: ['ts', 'tsx'],
  tsConfig: 'tsconfig.madge.json',
}

const [allRes, runtimeRes] = await Promise.all([
  madge(TARGETS, {
    ...BASE,
    detectiveOptions: {
      ts: { skipTypeImports: false },
      tsx: { skipTypeImports: false },
    },
  }),
  madge(TARGETS, {
    ...BASE,
    detectiveOptions: {
      ts: { skipTypeImports: true },
      tsx: { skipTypeImports: true },
    },
  }),
])

const all = allRes.obj() as Record<string, string[]>
const runtime = runtimeRes.obj() as Record<string, string[]>

// Per-file diff: edges present in `all` but not in `runtime` are type-only.
const typeOnly: Record<string, string[]> = {}
for (const [from, deps] of Object.entries(all)) {
  const runtimeSet = new Set(runtime[from] ?? [])
  const ts = deps.filter((d) => !runtimeSet.has(d))
  if (ts.length) typeOnly[from] = ts
}

// Find SCCs in the type-only graph (Tarjan).
function tarjan(graph: Record<string, string[]>): string[][] {
  const index = new Map<string, number>()
  const lowlink = new Map<string, number>()
  const onStack = new Set<string>()
  const stack: string[] = []
  const sccs: string[][] = []
  let i = 0

  const nodes = new Set<string>()
  for (const [from, deps] of Object.entries(graph)) {
    nodes.add(from)
    for (const to of deps) nodes.add(to)
  }

  const strongconnect = (v: string) => {
    index.set(v, i)
    lowlink.set(v, i)
    i++
    stack.push(v)
    onStack.add(v)
    for (const w of graph[v] ?? []) {
      if (!index.has(w)) {
        strongconnect(w)
        lowlink.set(v, Math.min(lowlink.get(v)!, lowlink.get(w)!))
      } else if (onStack.has(w)) {
        lowlink.set(v, Math.min(lowlink.get(v)!, index.get(w)!))
      }
    }
    if (lowlink.get(v) === index.get(v)) {
      const comp: string[] = []
      let w: string
      do {
        w = stack.pop()!
        onStack.delete(w)
        comp.push(w)
      } while (w !== v)
      // Only report cycles (size > 1) or self-loops.
      if (comp.length > 1 || (graph[v] ?? []).includes(v)) sccs.push(comp)
    }
  }

  for (const v of nodes) if (!index.has(v)) strongconnect(v)
  return sccs
}

const cycles = tarjan(typeOnly)

// Render with graphviz directly (we own the edge set, can't reuse madge image()).
const nodes = new Set<string>()
const edgeLines: string[] = []
for (const [from, deps] of Object.entries(typeOnly)) {
  nodes.add(from)
  for (const to of deps) {
    nodes.add(to)
    edgeLines.push(`  "${from}" -> "${to}";`)
  }
}

// Tag nodes that participate in a cycle for visual emphasis.
const cyclicNodes = new Set<string>(cycles.flat())

const dot = [
  'digraph TypesOnly {',
  '  bgcolor="#00021c";',
  '  rankdir=LR;',
  '  fontname="monospace";',
  '  fontcolor="#f0edd8";',
  '  node [shape=box, fontname="monospace", fontcolor="#f0edd8", color="#47cca9", style=filled, fillcolor="#1c284d"];',
  '  edge [color="#732866"];',
  ...[...nodes].sort().map((n) => {
    const fill = cyclicNodes.has(n) ? '"#732866"' : '"#1c284d"'
    const color = cyclicNodes.has(n) ? '"#d94c87"' : '"#47cca9"'
    return `  "${n}" [fillcolor=${fill}, color=${color}];`
  }),
  ...edgeLines,
  '}',
  '',
].join('\n')

mkdirSync('graphs', { recursive: true })
writeFileSync('graphs/types.dot', dot)
execSync('dot -Tsvg -o graphs/types.svg graphs/types.dot')

// Cross-package edge summary — the actionable view for declaring deps in package.json.
type Edge = { from: string; to: string; fromPkg: string; toPkg: string }
const pkgOf = (p: string) => p.split('/').slice(0, 2).join('/')
const crossPkg: Edge[] = []
for (const [from, deps] of Object.entries(typeOnly)) {
  const fromPkg = pkgOf(from)
  for (const to of deps) {
    const toPkg = pkgOf(to)
    if (fromPkg !== toPkg) crossPkg.push({ from, to, fromPkg, toPkg })
  }
}

// Group cross-package edges by package pair so the summary is scannable.
const byPair = new Map<string, Edge[]>()
for (const e of crossPkg) {
  const k = `${e.fromPkg} -> ${e.toPkg}`
  const list = byPair.get(k) ?? []
  list.push(e)
  byPair.set(k, list)
}

const totalEdges = Object.values(typeOnly).reduce((n, ds) => n + ds.length, 0)
console.log(`graphs/types.svg — ${nodes.size} files, ${totalEdges} type-only edges`)
console.log(`\nCross-package type-only edges (${crossPkg.length} total, ${byPair.size} pkg pairs):`)
for (const [pair, edges] of [...byPair.entries()].sort()) {
  console.log(`  ${pair}  (${edges.length})`)
}

console.log(`\nType-only cycles: ${cycles.length}`)
for (const c of cycles) {
  const sorted = [...c].sort()
  console.log(`  ${sorted.join(' <-> ')}`)
}
