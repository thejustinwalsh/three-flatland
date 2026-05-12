#!/usr/bin/env node
// Deep scroll perf probe — instruments specific hot paths in the app
// (motion.ts rAF, HeroShader rAF, IntersectionObserver callbacks,
// setProperty calls per source, scroll listener handlers) and captures
// Chrome CDP tracing for the categorical breakdown (Layout, Paint,
// Style, Composite, Script).
//
// Goal: stop guessing where scroll time goes, MEASURE which specific
// piece of work is over budget on WebKit and target it precisely.
//
// Run: pnpm preview running on :4321, then
//      node scripts/perf-probe-scroll-deep.mjs

import { chromium, webkit } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const URL = 'http://localhost:4321/three-flatland/'
const SCROLL_MS = 4000
const SCROLL_STEPS = 80
const TRACE_FILE = '/tmp/tf-perf-trace.json'

/**
 * Init script — runs in the page BEFORE app code. Monkey-patches the
 * APIs we want to attribute time to. Each patched call writes a
 * `performance.measure()` so the same data can be retrieved at the end
 * via `performance.getEntriesByType('measure')` regardless of browser.
 */
function makeInitScript() {
    return `
        window.__tfDeep = {
            // rAF callback timings tagged by call-site (best-effort)
            rafByOwner: {},
            rafCount: 0,
            // setProperty calls grouped by selector hint (the elem's
            // first class as a coarse owner attribution)
            setPropByOwner: {},
            setPropTotal: 0,
            // Long tasks during scroll
            longTasks: [],
            // Scroll listener handler durations
            scrollHandlerMs: [],
            // IntersectionObserver callback durations
            ioCbMs: [],
            // Frame timeline (rAF dt values)
            frameTimes: [],
            // Active flag — only collect during the scenario
            collecting: false,
        }

        // ── rAF wrapper — tags each callback by who scheduled it ──
        const _raf = window.requestAnimationFrame.bind(window)
        window.requestAnimationFrame = function(cb) {
            // Stack hint: who's scheduling? Take the first non-rAF
            // frame from the call stack as a coarse owner attribution.
            let owner = 'unknown'
            try {
                const stk = new Error().stack || ''
                const m = stk.match(/at\\s+([^\\s\\n]+)/g) || []
                // Look for an app-source line; skip rAF wrapper frames
                for (const f of m.slice(1, 8)) {
                    if (/motion|HeroShader|GalleryTile|sounds|scroll/.test(f)) {
                        owner = f.replace(/^at\\s+/, '').slice(0, 60)
                        break
                    }
                }
                if (owner === 'unknown' && m.length > 1) owner = m[1].replace(/^at\\s+/, '').slice(0, 60)
            } catch {}
            return _raf((t) => {
                if (!window.__tfDeep.collecting) return cb(t)
                const t0 = performance.now()
                try { cb(t) } finally {
                    const dt = performance.now() - t0
                    const o = window.__tfDeep.rafByOwner
                    if (!o[owner]) o[owner] = { count: 0, total: 0, max: 0 }
                    o[owner].count++
                    o[owner].total += dt
                    if (dt > o[owner].max) o[owner].max = dt
                    window.__tfDeep.rafCount++
                }
            })
        }

        // ── setProperty wrapper — tags by element's first class ──
        const _setProp = CSSStyleDeclaration.prototype.setProperty
        CSSStyleDeclaration.prototype.setProperty = function(name, val, prio) {
            if (window.__tfDeep.collecting) {
                let owner = 'inline'
                try {
                    const el = this.parentRule || this.ownerNode || null
                    // For inline styles on elements, parentRule is null;
                    // ownerNode is non-standard. Use a different approach.
                } catch {}
                // The CSSStyleDeclaration doesn't expose its element
                // reliably; we'll bucket by property name as a rough
                // proxy for "what kind of work."
                owner = name.startsWith('--') ? name : 'other'
                const o = window.__tfDeep.setPropByOwner
                o[owner] = (o[owner] || 0) + 1
                window.__tfDeep.setPropTotal++
            }
            return _setProp.apply(this, arguments)
        }

        // ── IntersectionObserver wrapper — tag callback duration ──
        const _IO = window.IntersectionObserver
        window.IntersectionObserver = class extends _IO {
            constructor(cb, opts) {
                super((entries, obs) => {
                    if (!window.__tfDeep.collecting) return cb(entries, obs)
                    const t0 = performance.now()
                    try { cb(entries, obs) } finally {
                        window.__tfDeep.ioCbMs.push(performance.now() - t0)
                    }
                }, opts)
            }
        }

        // ── scroll listener wrapper ──
        const _addEL = EventTarget.prototype.addEventListener
        EventTarget.prototype.addEventListener = function(type, listener, opts) {
            if (type === 'scroll' && typeof listener === 'function') {
                const wrapped = function(e) {
                    if (!window.__tfDeep.collecting) return listener.call(this, e)
                    const t0 = performance.now()
                    try { listener.call(this, e) } finally {
                        window.__tfDeep.scrollHandlerMs.push(performance.now() - t0)
                    }
                }
                return _addEL.call(this, type, wrapped, opts)
            }
            return _addEL.call(this, type, listener, opts)
        }

        // ── Long tasks ──
        try {
            const obs = new _IO ? null : null
            const lto = new PerformanceObserver((list) => {
                if (!window.__tfDeep.collecting) return
                for (const e of list.getEntries()) {
                    window.__tfDeep.longTasks.push({ dur: e.duration, name: e.name, attribution: (e.attribution || []).map(a => a.containerName || a.name) })
                }
            })
            lto.observe({ entryTypes: ['longtask'] })
        } catch {}

        // ── rAF dt timeline ──
        let lastRaf = 0
        const sample = (t) => {
            if (window.__tfDeep.collecting && lastRaf) {
                window.__tfDeep.frameTimes.push(t - lastRaf)
            }
            lastRaf = t
            _raf(sample)
        }
        _raf(sample)
    `
}

async function probe(browserType, name, withTrace = false) {
    const browser = await browserType.launch({
        headless: true,
        args: browserType === chromium
            ? ['--use-gl=angle', '--enable-gpu', '--ignore-gpu-blocklist']
            : [],
    })
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const page = await ctx.newPage()

    await page.addInitScript(makeInitScript())

    await page.goto(URL, { waitUntil: 'load' })
    await page.waitForTimeout(500)

    // Optional Chrome CDP tracing for the full categorical pie
    if (withTrace && browserType === chromium) {
        await page.context().tracing.start({ screenshots: false, snapshots: false })
    }

    await page.evaluate(() => { window.__tfDeep.collecting = true })

    // Programmatic scroll top→bottom
    const pageHeight = await page.evaluate(() =>
        Math.max(document.body.scrollHeight, document.documentElement.scrollHeight)
            - window.innerHeight,
    )
    const stepPx = Math.ceil(pageHeight / SCROLL_STEPS)
    const stepMs = SCROLL_MS / SCROLL_STEPS
    for (let i = 1; i <= SCROLL_STEPS; i++) {
        await page.evaluate((y) => window.scrollTo(0, y), i * stepPx)
        await page.waitForTimeout(stepMs)
    }

    await page.evaluate(() => { window.__tfDeep.collecting = false })

    if (withTrace && browserType === chromium) {
        await page.context().tracing.stop({ path: TRACE_FILE })
    }

    const data = await page.evaluate(() => {
        const d = window.__tfDeep
        const ft = d.frameTimes
        const sum = (arr) => arr.reduce((a, b) => a + b, 0)
        const sortedFt = [...ft].sort((a, b) => a - b)
        return {
            frameCount: ft.length,
            avgFrameMs: ft.length ? sum(ft) / ft.length : 0,
            p95FrameMs: sortedFt.length ? sortedFt[Math.floor(sortedFt.length * 0.95)] : 0,
            maxFrameMs: ft.reduce((a, b) => Math.max(a, b), 0),
            slowFrames16: ft.filter((f) => f > 16.7).length,
            slowFrames33: ft.filter((f) => f > 33).length,
            // Per-owner rAF breakdown (top 8)
            rafByOwner: Object.entries(d.rafByOwner)
                .sort((a, b) => b[1].total - a[1].total)
                .slice(0, 8)
                .map(([k, v]) => ({ owner: k, count: v.count, totalMs: v.total, avgMs: v.total / v.count, maxMs: v.max })),
            rafCount: d.rafCount,
            // setProperty breakdown
            setPropTotal: d.setPropTotal,
            setPropByOwner: Object.entries(d.setPropByOwner)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 8)
                .map(([k, v]) => ({ name: k, count: v })),
            // IO callback total/max
            ioCount: d.ioCbMs.length,
            ioTotalMs: sum(d.ioCbMs),
            ioMaxMs: d.ioCbMs.reduce((a, b) => Math.max(a, b), 0),
            // Scroll handler total/max
            scrollHandlerCount: d.scrollHandlerMs.length,
            scrollHandlerTotalMs: sum(d.scrollHandlerMs),
            scrollHandlerMaxMs: d.scrollHandlerMs.reduce((a, b) => Math.max(a, b), 0),
            // Long tasks
            longTaskCount: d.longTasks.length,
            longTaskTotalMs: sum(d.longTasks.map((t) => t.dur)),
            longTasks: d.longTasks.slice(0, 5),
        }
    })

    await browser.close()
    return { name, ...data }
}

;(async () => {
    console.log('Deep scroll probe (~5s/browser)...')
    const chrome = await probe(chromium, 'Chromium', true) // with CDP trace
    const wk = await probe(webkit, 'WebKit', false)

    const fmt = (n, d = 1) => (typeof n === 'number' ? n.toFixed(d) : String(n))
    const row = (label, a, b, unit = '') => {
        const aStr = fmt(a).padStart(10)
        const bStr = fmt(b).padStart(10)
        const ratio = typeof a === 'number' && a > 0 && typeof b === 'number'
            ? ` (${fmt(b / a, 2)}× Chrome)` : ''
        console.log(`  ${label.padEnd(30)} ${aStr}  ${bStr}${unit}${ratio}`)
    }

    console.log('\n═══ FRAME BUDGET ═══\n')
    console.log('  metric                         Chromium      WebKit')
    console.log('  ' + '─'.repeat(60))
    row('Frames sampled',         chrome.frameCount, wk.frameCount)
    row('Avg frame',              chrome.avgFrameMs, wk.avgFrameMs, ' ms')
    row('p95 frame',              chrome.p95FrameMs, wk.p95FrameMs, ' ms')
    row('Max frame',              chrome.maxFrameMs, wk.maxFrameMs, ' ms')
    row('Frames > 16.7ms',        chrome.slowFrames16, wk.slowFrames16)
    row('Frames > 33ms',          chrome.slowFrames33, wk.slowFrames33)

    console.log('\n═══ rAF BREAKDOWN — who is scheduling and how much time ═══\n')
    for (const browser of ['chrome', 'wk']) {
        const data = browser === 'chrome' ? chrome : wk
        console.log(`  ── ${data.name} (total rAF callbacks: ${data.rafCount}) ──`)
        for (const o of data.rafByOwner) {
            console.log(`    ${(o.totalMs.toFixed(1) + 'ms').padStart(8)} (${o.count.toString().padStart(3)} calls, avg ${o.avgMs.toFixed(2)}ms, max ${o.maxMs.toFixed(1)}ms)  ${o.owner}`)
        }
        console.log()
    }

    console.log('═══ setProperty BREAKDOWN ═══\n')
    for (const browser of ['chrome', 'wk']) {
        const data = browser === 'chrome' ? chrome : wk
        console.log(`  ── ${data.name} (total: ${data.setPropTotal}) ──`)
        for (const o of data.setPropByOwner) {
            console.log(`    ${o.count.toString().padStart(5)}  ${o.name}`)
        }
        console.log()
    }

    console.log('═══ INTERSECTION OBSERVER + SCROLL HANDLER COST ═══\n')
    row('IO callback count',      chrome.ioCount, wk.ioCount)
    row('IO callback total',      chrome.ioTotalMs, wk.ioTotalMs, ' ms')
    row('IO callback max single', chrome.ioMaxMs, wk.ioMaxMs, ' ms')
    console.log()
    row('Scroll handler count',   chrome.scrollHandlerCount, wk.scrollHandlerCount)
    row('Scroll handler total',   chrome.scrollHandlerTotalMs, wk.scrollHandlerTotalMs, ' ms')
    row('Scroll handler max one', chrome.scrollHandlerMaxMs, wk.scrollHandlerMaxMs, ' ms')

    console.log('\n═══ LONG TASKS ═══\n')
    row('Long-task count',        chrome.longTaskCount, wk.longTaskCount)
    row('Long-task total',        chrome.longTaskTotalMs, wk.longTaskTotalMs, ' ms')

    if (fs.existsSync(TRACE_FILE)) {
        console.log(`\n📊 Chromium CDP trace saved: ${TRACE_FILE}`)
        console.log('   Open in chrome://tracing or DevTools Performance > Load Profile.')
    }
})().catch((e) => { console.error(e); process.exit(1) })
