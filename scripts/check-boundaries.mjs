#!/usr/bin/env node

/**
 * Module-boundary enforcement without ESLint.
 *
 * @nx/enforce-module-boundaries is an ESLint rule, and this repo is oxlint-only,
 * so we enforce the loader-architecture DAG (.library/three-flatland/loader-architecture.md)
 * directly against the Nx project graph instead.
 *
 * Rule: dependencies only flow STRICTLY DOWNWARD across scope layers.
 *   scope:foundation (0) — the shared contracts everything builds on (bake, schemas)
 *   scope:sibling    (1) — standalone-publishable siblings (atlas, normals, slug, …)
 *   scope:composer   (2) — three-flatland (composes siblings)
 *   scope:consumer   (3) — presets, devtools (consume the composer)
 * A dependency edge source -> target is illegal unless layer(source) > layer(target):
 *   - UPWARD  (source < target) — e.g. a sibling importing `three-flatland`.
 *   - SIDEWAYS (source == target) — e.g. one sibling importing another; siblings must
 *     stay standalone and reach only DOWN to foundation, never each other.
 * scope:docs (starlight-theme) and untagged projects (tools, examples, docs, minis,
 * benchmarks) are outside the library DAG and intentionally skipped.
 */

import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const LAYER = { 'scope:foundation': 0, 'scope:sibling': 1, 'scope:composer': 2, 'scope:consumer': 3 }

const out = join(mkdtempSync(join(tmpdir(), 'nx-graph-')), 'graph.json')
execFileSync('node_modules/.bin/nx', ['graph', '--file', out], { stdio: 'ignore' })
const { graph } = JSON.parse(readFileSync(out, 'utf8'))

const layerOf = (project) => {
  const tags = graph.nodes[project]?.data?.tags ?? []
  for (const t of tags) if (t in LAYER) return LAYER[t]
  return null
}

const violations = []
for (const [source, edges] of Object.entries(graph.dependencies)) {
  const sl = layerOf(source)
  if (sl === null) continue
  for (const { target } of edges) {
    const tl = layerOf(target)
    if (tl === null) continue
    if (sl <= tl) {
      const kind = sl === tl ? 'SIDEWAYS (same layer — siblings must not depend on each other)' : 'UPWARD (a lower layer must not depend on a higher one)'
      violations.push(`  ${source} (layer ${sl}) → ${target} (layer ${tl}) — ${kind}`)
    }
  }
}

if (violations.length > 0) {
  console.error(`\nModule-boundary violations (${violations.length}):\n${violations.join('\n')}\n`)
  console.error('Dependencies must flow downward: siblings stay standalone and MUST NOT import three-flatland.')
  process.exit(1)
}

console.log('✓ Module boundaries OK — all cross-scope dependencies flow downward.')
