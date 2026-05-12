#!/usr/bin/env node
// Cross-browser perf probe — measures the landing page in both Chromium
// and WebKit using the same scenario: load, wait for FCP, then sweep the
// mouse across the FeatureCard grid for 3s. Captures load metrics + the
// interaction frame budget.
//
// Run: pnpm preview running on :4321, then
//      node scripts/perf-probe-cross-browser.mjs

import { chromium, webkit } from '@playwright/test'

const URL = 'http://localhost:4321/three-flatland/'
const SCENARIO_MS = 3000
const STEPS = 60 // mousemove samples across the FeatureCard grid

async function probe(browserType, name) {
    const browser = await browserType.launch({ headless: true, args: browserType === chromium ? ["--use-gl=angle","--enable-gpu","--ignore-gpu-blocklist"] : [] })
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const page = await ctx.newPage()

    // Inject perf instrumentation BEFORE page scripts run.
    await page.addInitScript(() => {
        window.__tfPerf = {
            longTasks: [],
            frameTimes: [],
            scenarioStart: 0,
            setPropertyCalls: 0,
        }
        // Count setProperty calls on inline styles (the motion-loop hot path).
        const orig = CSSStyleDeclaration.prototype.setProperty
        CSSStyleDeclaration.prototype.setProperty = function (...args) {
            window.__tfPerf.setPropertyCalls++
            return orig.apply(this, args)
        }
        // Watch long tasks if supported.
        try {
            const obs = new PerformanceObserver((list) => {
                for (const e of list.getEntries()) window.__tfPerf.longTasks.push(e.duration)
            })
            obs.observe({ entryTypes: ['longtask'] })
        } catch {}
        // rAF callback timing — measure intra-frame time deltas.
        let lastRaf = 0
        const sample = (t) => {
            if (lastRaf && window.__tfPerf.scenarioStart) {
                window.__tfPerf.frameTimes.push(t - lastRaf)
            }
            lastRaf = t
            requestAnimationFrame(sample)
        }
        requestAnimationFrame(sample)
    })

    const navStart = Date.now()
    await page.goto(URL, { waitUntil: 'load' })
    const loadDone = Date.now()

    // Wait for the page to fully settle (LCP fires after first paint).
    await page.waitForTimeout(500)

    // Snapshot pre-interaction state, then start scenario.
    await page.evaluate(() => {
        window.__tfPerf.frameTimes.length = 0
        window.__tfPerf.setPropertyCalls = 0
        window.__tfPerf.scenarioStart = performance.now()
    })

    // Find the FeatureCard grid bounds so the sweep crosses real .u-light
    // surfaces. Fallback to a viewport-center sweep if the selector misses.
    const bbox = await page.locator('.feature-grid').boundingBox().catch(() => null)
    const rect = bbox ?? { x: 200, y: 600, width: 1040, height: 400 }

    // Mouse sweep across the grid for SCENARIO_MS, STEPS hops.
    const stepDelay = SCENARIO_MS / STEPS
    for (let i = 0; i < STEPS; i++) {
        const x = rect.x + ((i % STEPS) / STEPS) * rect.width
        const y = rect.y + (((i * 7) % STEPS) / STEPS) * rect.height
        await page.mouse.move(x, y, { steps: 4 })
        await page.waitForTimeout(stepDelay)
    }

    const metrics = await page.evaluate(() => {
        const p = window.__tfPerf
        const paint = performance.getEntriesByType('paint')
        const nav = performance.getEntriesByType('navigation')[0]
        const fcp = paint.find((e) => e.name === 'first-contentful-paint')?.startTime ?? null
        const lcp = window.__lcpVal ?? null
        const frames = p.frameTimes
        const sum = frames.reduce((a, b) => a + b, 0)
        const slowFrames = frames.filter((f) => f > 16.7).length
        const veryslow = frames.filter((f) => f > 33).length
        const max = frames.reduce((a, b) => Math.max(a, b), 0)
        const avgFrame = frames.length ? sum / frames.length : 0
        return {
            fcp,
            lcp,
            domContentLoaded: nav?.domContentLoadedEventEnd ?? null,
            loadEvent: nav?.loadEventEnd ?? null,
            transferSize: nav?.transferSize ?? null,
            longTasks: p.longTasks.slice(),
            longTaskCount: p.longTasks.length,
            longTaskTotalMs: p.longTasks.reduce((a, b) => a + b, 0),
            setPropertyCalls: p.setPropertyCalls,
            scenarioMs: performance.now() - p.scenarioStart,
            frameCount: frames.length,
            avgFrameMs: avgFrame,
            maxFrameMs: max,
            slowFrames, // > 60fps budget
            veryslowFrames: veryslow, // > 30fps
            // Memory if Chrome
            heapUsedMB: performance.memory?.usedJSHeapSize / (1024 * 1024) ?? null,
        }
    })

    await browser.close()
    return { name, navMs: loadDone - navStart, ...metrics }
}

;(async () => {
    console.log('Probing... (this takes ~10s per browser)')
    const chrome = await probe(chromium, 'Chromium')
    const webkitR = await probe(webkit, 'WebKit')

    const fmt = (n, d = 1) => (typeof n === 'number' ? n.toFixed(d) : String(n))
    const row = (label, a, b, unit = '') => {
        const aStr = fmt(a).padStart(10)
        const bStr = fmt(b).padStart(10)
        const ratio = (typeof a === 'number' && a > 0 && typeof b === 'number')
            ? ` (${fmt(b / a, 2)}× Chrome)` : ''
        console.log(`  ${label.padEnd(28)} ${aStr}  ${bStr}${unit}${ratio}`)
    }

    console.log('\n=== LANDING PAGE — Chromium vs WebKit ===\n')
    console.log('  metric                       Chromium      WebKit')
    console.log('  ' + '─'.repeat(58))
    row('Nav-to-load (wall)',     chrome.navMs, webkitR.navMs, ' ms')
    row('FCP',                    chrome.fcp, webkitR.fcp, ' ms')
    row('DOMContentLoaded',       chrome.domContentLoaded, webkitR.domContentLoaded, ' ms')
    row('Load event',             chrome.loadEvent, webkitR.loadEvent, ' ms')
    console.log()
    row('Long tasks (count)',     chrome.longTaskCount, webkitR.longTaskCount)
    row('Long tasks (total ms)',  chrome.longTaskTotalMs, webkitR.longTaskTotalMs, ' ms')
    console.log()
    console.log('  ── 3s mouse sweep across feature-grid ──')
    row('Frames sampled',         chrome.frameCount, webkitR.frameCount)
    row('Avg frame',              chrome.avgFrameMs, webkitR.avgFrameMs, ' ms')
    row('Max frame',              chrome.maxFrameMs, webkitR.maxFrameMs, ' ms')
    row('Frames > 16.7ms (60fps)', chrome.slowFrames, webkitR.slowFrames)
    row('Frames > 33ms (30fps)',  chrome.veryslowFrames, webkitR.veryslowFrames)
    row('setProperty calls',      chrome.setPropertyCalls, webkitR.setPropertyCalls)
    console.log()
    if (chrome.heapUsedMB) row('JS heap (MB)', chrome.heapUsedMB, webkitR.heapUsedMB ?? 'n/a')
})().catch((e) => { console.error(e); process.exit(1) })
