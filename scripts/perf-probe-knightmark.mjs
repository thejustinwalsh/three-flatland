#!/usr/bin/env node
// Knightmark sprite-count perf probe.
//
// Measures the highest knight count that holds 60fps in knightmark
// across Chromium and WebKit. Drives the example via the ?spawn=N
// URL param (added in main.ts), waits for the scene to stabilize,
// then samples frame deltas via requestAnimationFrame for SAMPLE_MS.
//
// Usage:
//   1. In one terminal:  pnpm --filter=example-three-knightmark dev
//      (defaults to http://localhost:5183)
//   2. In another:       node scripts/perf-probe-knightmark.mjs
//
// Optional env:
//   URL=http://localhost:5183   # override base URL
//   COUNTS=1000,5000,10000,20000,30000,50000   # override sweep
//   SAMPLE_MS=4000              # measurement window per condition
//   WARMUP_MS=2000              # discard frames during warmup
//
// Output: per-browser table of (count, median frame ms, p95 ms,
// effective FPS, % frames over 16.7ms). The reportable claim is
// the highest count where median ≤ 16.7ms (60fps) and p95 ≤ 33ms.

import { chromium, webkit } from '@playwright/test'

const URL = process.env.URL ?? 'http://localhost:5183'
const COUNTS = (process.env.COUNTS ?? '1000,5000,10000,20000,30000,50000')
    .split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => n > 0)
const SAMPLE_MS = parseInt(process.env.SAMPLE_MS ?? '4000', 10)
const WARMUP_MS = parseInt(process.env.WARMUP_MS ?? '2000', 10)

async function probe(browserType, count) {
    const browser = await browserType.launch({ headless: true })
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const page = await ctx.newPage()

    await page.addInitScript(`
        window.__probe = { frames: [], measuring: false }
        let last = 0
        const r = window.requestAnimationFrame.bind(window)
        const tick = (t) => {
            if (last && window.__probe.measuring) window.__probe.frames.push(t - last)
            last = t
            r(tick)
        }
        r(tick)
    `)

    await page.goto(`${URL}/?spawn=${count}`, { waitUntil: 'load' })
    await page.waitForTimeout(WARMUP_MS)

    await page.evaluate(() => { window.__probe.frames.length = 0; window.__probe.measuring = true })
    await page.waitForTimeout(SAMPLE_MS)
    await page.evaluate(() => { window.__probe.measuring = false })

    const m = await page.evaluate(() => {
        const f = window.__probe.frames
        const sorted = [...f].sort((a, b) => a - b)
        const sum = f.reduce((a, b) => a + b, 0)
        return {
            n: f.length,
            median: sorted.length ? sorted[Math.floor(sorted.length * 0.5)] : 0,
            p95: sorted.length ? sorted[Math.floor(sorted.length * 0.95)] : 0,
            avg: f.length ? sum / f.length : 0,
            slow16: f.filter((x) => x > 16.7).length,
        }
    })
    await browser.close()
    return m
}

;(async () => {
    const browsers = [
        ['Chromium', chromium],
        ['WebKit',   webkit],
    ]

    for (const [name, browserType] of browsers) {
        console.log(`\n${name} — ${SAMPLE_MS}ms sample after ${WARMUP_MS}ms warmup`)
        console.log('  count    frames  median   p95     avg    >16.7   eff FPS   verdict')
        console.log('  ' + '─'.repeat(76))
        for (const count of COUNTS) {
            const m = await probe(browserType, count)
            const fps = m.avg > 0 ? 1000 / m.avg : 0
            const slowPct = m.n > 0 ? (m.slow16 / m.n) * 100 : 0
            const verdict = m.median <= 16.7 && m.p95 <= 33 ? 'PASS' : 'FAIL'
            const c = (v, w, d = 1) => (typeof v === 'number' ? v.toFixed(d) : String(v)).padStart(w)
            console.log(`  ${c(count, 6, 0)}   ${c(m.n, 5, 0)}   ${c(m.median, 5)}   ${c(m.p95, 5)}   ${c(m.avg, 5)}   ${c(slowPct, 5)}%   ${c(fps, 6)}   ${verdict}`)
        }
    }

    console.log('\n  Reportable claim = highest COUNT where median ≤ 16.7ms AND p95 ≤ 33ms.')
})().catch((e) => { console.error(e); process.exit(1) })
