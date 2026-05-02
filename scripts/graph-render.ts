// Emit JSON graph data for the cytoscape viewer (runtime monorepo + overview).

import madge from 'madge'
import { mkdirSync, writeFileSync } from 'node:fs'
import { buildGraphData, buildOverviewData } from './lib/build-graph-data.ts'

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

const detail = buildGraphData({ graph })
writeFileSync('graphs/monorepo.json', JSON.stringify(detail))
console.log(
  `graphs/monorepo.json — ${detail.meta.fileCount} files, ${detail.meta.edgeCount} edges (${detail.meta.crossCount} cross-package)`,
)

const overview = buildOverviewData(graph)
writeFileSync('graphs/overview.json', JSON.stringify(overview))
console.log(
  `graphs/overview.json — ${overview.meta.fileCount} packages, ${overview.meta.edgeCount} cross-package edges`,
)
