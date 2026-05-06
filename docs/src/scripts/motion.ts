/**
 * Motion-as-craft runtime — three primitives shipped as opt-in classes /
 * data-attribute hooks per the Design Context (CLAUDE.md):
 *
 *   .u-reveal / [data-reveal]    fade-rise on scroll-into-view
 *   .u-light  / [data-light]     pointer-driven gem-tinted radial highlight
 *   .u-holo   / [data-holo]      living-breathing 3D foil sheen with
 *                                perlin-driven ambient light + cursor steer
 *
 * The reveal primitive prefers CSS scroll-driven animations (`animation-
 * timeline: view()`); if the browser doesn't support that, an
 * IntersectionObserver toggles `data-revealed` to drive the same animation.
 *
 * The light + holo primitives share one pointer-coupled animation loop:
 *   - Per-element noise position drifts continuously via 2D value-noise.
 *   - When the cursor enters, pointer position smoothly relocates the noise
 *     CENTER (~100ms inertia ease); the noise keeps wandering around the
 *     new center.
 *   - On pointerleave the cursor target releases; noise returns to centered
 *     wander. The light is *always* alive — the surface breathes because
 *     the light breathes.
 *
 * Reduced motion: scroll-reveals collapse to instant, light/holo loops halt
 * after pinning to a static "spotlight from upper-left" pose so surfaces
 * still read as lit, just frozen.
 */

interface MotionTarget {
    el: HTMLElement
    /** Last commanded center (target the noise wanders around), 0..1 in element-local coords. */
    cx: number
    cy: number
    /** Currently rendered light position with inertia toward target. */
    lx: number
    ly: number
    /** Time offset so each surface's noise has an independent phase. */
    seed: number
    /** Whether the cursor is currently over this surface. */
    hovering: boolean
    /** Phase accumulator, advanced per frame. */
    t: number
}

const REDUCED_MOTION = (() => {
    if (typeof window === 'undefined') return false
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    return mq.matches
})()

/**
 * 2D value noise — smoothstep-interpolated grid of pseudo-random values.
 * Good enough for slow ambient drift; cheaper than full Perlin/simplex.
 * Output range ~[-1, 1]. Two octaves, low frequency.
 */
function hash2(x: number, y: number): number {
    let h = (x | 0) * 374761393 + (y | 0) * 668265263
    h = (h ^ (h >>> 13)) * 1274126177
    return ((h ^ (h >>> 16)) & 0xffff) / 0x8000 - 1
}
function fade(t: number): number {
    return t * t * (3 - 2 * t)
}
function valueNoise2(x: number, y: number): number {
    const xi = Math.floor(x)
    const yi = Math.floor(y)
    const xf = x - xi
    const yf = y - yi
    const a = hash2(xi, yi)
    const b = hash2(xi + 1, yi)
    const c = hash2(xi, yi + 1)
    const d = hash2(xi + 1, yi + 1)
    const u = fade(xf)
    const v = fade(yf)
    return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v
}
function noiseAt(t: number, seed: number, axis: 0 | 1): number {
    // Two octaves for organic-ish wander; freq tuned so a full cycle takes ~12-18s.
    const o1 = valueNoise2(t * 0.07 + seed, axis * 17.3 + seed * 0.31)
    const o2 = valueNoise2(t * 0.18 + seed * 1.7, axis * 31.1 + seed * 0.71) * 0.5
    return (o1 + o2) / 1.5
}

/** Inertia ease — frame-rate-independent smoothing toward target. */
function inertia(current: number, target: number, dt: number, halflife: number): number {
    const k = 1 - Math.pow(0.5, dt / halflife)
    return current + (target - current) * k
}

const targets: MotionTarget[] = []

function registerTarget(el: HTMLElement) {
    const t: MotionTarget = {
        el,
        cx: 0.5,
        cy: 0.5,
        lx: 0.5,
        ly: 0.5,
        seed: Math.random() * 1000,
        hovering: false,
        t: 0,
    }
    targets.push(t)

    const setTarget = (e: PointerEvent) => {
        const r = el.getBoundingClientRect()
        t.cx = (e.clientX - r.left) / r.width
        t.cy = (e.clientY - r.top) / r.height
        t.hovering = true
    }
    el.addEventListener('pointerenter', setTarget)
    el.addEventListener('pointermove', setTarget)
    el.addEventListener('pointerleave', () => {
        t.cx = 0.5
        t.cy = 0.5
        t.hovering = false
    })

    // Reduced-motion: pin once and skip the loop entirely for this element.
    if (REDUCED_MOTION) {
        // Static "spotlight from upper-left" — surfaces still read as lit.
        el.style.setProperty('--mx', '30%')
        el.style.setProperty('--my', '25%')
        el.style.setProperty('--tilt-x', '0deg')
        el.style.setProperty('--tilt-y', '0deg')
    }
}

let lastFrame = 0
let running = false

function frame(now: number) {
    if (!running) return
    const dt = lastFrame ? Math.min(50, now - lastFrame) : 16
    lastFrame = now
    const time = now / 1000

    for (const t of targets) {
        t.t = time
        // Cursor steers the noise center with ~100ms inertia.
        const targetCx = t.cx
        const targetCy = t.cy
        // Smoothed center — approximates by easing the rendered position
        // toward the target each frame; the noise wanders around it.
        t.lx = inertia(t.lx, targetCx, dt, 100)
        t.ly = inertia(t.ly, targetCy, dt, 100)

        // Noise wander, scaled to ~6% of element dimensions.
        const ampl = 0.06
        const nx = noiseAt(time, t.seed, 0) * ampl
        const ny = noiseAt(time, t.seed, 1) * ampl

        const mx = Math.max(0, Math.min(1, t.lx + nx))
        const my = Math.max(0, Math.min(1, t.ly + ny))

        t.el.style.setProperty('--mx', `${(mx * 100).toFixed(2)}%`)
        t.el.style.setProperty('--my', `${(my * 100).toFixed(2)}%`)

        // Tilt amplitude depends on the surface type: u-light surfaces (cards,
        // most interactive) get a *very* subtle tilt (~1.5° max), u-holo
        // surfaces (premium opt-in) get more material weight (~6° max).
        const isHolo = t.el.matches('.u-holo, [data-holo]')
        const ampX = isHolo ? 8 : 1.5
        const ampY = isHolo ? 12 : 2
        const tiltY = (mx - 0.5) * ampY
        const tiltX = (0.5 - my) * ampX
        t.el.style.setProperty('--tilt-x', `${tiltX.toFixed(2)}deg`)
        t.el.style.setProperty('--tilt-y', `${tiltY.toFixed(2)}deg`)
        // Cursor-direction angle in degrees, used by the conic facet
        // gradients to rotate the facet planes with the light. 0° at the
        // top, sweeping clockwise — same convention as conic-gradient.
        const dx = mx - 0.5
        const dy = my - 0.5
        const angle = (Math.atan2(dy, dx) * 180) / Math.PI + 90
        t.el.style.setProperty('--light-angle', `${angle.toFixed(1)}deg`)
    }

    requestAnimationFrame(frame)
}

function startLoop() {
    if (running || REDUCED_MOTION) return
    running = true
    requestAnimationFrame(frame)
}

function initMotion() {
    if (typeof document === 'undefined') return
    const els = document.querySelectorAll<HTMLElement>(
        '.u-light, .u-holo, [data-light], [data-holo]'
    )
    for (const el of els) registerTarget(el)
    if (targets.length > 0) startLoop()
    initReveal()
}

/**
 * Reveal-on-scroll fallback. CSS handles the animation; we only flip
 * `data-revealed` for browsers without `animation-timeline: view()`.
 */
function initReveal() {
    if (typeof window === 'undefined') return
    if ('IntersectionObserver' in window === false) return
    // If scroll-driven animations are supported, the CSS handles it; skip JS.
    if (CSS.supports('animation-timeline: view()')) return

    const els = document.querySelectorAll<HTMLElement>('.u-reveal, [data-reveal]')
    if (els.length === 0) return

    if (REDUCED_MOTION) {
        for (const el of els) el.dataset.revealed = ''
        return
    }

    const io = new IntersectionObserver(
        entries => {
            for (const entry of entries) {
                if (entry.isIntersecting) {
                    ;(entry.target as HTMLElement).dataset.revealed = ''
                    io.unobserve(entry.target)
                }
            }
        },
        { rootMargin: '0px 0px -10% 0px', threshold: 0.05 }
    )
    for (const el of els) io.observe(el)
}

// Astro view-transitions: re-init on every page navigation. Listen for
// astro:page-load (fired after the new page is swapped in) so navigation
// between docs pages doesn't leave new motion targets unregistered.
if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initMotion, { once: true })
    } else {
        initMotion()
    }
    document.addEventListener('astro:page-load', () => {
        // Drop stale targets and re-scan; old DOM nodes were swapped out.
        targets.length = 0
        initMotion()
    })
}
