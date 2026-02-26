/**
 * Analyze Chrome DevTools trace files for performance profiling.
 *
 * Usage:
 *   npx tsx scripts/analyze-trace.ts <trace-file> [trace-file2 ...]
 *
 * Compares multiple traces side-by-side when multiple files are given.
 * Shows per-frame cost breakdown by function, sorted by time.
 */

import { readFileSync } from 'node:fs'
import { basename } from 'node:path'

interface TraceEvent {
  name?: string
  cat?: string
  ph?: string
  dur?: number
  ts?: number
  args?: {
    data?: {
      cpuProfile?: {
        nodes?: ProfileNode[]
        samples?: number[]
        timeDeltas?: number[]
      }
      functionName?: string
      url?: string
      lineNumber?: number
    }
  }
}

interface ProfileNode {
  id: number
  callFrame: {
    functionName: string
    url: string
    lineNumber: number
    columnNumber: number
  }
  children?: number[]
}

interface TraceAnalysis {
  label: string
  avgFrame: number
  fps: number
  nframes: number
  gcTotal: number
  gcCount: number
  functions: { key: string; perFrame: number; pct: number }[]
}

function analyzeTrace(filePath: string): TraceAnalysis | null {
  const raw = readFileSync(filePath, 'utf-8')
  const data = JSON.parse(raw) as TraceEvent[] | { traceEvents: TraceEvent[] }
  const events: TraceEvent[] = Array.isArray(data) ? data : data.traceEvents ?? []

  // Frame times
  const frameDurs: number[] = []
  const gcDurs: number[] = []
  for (const e of events) {
    if (e.name === 'FireAnimationFrame' && (e.dur ?? 0) > 0) {
      frameDurs.push(e.dur!)
    }
    if ((e.name === 'MinorGC' || e.name === 'MajorGC') && (e.dur ?? 0) > 0) {
      gcDurs.push(e.dur!)
    }
  }

  // CPU profile reconstruction
  const nodes = new Map<number, ProfileNode>()
  const allSamples: number[] = []
  const chunkTimestamps: number[] = []

  for (const e of events) {
    if (e.name === 'ProfileChunk') {
      const ts = e.ts ?? 0
      const cp = e.args?.data?.cpuProfile
      if (!cp) continue
      for (const node of cp.nodes ?? []) {
        nodes.set(node.id, node)
      }
      allSamples.push(...(cp.samples ?? []))
      chunkTimestamps.push(ts)
    }
  }

  if (chunkTimestamps.length < 2 || allSamples.length === 0 || frameDurs.length === 0) {
    return null
  }

  const totalDur = chunkTimestamps[chunkTimestamps.length - 1]! - chunkTimestamps[0]!
  const interval = totalDur / allSamples.length
  const nframes = frameDurs.length

  // Self-time per node
  const selfTime = new Map<number, number>()
  for (const sid of allSamples) {
    selfTime.set(sid, (selfTime.get(sid) ?? 0) + interval)
  }

  // Aggregate by function name + file
  const fnTime = new Map<string, number>()
  for (const [nid, t] of selfTime) {
    const node = nodes.get(nid)
    if (!node) continue
    const cf = node.callFrame
    const fn = cf.functionName || '(other)'
    const url = cf.url ? cf.url.split('/').pop()!.split('?')[0]! : ''
    const key = url ? `${fn} (${url})` : fn
    fnTime.set(key, (fnTime.get(key) ?? 0) + t)
  }

  const avgFrame = frameDurs.reduce((a, b) => a + b, 0) / nframes / 1000
  const fps = avgFrame > 0 ? 1000 / avgFrame : 0

  const functions = [...fnTime.entries()]
    .map(([key, t]) => ({
      key,
      perFrame: t / nframes / 1000,
      pct: (t / totalDur) * 100,
    }))
    .sort((a, b) => b.perFrame - a.perFrame)
    .filter((f) => f.pct >= 0.3)

  return {
    label: basename(filePath, '.json'),
    avgFrame,
    fps,
    nframes,
    gcTotal: gcDurs.reduce((a, b) => a + b, 0) / 1000,
    gcCount: gcDurs.length,
    functions,
  }
}

// --- Main ---

const files = process.argv.slice(2)
if (files.length === 0) {
  console.error('Usage: npx tsx scripts/analyze-trace.ts <trace-file> [trace-file2 ...]')
  process.exit(1)
}

for (const file of files) {
  const result = analyzeTrace(file)
  if (!result) {
    console.log(`\n${basename(file)}: insufficient data`)
    continue
  }

  console.log(
    `\n${result.label}: ${result.avgFrame.toFixed(1)}ms/frame (${result.fps.toFixed(0)}fps), ${result.nframes} frames, GC=${result.gcTotal.toFixed(1)}ms/${result.gcCount}x`
  )
  console.log(`  ${'Function'.padEnd(55)} ${'ms/frame'.padStart(8)} ${'% total'.padStart(8)}`)
  console.log(`  ${'-'.repeat(55)} ${'-'.repeat(8)} ${'-'.repeat(8)}`)

  for (const f of result.functions.slice(0, 20)) {
    console.log(
      `  ${f.key.padEnd(55)} ${f.perFrame.toFixed(2).padStart(7)}ms ${f.pct.toFixed(1).padStart(7)}%`
    )
  }
}
