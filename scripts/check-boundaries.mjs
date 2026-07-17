#!/usr/bin/env node

/**
 * Module-boundary enforcement without ESLint.
 *
 * @nx/enforce-module-boundaries is an ESLint rule, and this repo is oxlint-only,
 * so we enforce the loader-architecture DAG (.library/three-flatland/loader-architecture.md)
 * directly against the Nx project graph instead.
 *
 * Rule: dependencies only flow DOWNWARD across scope layers.
 *   scope:sibling  (0) — standalone-publishable siblings (bake, normals, atlas, …)
 *   scope:composer (1) — three-flatland (composes siblings)
 *   scope:consumer (2) — presets (consumes the composer)
 * A dependency edge source -> target is illegal when layer(source) < layer(target),
 * i.e. a lower layer reaching UP (e.g. a sibling importing `three-flatland`).
 * Untagged projects (tools, examples, docs) are outside the policy and skipped.
 */

import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const LAYER = { 'scope:sibling': 0, 'scope:composer': 1, 'scope:consumer': 2 }

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
    if (sl < tl) {
      violations.push(`  ${source} (layer ${sl}) → ${target} (layer ${tl}) — a lower layer must not depend on a higher one`)
    }
  }
}

if (violations.length > 0) {
  console.error(`\nModule-boundary violations (${violations.length}):\n${violations.join('\n')}\n`)
  console.error('Dependencies must flow downward: siblings stay standalone and MUST NOT import three-flatland.')
  process.exit(1)
}

console.log('✓ Module boundaries OK — all cross-scope dependencies flow downward.')
