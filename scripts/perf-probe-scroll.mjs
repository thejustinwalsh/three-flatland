#!/usr/bin/env node
// Scroll perf probe — measures frame budget during a programmatic scroll
// from top to bottom of the landing page in both Chromium and WebKit.
// Captures rAF frame timing, long tasks during scroll, layout shifts,
// and setProperty load. Targets the scroll-driven animations (header
// compact-on-scroll, .u-reveal animation-timeline: view(), rim-light
// scene-angle updates).
//
// Run: pnpm preview running on :4321, then
//      node scripts/perf-probe-scroll.mjs

import { chromium, webkit } from '@playwright/test'

const URL = 'http://localhost:4321/three-flatland/'
const SCROLL_MS = 4000
const SCROLL_STEPS = 80 // ~50ms between steps; each step scrolls 50-200px

async function probe(browserType, name) {
    const browser = await browserType.launch({
        headless: true,
        args: browserType === chromium
            ? ['--use-gl=angle', '--enable-gpu', '--ignore-gpu-blocklist']
            : [],
    })
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const page = await ctx.newPage()

    await page.addInitScript(() => {
        window.__tfPerf = {
            longTasks: [],
            frameTimes: [],
            scenarioStart: 0,
            setPropertyCalls: 0,
            cls: 0,
            scrollEvents: 0,
        }
        const orig = CSSStyleDeclaration.prototype.setProperty
        CSSStyleDeclaration.prototype.setProperty = function (...args) {
            window.__tfPerf.setPropertyCalls++
            return orig.apply(this, args)
        }
        try {
            const obs = new PerformanceObserver((list) => {
                for (const e of list.getEntries()) window.__tfPerf.longTasks.push(e.duration)
            })
            obs.observe({ entryTypes: ['longtask'] })
        } catch {}
        try {
            const clsObs = new PerformanceObserver((list) => {
                for (const e of list.getEntries()) {
                    if (!e.hadRecentInput) window.__tfPerf.cls += e.value
                }
            })
            clsObs.observe({ entryTypes: ['layout-shift'] })
        } catch {}
        let lastRaf = 0
        const sample = (t) => {
            if (lastRaf && window.__tfPerf.scenarioStart) {
                window.__tfPerf.frameTimes.push(t - lastRaf)
            }
            lastRaf = t
            requestAnimationFrame(sample)
        }
        requestAnimationFrame(sample)
        window.addEventListener('scroll', () => {
            if (window.__tfPerf.scenarioStart) window.__tfPerf.scrollEvents++
        }, { passive: true })
    })

    await page.goto(URL, { waitUntil: 'load' })
    await page.waitForTimeout(500) // let page settle

    // Total scroll-able height for the landing page
    const pageHeight = await page.evaluate(() =>
        Math.max(document.body.scrollHeight, document.documentElement.scrollHeight)
            - window.innerHeight,
    )

    await page.evaluate(() => {
        window.__tfPerf.frameTimes.length = 0
        window.__tfPerf.setPropertyCalls = 0
        window.__tfPerf.cls = 0
        window.__tfPerf.scrollEvents = 0
        window.__tfPerf.scenarioStart = performance.now()
    })

    // Scroll from top to bottom in steps over SCROLL_MS
    const stepPx = Math.ceil(pageHeight / SCROLL_STEPS)
    const stepMs = SCROLL_MS / SCROLL_STEPS
    for (let i = 1; i <= SCROLL_STEPS; i++) {
        await page.evaluate((y) => window.scrollTo(0, y), i * stepPx)
        await page.waitForTimeout(stepMs)
    }

    const m = await page.evaluate(() => {
        const p = window.__tfPerf
        const frames = p.frameTimes
        const sum = frames.reduce((a, b) => a + b, 0)
        return {
            scenarioMs: performance.now() - p.scenarioStart,
            frameCount: frames.length,
            avgFrameMs: frames.length ? sum / frames.length : 0,
            maxFrameMs: frames.reduce((a, b) => Math.max(a, b), 0),
            slowFrames: frames.filter((f) => f > 16.7).length,
            verySlowFrames: frames.filter((f) => f > 33).length,
            veryverySlowFrames: frames.filter((f) => f > 50).length,
            p95FrameMs: frames.length
                ? [...frames].sort((a, b) => a - b)[Math.floor(frames.length * 0.95)]
                : 0,
            longTaskCount: p.longTasks.length,
            longTaskTotalMs: p.longTasks.reduce((a, b) => a + b, 0),
            setPropertyCalls: p.setPropertyCalls,
            cls: p.cls,
            scrollEvents: p.scrollEvents,
        }
    })

    await browser.close()
    return { name, pageHeight, ...m }
}

;(async () => {
    console.log('Scroll probe (~5s/browser)...')
    const chrome = await probe(chromium, 'Chromium')
    const wk = await probe(webkit, 'WebKit')

    const fmt = (n, d = 1) => (typeof n === 'number' ? n.toFixed(d) : String(n))
    const row = (label, a, b, unit = '') => {
        const aStr = fmt(a).padStart(10)
        const bStr = fmt(b).padStart(10)
        const ratio = typeof a === 'number' && a > 0 && typeof b === 'number'
            ? ` (${fmt(b / a, 2)}× Chrome)` : ''
        console.log(`  ${label.padEnd(28)} ${aStr}  ${bStr}${unit}${ratio}`)
    }

    console.log('\n=== LANDING PAGE — SCROLL (top→bottom over 4s) ===\n')
    console.log('  metric                       Chromium      WebKit')
    console.log('  ' + '─'.repeat(60))
    row('Page scrollable height',   chrome.pageHeight, wk.pageHeight, ' px')
    row('Scenario actual duration', chrome.scenarioMs, wk.scenarioMs, ' ms')
    row('Scroll events fired',      chrome.scrollEvents, wk.scrollEvents)
    console.log()
    row('Frames sampled',           chrome.frameCount, wk.frameCount)
    row('Avg frame',                chrome.avgFrameMs, wk.avgFrameMs, ' ms')
    row('p95 frame',                chrome.p95FrameMs, wk.p95FrameMs, ' ms')
    row('Max frame',                chrome.maxFrameMs, wk.maxFrameMs, ' ms')
    console.log()
    row('Frames > 16.7ms (60fps)',  chrome.slowFrames, wk.slowFrames)
    row('Frames > 33ms (30fps)',    chrome.verySlowFrames, wk.verySlowFrames)
    row('Frames > 50ms (20fps)',    chrome.veryverySlowFrames, wk.veryverySlowFrames)
    console.log()
    row('Long tasks (count)',       chrome.longTaskCount, wk.longTaskCount)
    row('Long tasks (total ms)',    chrome.longTaskTotalMs, wk.longTaskTotalMs, ' ms')
    row('setProperty calls',        chrome.setPropertyCalls, wk.setPropertyCalls)
    row('CLS (scroll-induced)',     chrome.cls, wk.cls, '', )
})().catch((e) => { console.error(e); process.exit(1) })
