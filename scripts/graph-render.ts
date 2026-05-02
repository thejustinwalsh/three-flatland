// Render the runtime monorepo dependency graph with package clusters.
// Replaces `madge --image`; we need our own dot for subgraph clusters and
// cross-package edge highlighting.

import madge from 'madge'
import { execSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { buildClusteredDot, buildOverviewDot, pkgOf } from './lib/build-dot.ts'

const TARGETS = ['packages', 'minis', 'tools']

const result = await madge(TARGETS, {
  fileExtensions: ['ts', 'tsx'],
  tsConfig: 'tsconfig.madge.json',
  detectiveOptions: {
    ts: { skipTypeImports: true },
    tsx: { skipTypeImports: true },
  },
})
const graph = result.obj() as Record<string, string[]>

mkdirSync('graphs', { recursive: true })

const detail = buildClusteredDot({ graph })
writeFileSync('graphs/monorepo.dot', detail)
execSync('dot -Tsvg -o graphs/monorepo.svg graphs/monorepo.dot')

const overview = buildOverviewDot(graph)
writeFileSync('graphs/overview.dot', overview)
execSync('dot -Tsvg -o graphs/overview.svg graphs/overview.dot')

const fileCount = new Set(Object.keys(graph).concat(Object.values(graph).flat())).size
const edges = Object.values(graph).reduce((n, ds) => n + ds.length, 0)
const cross = Object.entries(graph).reduce((n, [from, deps]) => {
  const fp = pkgOf(from)
  return n + deps.filter((to) => pkgOf(to) !== fp).length
}, 0)
console.log(`graphs/monorepo.svg — ${fileCount} files, ${edges} edges (${cross} cross-package)`)
console.log(`graphs/overview.svg — package-level summary`)
