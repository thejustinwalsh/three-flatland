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
import { buildClusteredDot, pkgOf } from './lib/build-dot.ts'

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
const cyclicNodes = new Set<string>(cycles.flat())

mkdirSync('graphs', { recursive: true })
const dot = buildClusteredDot({ graph: typeOnly, cyclicNodes })
writeFileSync('graphs/types.dot', dot)
execSync('dot -Tsvg -o graphs/types.svg graphs/types.dot')

// Cross-package edge summary — the actionable view for declaring deps in package.json.
type Edge = { from: string; to: string; fromPkg: string; toPkg: string }
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

const fileCount = new Set(
  Object.keys(typeOnly).concat(Object.values(typeOnly).flat()),
).size
const totalEdges = Object.values(typeOnly).reduce((n, ds) => n + ds.length, 0)
console.log(`graphs/types.svg — ${fileCount} files, ${totalEdges} type-only edges`)
console.log(`\nCross-package type-only edges (${crossPkg.length} total, ${byPair.size} pkg pairs):`)
for (const [pair, edges] of [...byPair.entries()].sort()) {
  console.log(`  ${pair}  (${edges.length})`)
}

console.log(`\nType-only cycles: ${cycles.length}`)
for (const c of cycles) {
  const sorted = [...c].sort()
  console.log(`  ${sorted.join(' <-> ')}`)
}
