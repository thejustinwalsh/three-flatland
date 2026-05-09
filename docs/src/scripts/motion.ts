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
    /** Cursor target position, 0..1 in element-local coords. */
    cx: number
    cy: number
    /** Mouse light's currently rendered position, with inertia toward (cx,cy). */
    lx: number
    ly: number
    /** Hover-active scalar 0..1; smoothed toward 1 on enter, 0 on leave. */
    active: number
    /** Phase seeds — separate streams for scene-light vs holo position. */
    seed: number
    /** Whether the cursor is currently over this surface. */
    hovering: boolean
    /** Phase accumulator (seconds), advanced per frame. */
    t: number
    /**
     * Last-written values for each CSS custom property, so the per-frame
     * write loop can skip setProperty calls when nothing's actually
     * changed beyond the perceptual epsilon. The Safari fix —
     * `setProperty` on a Safari cascade with N readers triggers full
     * style invalidation per call (~2ms × 6 props × N targets = ~108ms
     * per frame at idle). Skipping no-op writes recovers ~60fps.
     * NaN sentinel forces the first write through.
     */
    lastMx: number
    lastMy: number
    lastActive: number
    lastLightAngle: number
    lastTiltX: number
    lastTiltY: number
    lastEffective: number
}

/**
 * Perceptual epsilons — values whose change is below these never need
 * to repaint a foil rim or shift a tilt visibly. Tuned conservative.
 */
const EPS_PCT = 0.05      // percentage points (e.g., --mx 30.00% vs 30.05% — invisible)
const EPS_DEG = 0.1       // degrees (light-angle / tilt / scene-angle)
const EPS_SCALAR = 0.005  // 0..1 scalars (--mouse-active)

/**
 * Last-written value for the global :root custom properties, mirroring
 * the per-target gating below.
 */
let lastSceneAngle = NaN

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
        active: 0,
        seed: Math.random() * 1000,
        hovering: false,
        t: 0,
        lastMx: NaN,
        lastMy: NaN,
        lastActive: NaN,
        lastLightAngle: NaN,
        lastTiltX: NaN,
        lastTiltY: NaN,
        lastEffective: NaN,
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
        t.hovering = false
    })

    // Reduced-motion: pin per-target cursor vars to a static pose. The
    // global --scene-* vars are pinned by `startLoop` (or the reduced-
    // motion early-return below) on :root.
    if (REDUCED_MOTION) {
        el.style.setProperty('--mx', '30%')
        el.style.setProperty('--my', '25%')
        el.style.setProperty('--light-angle', '135deg')
        el.style.setProperty('--mouse-active', '0')
        el.style.setProperty('--tilt-x', '0deg')
        el.style.setProperty('--tilt-y', '0deg')
    }
}

let lastFrame = 0
let running = false

/* GLOBAL DAY-CYCLE STATE — the scene light arcs across the page like a
 * sun moving across the sky, ping-ponging. Perlin noise modulates the
 * LERP RATE so the arc's speed varies subtly (the sun doesn't move at
 * a metronome's pace). One full ping-pong takes ~60s with rate jitter
 * of ±40%.
 *
 *   cyclePos ∈ [0, 1] is the normalized position along the arc.
 *   cycleDir ∈ {+1, -1} is the current direction (advancing or retreating).
 *
 * Angle range: 30° → 150°. Mapped through `gradient-angle = scene-angle
 * + 90°` and then through CSS's "first stop = bright" convention, this
 * keeps the bright side in the UPPER half of every surface throughout
 * the cycle (sunrise upper-right → noon top → sunset upper-left). Going
 * past 0° or 180° in scene-angle would dip the light below the horizon
 * (bright lower-half), which is unphysical for a sun-arc and reads as
 * "weird" — was the bug in the first pass.
 */
let cyclePos = Math.random() // start somewhere in the cycle so reloads aren't synchronized
let cycleDir: 1 | -1 = 1
const ARC_MIN_DEG = 30 // sunset-side: bright upper-right with slight horizon lean
const ARC_MAX_DEG = 150 // sunrise-side: bright upper-left with slight horizon lean
const CYCLE_BASE_RATE = 1 / 30 // 1 unit / 30s → full ping-pong in 60s nominal

function frame(now: number) {
    if (!running) return
    const dt = lastFrame ? Math.min(50, now - lastFrame) : 16
    lastFrame = now
    const time = now / 1000

    /* GLOBAL SCENE LIGHT — one source for the whole page that arcs back
     * and forth like a slow ping-pong day cycle. Position computed once
     * per frame and written to :root so every surface picks up the same
     * direction via cascade.
     *
     * Rate is perlin-modulated (≤±40% of base) so the arc isn't perfectly
     * uniform — atmospheric variation, not a metronome. */
    const dtSec = dt / 1000
    const rateJitter = noiseAt(time * 0.1, 0, 0) // -1..1, slow temporal noise
    const rateMul = 1 + rateJitter * 0.4
    cyclePos += cycleDir * dtSec * CYCLE_BASE_RATE * rateMul
    if (cyclePos > 1) {
        cyclePos = 2 - cyclePos
        cycleDir = -1
    } else if (cyclePos < 0) {
        cyclePos = -cyclePos
        cycleDir = 1
    }
    // Soften endpoints with a smoothstep so the light eases at horizons
    // rather than reversing abruptly.
    const eased = cyclePos * cyclePos * (3 - 2 * cyclePos)
    const sceneAngle = ARC_MIN_DEG + eased * (ARC_MAX_DEG - ARC_MIN_DEG)
    if (
        Number.isNaN(lastSceneAngle) ||
        Math.abs(sceneAngle - lastSceneAngle) >= EPS_DEG
    ) {
        document.documentElement.style.setProperty(
            '--scene-angle',
            `${sceneAngle.toFixed(1)}deg`,
        )
        lastSceneAngle = sceneAngle
    }

    for (const t of targets) {
        t.t = time

        /* MOUSE LIGHT — cursor-driven with inertia. When cursor is over
         * the surface, --mouse-active eases toward 1 and position eases
         * toward (cx, cy). On leave, --mouse-active eases back toward 0
         * BUT the position freezes at its last value so the highlight
         * fades in place rather than sliding back to center. */
        const targetActive = t.hovering ? 1 : 0
        // Slower easing on enter/leave (was 180ms half-life) so the
        // mouse-light effect ramps in/out gracefully rather than
        // snapping. Especially important for the shader's force-field
        // perturbation which wants a deliberate, slow build.
        t.active = inertia(t.active, targetActive, dt, 320)
        if (t.hovering) {
            t.lx = inertia(t.lx, t.cx, dt, 110)
            t.ly = inertia(t.ly, t.cy, dt, 110)
        }
        // else: lx/ly retain last hovered value; the fading --mouse-active
        // takes the highlight to zero opacity at that location.

        /**
         * Outer gate — when this target isn't being hovered AND the
         * fade-out scalar has fully settled to 0, skip the entire
         * per-target write block. The CSS rules driven by --mouse-active
         * fade to opacity 0 below 0.005, so visually nothing is on
         * screen; the perlin jitter on mx/my is purely "material feel"
         * for the visible hotspot and contributes nothing when no
         * hotspot is visible. Critical for Safari perf — without this,
         * the inner setProperty gates can't catch the per-frame noise
         * drift on idle targets.
         */
        if (!t.hovering && t.active < EPS_SCALAR) {
            // Make sure --mouse-active is locked at 0 once we stop
            // updating (the inertia tail can leave it at e.g. 0.003).
            if (Number.isNaN(t.lastActive) || t.lastActive >= EPS_SCALAR) {
                t.el.style.setProperty('--mouse-active', '0')
                t.lastActive = 0
            }
            continue
        }

        // Tiny perlin jitter on top of mouse position for material feel.
        // Scaled by active so idle targets contribute nothing even when
        // they slip through the gate above (e.g. mid-fade-out).
        const mAmpl = 0.04 * t.active
        const mx = Math.max(
            0,
            Math.min(1, t.lx + noiseAt(time, t.seed + 711, 0) * mAmpl),
        )
        const my = Math.max(
            0,
            Math.min(1, t.ly + noiseAt(time, t.seed + 911, 1) * mAmpl),
        )
        // Per-property value-changed gates — see MotionTarget.lastMx
        // doc-comment for the why. Each setProperty in Safari triggers
        // cascade-wide style invalidation; skipping no-op writes is the
        // single highest-impact perf fix.
        const mxPct = mx * 100
        if (
            Number.isNaN(t.lastMx) ||
            Math.abs(mxPct - t.lastMx) >= EPS_PCT
        ) {
            t.el.style.setProperty('--mx', `${mxPct.toFixed(2)}%`)
            t.lastMx = mxPct
        }
        const myPct = my * 100
        if (
            Number.isNaN(t.lastMy) ||
            Math.abs(myPct - t.lastMy) >= EPS_PCT
        ) {
            t.el.style.setProperty('--my', `${myPct.toFixed(2)}%`)
            t.lastMy = myPct
        }
        if (
            Number.isNaN(t.lastActive) ||
            Math.abs(t.active - t.lastActive) >= EPS_SCALAR
        ) {
            t.el.style.setProperty('--mouse-active', t.active.toFixed(3))
            t.lastActive = t.active
        }

        // Light angle from mouse position offset (used by gradient rotation).
        const dx = mx - 0.5
        const dy = my - 0.5
        const lightAngle = (Math.atan2(dy, dx) * 180) / Math.PI + 90
        if (
            Number.isNaN(t.lastLightAngle) ||
            Math.abs(lightAngle - t.lastLightAngle) >= EPS_DEG
        ) {
            t.el.style.setProperty('--light-angle', `${lightAngle.toFixed(1)}deg`)
            t.lastLightAngle = lightAngle
        }

        /* TILT — cursor-driven, card leans TOWARD the cursor (the side the
         * cursor is on rises toward the viewer, mimicking Pokemon-foil-card
         * physics). Scaled by --mouse-active so idle surfaces sit flat.
         *
         * Sign convention:
         *   cursor right (mx > 0.5)  → right edge forward → rotateY negative
         *   cursor down  (my > 0.5)  → bottom edge forward → rotateX positive
         * Amplitudes inspired by simeydotme/pokemon-cards-css (~14°). */
        const isHolo = t.el.matches('.u-holo, [data-holo]')
        const ampX = isHolo ? 14 : 9
        const ampY = isHolo ? 14 : 8
        const tiltY = (0.5 - mx) * ampY * t.active
        const tiltX = (my - 0.5) * ampX * t.active
        if (
            Number.isNaN(t.lastTiltX) ||
            Math.abs(tiltX - t.lastTiltX) >= EPS_DEG
        ) {
            t.el.style.setProperty('--tilt-x', `${tiltX.toFixed(2)}deg`)
            t.lastTiltX = tiltX
        }
        if (
            Number.isNaN(t.lastTiltY) ||
            Math.abs(tiltY - t.lastTiltY) >= EPS_DEG
        ) {
            t.el.style.setProperty('--tilt-y', `${tiltY.toFixed(2)}deg`)
            t.lastTiltY = tiltY
        }

        /* TILT-COUPLED LIGHT DIRECTION — when the surface tilts, the
         * apparent direction of the global scene light shifts in the
         * surface's local frame. With the new tilt sign convention
         * (cursor toward → that edge rises), positive tilt-y now means
         * the LEFT edge has risen, so the apparent scene angle shifts
         * RIGHT relative to the surface. Multiplier 2.5× keeps the
         * response visually clear at modest tilts. */
        const tiltMul = 2.5
        const effective = sceneAngle + tiltY * tiltMul - tiltX * tiltMul * 0.4
        if (
            Number.isNaN(t.lastEffective) ||
            Math.abs(effective - t.lastEffective) >= EPS_DEG
        ) {
            t.el.style.setProperty(
                '--effective-light-angle',
                `${effective.toFixed(1)}deg`,
            )
            t.lastEffective = effective
        }
    }

    requestAnimationFrame(frame)
}

function startLoop() {
    if (REDUCED_MOTION) {
        // Pin a static global scene light pose so surfaces still read as lit.
        const root = document.documentElement.style
        root.setProperty('--scene-angle', '135deg')
        return
    }
    if (running) return
    running = true
    requestAnimationFrame(frame)
}

function initMotion() {
    if (typeof document === 'undefined') return
    const els = document.querySelectorAll<HTMLElement>(
        '.u-light, .u-holo, [data-light], [data-holo], .sl-link-button.primary, .sl-link-button.secondary'
    )
    for (const el of els) registerTarget(el)
    if (targets.length > 0) startLoop()
    initReveal()
    initSidebarDetailsPersistence()

    /* Console personality — a one-time message for developers who pop
     * open devtools. Subtle nod to who reads this thing. */
    if (typeof window !== 'undefined' && !(window as any).__tfFlatlandHi) {
        (window as any).__tfFlatlandHi = true
        const css1 = 'color:#a85ff1;font-family:Silkscreen,monospace;font-size:14px;font-weight:bold;'
        const css2 = 'color:#11b7d4;font-family:monospace;'
        try {
            console.log('%c flatland %c — sprite-first 2D for Three.js + R3F. Like what you see? https://github.com/thejustinwalsh/three-flatland', css1, css2)
        } catch {}
    }
}

/**
 * Sidebar collapsable group <details> state — persisted across page
 * navigations via localStorage. Astro view-transitions preserve the
 * sidebar DOM, but Starlight server-side renders each page with
 * `<details open={!entry.collapsed}>`, which clobbers user-toggled
 * state when the new page's sidebar markup arrives. localStorage gives
 * us a per-group source of truth that survives both navigation and
 * full reload.
 *
 * Pre-empt the flash: mutate the NEW document's <details> open
 * attributes BEFORE Astro commits the swap (astro:before-swap fires
 * after the new doc is parsed but before it's swapped into place).
 * This way the new DOM paints with the user's preferred state, never
 * with the SSR-rendered default.
 */
function applyStoredDetailsState(root: Document | HTMLElement = document) {
    if (typeof window === 'undefined' || !('localStorage' in window)) return
    const detailsEls = root.querySelectorAll<HTMLDetailsElement>(
        'details.container-sidebar-entry.collapsable',
    )
    for (const d of detailsEls) {
        const label = d.querySelector('.entry-title')?.textContent?.trim()
        if (!label) continue
        const key = `tf:sidebar-open:${label}`
        const stored = localStorage.getItem(key)
        if (stored !== null) d.open = stored === 'true'
    }
}

function initSidebarDetailsPersistence() {
    if (typeof window === 'undefined' || !('localStorage' in window)) return
    applyStoredDetailsState(document)
    const detailsEls = document.querySelectorAll<HTMLDetailsElement>(
        'details.container-sidebar-entry.collapsable',
    )
    for (const d of detailsEls) {
        const label = d.querySelector('.entry-title')?.textContent?.trim()
        if (!label) continue
        const key = `tf:sidebar-open:${label}`
        // Persist on user toggle. `toggle` fires after the open state
        // flips, so reading d.open here gives us the new value.
        d.addEventListener('toggle', () => {
            localStorage.setItem(key, String(d.open))
        })
    }
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
    // Pre-empt the sidebar <details> state flash: apply stored state
    // to the about-to-be-swapped document BEFORE Astro commits the
    // swap, so the new DOM paints in the user's preferred state.
    document.addEventListener('astro:before-swap', (e) => {
        const ev = e as Event & { newDocument?: Document }
        if (ev.newDocument) applyStoredDetailsState(ev.newDocument)
    })
}
