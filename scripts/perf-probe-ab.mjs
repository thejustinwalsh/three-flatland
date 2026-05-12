#!/usr/bin/env node
// A/B scroll probe — runs the same scroll scenario in WebKit (the
// browser actually choking) under THREE conditions:
//   A. baseline — production code
//   B. motion-loop disabled — kill the per-frame setProperty work
//      (no scene-angle / effective-light-angle writes, no rim drift)
//   C. rim-light visuals disabled — keep the JS but strip .u-light /
//      conic-gradient styles so paint is cheap
//
// Compares avg frame, p95, slow-frame counts. Whichever condition
// recovers the most frames identifies the actual bottleneck.

import { webkit } from '@playwright/test'

const URL = 'http://localhost:4321/three-flatland/'
const SCROLL_MS = 4000
const SCROLL_STEPS = 80

async function probe(condition) {
    const browser = await webkit.launch({ headless: true })
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const page = await ctx.newPage()

    await page.addInitScript(`
        window.__tfAB = { frames: [], scenarioStart: 0 }
        let last = 0
        const r = window.requestAnimationFrame.bind(window)
        const tick = (t) => {
            if (last && window.__tfAB.scenarioStart) window.__tfAB.frames.push(t - last)
            last = t
            r(tick)
        }
        r(tick)
    `)

    // CONDITION B: stop motion.ts's setProperty writes by neutering
    // CSSStyleDeclaration.setProperty for the entire page.
    if (condition === 'no-motion-setprop') {
        await page.addInitScript(`
            const proto = CSSStyleDeclaration.prototype
            const orig = proto.setProperty
            proto.setProperty = function(name) {
                // Skip the motion-loop's per-frame writes; let other
                // setProperty calls (from CSS-in-JS, etc.) through.
                if (name === '--scene-angle' || name === '--effective-light-angle' ||
                    name === '--mx' || name === '--my' || name === '--mouse-active' ||
                    name === '--light-angle' || name === '--tilt-x' || name === '--tilt-y') {
                    return
                }
                return orig.apply(this, arguments)
            }
        `)
    }

    await page.goto(URL, { waitUntil: 'load' })

    // CONDITION C: kill rim-light visuals via injected CSS so paint
    // becomes ~free regardless of setProperty calls.
    if (condition === 'no-rim-paint') {
        await page.addStyleTag({ content: `
            .u-light::before, .u-light::after,
            .u-holo::before, .u-holo::after,
            [data-light]::before, [data-light]::after,
            .card-edge, .card-edge::before, .card-edge::after,
            .tile-edge, .tile-edge::before, .tile-edge::after {
                display: none !important;
                background: none !important;
            }
            .feature-card, .gallery-tile, .value-prop {
                background-image: none !important;
            }
        ` })
    }

    // CONDITION D: kill scroll-driven CSS animations (animation-timeline:
    // scroll(root) on the header + animation-timeline: view() on every
    // .u-reveal element). Replace with `animation: none`.
    if (condition === 'no-scroll-driven-anim') {
        await page.addStyleTag({ content: `
            *, *::before, *::after {
                animation-timeline: none !important;
                animation: none !important;
            }
        ` })
    }

    // CONDITION E: kill HeroShader canvas entirely (rip the WebGL paint
    // pipeline out of the equation).
    if (condition === 'no-hero-canvas') {
        await page.addStyleTag({ content: `
            .hero-canvas, .hero-canvas canvas { display: none !important; }
        ` })
    }

    // CONDITION F: content-visibility:auto on below-fold sections so
    // the browser skips off-screen layout/paint entirely.
    if (condition === 'content-visibility') {
        await page.addStyleTag({ content: `
            .feature-grid, .stats-banner, .value-prop, [data-slot="footer-text"] {
                content-visibility: auto;
                contain-intrinsic-size: auto 800px;
            }
        ` })
    }

    // CONDITION G: ALL OFF — combined nuclear option. If this is no
    // better than any single condition, the bottleneck is browser-
    // internal (scroll itself, not anything we paint or compute).
    if (condition === 'all-off') {
        await page.addStyleTag({ content: `
            .u-light::before, .u-light::after,
            .u-holo::before, .u-holo::after,
            [data-light]::before, [data-light]::after,
            .card-edge, .card-edge::before, .card-edge::after,
            .tile-edge, .tile-edge::before, .tile-edge::after,
            .hero-canvas, .hero-canvas canvas {
                display: none !important;
                background: none !important;
            }
            .feature-card, .gallery-tile, .value-prop {
                background-image: none !important;
            }
            *, *::before, *::after {
                animation-timeline: none !important;
                animation: none !important;
            }
        ` })
    }

    await page.waitForTimeout(500)

    await page.evaluate(() => {
        window.__tfAB.frames.length = 0
        window.__tfAB.scenarioStart = performance.now()
    })

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

    const m = await page.evaluate(() => {
        const f = window.__tfAB.frames
        const sum = f.reduce((a, b) => a + b, 0)
        const sorted = [...f].sort((a, b) => a - b)
        return {
            count: f.length,
            avg: f.length ? sum / f.length : 0,
            p95: sorted.length ? sorted[Math.floor(sorted.length * 0.95)] : 0,
            max: f.reduce((a, b) => Math.max(a, b), 0),
            slow16: f.filter((x) => x > 16.7).length,
            slow33: f.filter((x) => x > 33).length,
        }
    })
    await browser.close()
    return m
}

;(async () => {
    console.log('A/B probe — WebKit, 4s scroll, three conditions...\n')

    const condA = await probe('baseline')
    const condB = await probe('no-motion-setprop')
    const condC = await probe('no-rim-paint')
    const condD = await probe('no-scroll-driven-anim')
    const condE = await probe('no-hero-canvas')
    const condF = await probe('content-visibility')
    const condG = await probe('all-off')

    const fmt = (n, d = 1) => (typeof n === 'number' ? n.toFixed(d) : String(n))
    const cell = (v, w = 8) => fmt(v).padStart(w)

    console.log('  Condition                   frames    avg     p95     max  >16.7  >33ms')
    console.log('  ' + '─'.repeat(72))
    const print = (label, m) =>
        console.log(`  ${label.padEnd(28)}${cell(m.count, 6)}  ${cell(m.avg)}  ${cell(m.p95)}  ${cell(m.max)}  ${cell(m.slow16, 5)}  ${cell(m.slow33, 5)}`)
    print('A  baseline (production)', condA)
    print('B  no motion setProperty', condB)
    print('C  no rim-light paint', condC)
    print('D  no scroll-driven anim', condD)
    print('E  no hero canvas', condE)
    print('F  content-visibility:auto', condF)
    print('G  ALL OFF (nuclear)', condG)

    console.log('\n  Δ from baseline:')
    const delta = (m, label) => {
        const dAvg = m.avg - condA.avg
        const dP95 = m.p95 - condA.p95
        const dMax = m.max - condA.max
        const dSlow = m.slow16 - condA.slow16
        const sign = (n) => (n > 0 ? '+' : '')
        console.log(`    ${label.padEnd(28)} avg ${sign(dAvg)}${dAvg.toFixed(2)}ms  p95 ${sign(dP95)}${dP95.toFixed(0)}ms  max ${sign(dMax)}${dMax.toFixed(0)}ms  >16.7 ${sign(dSlow)}${dSlow}`)
    }
    delta(condB, 'B  no motion setProperty')
    delta(condC, 'C  no rim-light paint')
    delta(condD, 'D  no scroll-driven anim')
    delta(condE, 'E  no hero canvas')
    delta(condF, 'F  content-visibility:auto')
    delta(condG, 'G  ALL OFF (nuclear)')
})().catch((e) => { console.error(e); process.exit(1) })
