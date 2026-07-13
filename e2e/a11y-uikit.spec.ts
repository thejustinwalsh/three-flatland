/**
 * End-to-end proof that `@three-flatland/uikit`'s native accessibility system works in a REAL
 * browser: the hidden a11y DOM tree (spec §1.2), Mode 2 projection (positioning the hidden
 * elements over their on-screen panels every frame), and the Mode 3 diegetic visibility policy
 * (world-space panels that leave the camera frustum or sit behind the camera). 290 happy-dom unit
 * tests already cover the library in isolation; nothing before this file drove it inside a real
 * rendering pipeline.
 *
 * Probes two example apps that render the SAME "CRYPT RAIDER" scene:
 *  - `examples/react/uikit` — React Three Fiber; a11y projection is auto-wired by
 *    `packages/uikit/src/react/build.tsx`'s `useSetup` effect (no app code calls
 *    `setupA11yProjection` directly).
 *  - `examples/three/uikit` — plain Three.js; the app calls `setupA11yProjection` EXPLICITLY for
 *    each uikit root, passing Flatland's own camera. This is the control case.
 *
 * Both scenes have: a screen-space HUD (Tabs, a "Player Name" text input, Easy/Normal/Hardcore
 * difficulty radios, Play/Quit buttons), a world-space Wall Panel (Torches Lit switch, Show
 * Collision checkbox, a Reset button) sitting off to one side, and a small Behind-You panel
 * (Ambush Alert checkbox, Turn Around button) placed behind the camera's starting position. Both
 * expose `window.__uikitA11yScene = { setCameraAngle(rad), getCamera() }` so a script can orbit
 * Flatland's OWN render camera directly instead of simulating OrbitControls pointer drags.
 *
 * ── Renderer note ───────────────────────────────────────────────────────────────────────────
 * Headless Chromium in this environment reports "No available adapters" for WebGPU.
 * `WebGPURenderer` catches that and falls back to its WebGL2 backend automatically (confirmed via
 * the console warning "THREE.WebGPURenderer: WebGPU is not available, running under WebGL2
 * backend." — see the accompanying report). The scene renders correctly headless; no `--gpu`
 * launch args were needed for this suite.
 *
 * ── Build prerequisite ──────────────────────────────────────────────────────────────────────
 * `playwright.config.ts` serves the BUILT docs preview. `pnpm --filter=docs build` alone is NOT
 * enough — it skips the example bundles that `docs#build`'s turbo `dependsOn` graph pulls in
 * (`example-three-uikit#build`, `example-react-uikit#build`, …), leaving
 * `docs/dist/examples/{three,react}/uikit/` missing. Build via turbo instead:
 *   `pnpm build` (full monorepo) or `npx turbo run docs#build` (docs + its deps only).
 *
 * Run: `pnpm exec playwright test e2e/a11y-uikit.spec.ts`
 */

import { test, expect, type Page } from '@playwright/test'

const REACT_URL = 'examples/react/uikit/'
const THREE_URL = 'examples/three/uikit/'

declare global {
  interface Window {
    __uikitA11yScene?: {
      setCameraAngle: (rad: number) => void
      getCamera: () => unknown
    }
  }
}

// ── Page helpers ───────────────────────────────────────────────────────────────────────────

interface A11yElementSnapshot {
  tag: string
  role: string | null
  ariaLabel: string | null
  ariaChecked: string | null
  ariaHidden: string | null
  ariaDebug: string | null
  tabIndex: number
  visibility: string
  transform: string
  width: string
  height: string
  rect: { x: number; y: number; w: number; h: number }
}

/** Reads one hidden a11y element (matched by its `aria-label`) straight from the DOM. */
async function describeByLabel(page: Page, label: string): Promise<A11yElementSnapshot | null> {
  return page.evaluate((l) => {
    const el = document.querySelector<HTMLElement>(`[aria-label="${l}"]`)
    if (el == null) return null
    const rect = el.getBoundingClientRect()
    return {
      tag: el.tagName,
      role: el.getAttribute('role'),
      ariaLabel: el.getAttribute('aria-label'),
      ariaChecked: el.getAttribute('aria-checked'),
      ariaHidden: el.getAttribute('aria-hidden'),
      ariaDebug: el.getAttribute('data-a11y-debug'),
      tabIndex: el.tabIndex,
      visibility: el.style.visibility,
      transform: el.style.transform,
      width: el.style.width,
      height: el.style.height,
      rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
    }
  }, label)
}

/** Waits until the per-root `[data-uikit-a11y]` container(s) have mounted at least `min` labelled members. */
async function waitForA11yMembers(page: Page, min: number, timeout = 15_000): Promise<void> {
  await expect
    .poll(
      () => page.evaluate(() => document.querySelectorAll('[data-uikit-a11y] [aria-label]').length),
      { timeout }
    )
    .toBeGreaterThanOrEqual(min)
}

/** Number of per-root `[data-uikit-a11y]` containers currently mounted on the page. */
async function a11yContainerCount(page: Page): Promise<number> {
  return page.evaluate(() => document.querySelectorAll('[data-uikit-a11y]').length)
}

/** Clicks the Tweakpane "a11y debug" checkbox in the inspector (both examples wire the same toggle). */
async function toggleA11yDebug(page: Page): Promise<void> {
  // Tweakpane's checkbox `<input>` sits under a decorative `<svg>` that intercepts pointer events;
  // the `.tp-ckbv_w` wrapper is the actually-clickable target.
  await page.locator('.tp-lblv', { hasText: 'a11y debug' }).locator('.tp-ckbv_w').click()
}

/** Drives Flatland's own render camera (NOT R3F's default camera — see the Tier 3 findings below). */
async function setCameraAngle(page: Page, radians: number): Promise<void> {
  await page.evaluate((r) => {
    window.__uikitA11yScene?.setCameraAngle(r)
  }, radians)
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
// Tier 1 — the a11y TREE (React example). No projection/positioning assertions here: the hidden
// elements are created reactively off `component.properties.value.role` at construction time, so
// this tier only needs the scene to MOUNT, not to render a correct frame.
// ═════════════════════════════════════════════════════════════════════════════════════════════

test.describe('Tier 1 — a11y tree (examples/react/uikit)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(REACT_URL, { waitUntil: 'networkidle' })
    await waitForA11yMembers(page, 10)
  })

  test('interactive roles get the right native element + semantics', async ({ page }) => {
    // button → plain <button>, no explicit role attribute (native semantics already say "button").
    for (const label of ['Play', 'Quit', 'Reset Wall Panel']) {
      const el = await describeByLabel(page, label)
      expect(el, `${label} should have a hidden a11y element`).not.toBeNull()
      expect(el!.tag, `${label} tag`).toBe('BUTTON')
      expect(el!.role, `${label} role attribute (native <button> needs none)`).toBeNull()
      expect(el!.ariaLabel).toBe(label)
    }

    // checkbox / switch → <button role="checkbox|switch" aria-checked="...">.
    const torchesLit = await describeByLabel(page, 'Torches Lit')
    expect(torchesLit!.tag).toBe('BUTTON')
    expect(torchesLit!.role).toBe('switch')
    expect(torchesLit!.ariaChecked, 'Torches Lit defaultChecked=true').toBe('true')

    const showCollision = await describeByLabel(page, 'Show Collision')
    expect(showCollision!.tag).toBe('BUTTON')
    expect(showCollision!.role).toBe('checkbox')
    expect(showCollision!.ariaChecked, 'Show Collision defaultChecked=false').toBe('false')

    // radio → <button role="radio">.
    for (const label of ['Easy', 'Normal', 'Hardcore']) {
      const el = await describeByLabel(page, label)
      expect(el!.tag).toBe('BUTTON')
      expect(el!.role).toBe('radio')
    }

    // tab → <button role="tab">.
    for (const label of ['Play tab', 'Loadout tab', 'Settings tab']) {
      const el = await describeByLabel(page, label)
      expect(el!.tag).toBe('BUTTON')
      expect(el!.role).toBe('tab')
    }

    // text input → real <input>, no role needed.
    const nameInput = await describeByLabel(page, 'Player Name')
    expect(nameInput!.tag).toBe('INPUT')
    expect(nameInput!.role).toBeNull()
  })

  test('every representative control carries its aria-label', async ({ page }) => {
    const labels = [
      'Play',
      'Quit',
      'Player Name',
      'Easy',
      'Normal',
      'Hardcore',
      'Torches Lit',
      'Show Collision',
      'Reset Wall Panel',
      'Ambush Alert',
      'Turn Around',
    ]
    for (const label of labels) {
      const el = await describeByLabel(page, label)
      expect(el, `${label} should exist`).not.toBeNull()
      expect(el!.ariaLabel).toBe(label)
    }
  })

  test('on-screen HUD controls are sequentially focusable (tabIndex 0)', async ({ page }) => {
    // The HUD is screen-space (rides Flatland's camera via HudFullscreen) and is always framed —
    // it never leaves the visible viewport, so these are deterministically tabbable.
    for (const label of ['Play', 'Quit', 'Player Name', 'Easy', 'Normal', 'Hardcore', 'Play tab']) {
      const el = await describeByLabel(page, label)
      expect(el!.tabIndex, `${label} tabIndex`).toBe(0)
    }
  })

  test('world-space controls outside the default camera framing stay in the tree but are excluded from sequential focus', async ({
    page,
  }) => {
    // Neither example ships a `disabled` control, so the cleanest real "not focusable" contrast
    // this app offers is the Mode-3 visibility policy itself: the Wall Panel sits off to one side
    // and the Behind-You panel starts behind the camera, so at the default framing their controls
    // are present (queryable, correctly labelled — asserted above) but NOT reachable by Tab.
    // This exercises one settled projection frame (unavoidable — the policy is frame-driven) but
    // makes no positioning/rect claims, which is what distinguishes it from Tier 2/3 below.
    for (const label of ['Reset Wall Panel', 'Torches Lit', 'Show Collision']) {
      const el = await describeByLabel(page, label)
      expect(el, `${label} should still be queryable`).not.toBeNull()
      expect(el!.tabIndex, `${label} tabIndex (offscreen focus-skip)`).toBe(-1)
    }
    for (const label of ['Turn Around', 'Ambush Alert']) {
      const el = await describeByLabel(page, label)
      expect(el, `${label} should still be queryable`).not.toBeNull()
      expect(el!.ariaHidden, `${label} aria-hidden (behind-camera)`).toBe('true')
    }
  })

  test('the Chromium accessibility tree exposes role + name for a projected control (CDP cross-check)', async ({
    page,
  }) => {
    // Chromium's CDP AX tree snapshot is not exhaustive in this headless configuration (it did not
    // surface every on-screen control in manual probing), so this is a light cross-check on top of
    // the DOM assertions above, not a replacement for them.
    const session = await page.context().newCDPSession(page)
    const { nodes } = await session.send('Accessibility.getFullAXTree')
    const resetNode = nodes.find((n) => n.name?.value === 'Reset Wall Panel')
    expect(resetNode, 'Reset Wall Panel should appear in the platform AX tree').toBeTruthy()
    expect(resetNode!.role?.value).toBe('button')
    expect(resetNode!.ignored).toBe(false)

    const switchNode = nodes.find((n) => n.name?.value === 'Torches Lit')
    expect(switchNode, 'Torches Lit should appear in the platform AX tree').toBeTruthy()
    expect(switchNode!.role?.value).toBe('switch')
    await session.detach()
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════════
// Tier 2 — Mode 2 projection positioning. Requires the canvas to actually render a frame (the
// projection reads the canvas's on-page rect + the panel's world matrix each frame).
// ═════════════════════════════════════════════════════════════════════════════════════════════

test.describe('Tier 2 — projection positioning', () => {
  test('React: the projection pump runs — container overlays the canvas, HUD elements get a real transform', async ({
    page,
  }) => {
    await page.goto(REACT_URL, { waitUntil: 'networkidle' })
    await waitForA11yMembers(page, 10)

    // THE canary for the previously-suspected "React auto-wired projection never pumps" bug
    // (packages/uikit/src/react/build.tsx's projection useEffect). If true, every
    // `[data-uikit-a11y]` container would stay parked at the off-screen fallback
    // (`position:absolute; left:-1000vw`) forever. It does NOT: it flips to `position:fixed`, and
    // the container this is testing owns 10+ registered members.
    await expect
      .poll(async () => {
        const positions = await page.evaluate(() =>
          Array.from(document.querySelectorAll('[data-uikit-a11y]')).map(
            (el) => (el as HTMLElement).style.position
          )
        )
        return positions
      })
      .toEqual(expect.arrayContaining(['fixed']))

    // A concrete, on-screen, real-content element: nonzero rect, real CSS transform/width/height.
    const play = await describeByLabel(page, 'Play')
    expect(play!.transform).toMatch(/^translate\(/)
    expect(Number.parseFloat(play!.width)).toBeGreaterThan(0)
    expect(Number.parseFloat(play!.height)).toBeGreaterThan(0)
    expect(play!.rect.w).toBeGreaterThan(0)
    expect(play!.rect.h).toBeGreaterThan(0)

    // The rect sits inside the canvas's on-page bounds — proof it is positioned OVER the panel,
    // not left at some degenerate/default coordinate.
    const canvasRect = await page.evaluate(() => {
      const c = document.querySelector('canvas')!
      const r = c.getBoundingClientRect()
      return { x: r.x, y: r.y, w: r.width, h: r.height }
    })
    expect(play!.rect.x).toBeGreaterThanOrEqual(canvasRect.x)
    expect(play!.rect.x + play!.rect.w).toBeLessThanOrEqual(canvasRect.x + canvasRect.w + 1)
    expect(play!.rect.y).toBeGreaterThanOrEqual(canvasRect.y)
    expect(play!.rect.y + play!.rect.h).toBeLessThanOrEqual(canvasRect.y + canvasRect.h + 1)
  })

  test('React: exactly one [data-uikit-a11y] container per uikit root, no StrictMode leak', async ({
    page,
  }) => {
    await page.goto(REACT_URL, { waitUntil: 'networkidle' })
    await waitForA11yMembers(page, 10)
    // This scene mounts exactly THREE uikit roots: the screen-space HUD (HudFullscreen), the
    // world-space Wall Panel, and the world-space Behind-You panel — so 3 containers is correct,
    // not a duplicate-mount leak. The count must also be STABLE (not still growing).
    const first = await a11yContainerCount(page)
    expect(first).toBe(3)
    await page.waitForTimeout(1000)
    const second = await a11yContainerCount(page)
    expect(
      second,
      'container count must not grow after settling (StrictMode double-mount leak)'
    ).toBe(first)
  })

  test('React: toggling the "a11y debug" inspector control reveals the projected elements', async ({
    page,
  }) => {
    await page.goto(REACT_URL, { waitUntil: 'networkidle' })
    await waitForA11yMembers(page, 10)

    const before = await describeByLabel(page, 'Play')
    expect(before!.ariaDebug).toBeNull()

    await toggleA11yDebug(page)

    await expect
      .poll(async () => (await describeByLabel(page, 'Play'))!.ariaDebug)
      .toBe('button · Play')
  })

  test('Three.js (control case): projection positions the Wall Panel + HUD correctly under explicit wiring', async ({
    page,
  }) => {
    await page.goto(THREE_URL, { waitUntil: 'networkidle' })
    await waitForA11yMembers(page, 10)

    await expect
      .poll(async () => {
        const positions = await page.evaluate(() =>
          Array.from(document.querySelectorAll('[data-uikit-a11y]')).map(
            (el) => (el as HTMLElement).style.position
          )
        )
        return positions
      })
      .toEqual(expect.arrayContaining(['fixed']))

    const play = await describeByLabel(page, 'Play')
    expect(play!.rect.w).toBeGreaterThan(0)
    expect(play!.rect.h).toBeGreaterThan(0)

    // The Wall Panel is genuinely projected too (real width/height even though, at the default
    // camera framing, it sits past the right edge of the viewport — see Tier 3 for the policy
    // that governs its tabIndex/aria-hidden state under camera motion).
    const reset = await describeByLabel(page, 'Reset Wall Panel')
    expect(Number.parseFloat(reset!.width)).toBeGreaterThan(0)
    expect(Number.parseFloat(reset!.height)).toBeGreaterThan(0)
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════════
// Tier 3 — diegetic visibility under camera motion (world-space). Primary coverage runs against
// examples/three/uikit, which wires `setupA11yProjection` with the SAME camera
// `window.__uikitA11yScene.setCameraAngle` drives. This is deliberate, not a shortcut: live
// probing (see the report) found that examples/react/uikit's auto-wired projection
// (packages/uikit/src/react/build.tsx) projects world-space roots against R3F's OWN default
// camera, not Flatland's internal render camera that `setCameraAngle` moves — so camera motion
// currently has NO effect on the React example's world-space a11y state. That is a real,
// pre-existing library/example integration gap, not a test bug; per instructions the library
// source is not touched to paper over it. The `test.fail()` block below documents it as a live,
// falsifiable regression canary instead of silently skipping it.
// ═════════════════════════════════════════════════════════════════════════════════════════════

test.describe('Tier 3 — camera motion (examples/three/uikit, explicit-wiring control case)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(THREE_URL, { waitUntil: 'networkidle' })
    await waitForA11yMembers(page, 10)
  })

  test('default framing: Wall Panel is offscreen (tabIndex -1, NOT aria-hidden); Behind-You panel is behind the camera (aria-hidden)', async ({
    page,
  }) => {
    const reset = await describeByLabel(page, 'Reset Wall Panel')
    expect(reset!.ariaHidden, 'offscreen panels stay in the a11y tree').toBeNull()
    expect(reset!.tabIndex, 'offscreen panels are skipped by sequential focus').toBe(-1)

    const turnAround = await describeByLabel(page, 'Turn Around')
    expect(turnAround!.ariaHidden, 'behind-camera panels are pulled from the a11y tree').toBe(
      'true'
    )
    expect(turnAround!.visibility).toBe('hidden')
  })

  test('rotating the camera 180° swaps which panel is perceivable, and rotating back restores the original state', async ({
    page,
  }) => {
    // Rotate Flatland's camera halfway around its orbit target — this walks the Behind-You panel
    // into view and pushes the Wall Panel off the opposite edge.
    await setCameraAngle(page, Math.PI)

    await expect
      .poll(async () => (await describeByLabel(page, 'Turn Around'))!.ariaHidden)
      .toBe(null)
    const turnAroundVisible = await describeByLabel(page, 'Turn Around')
    expect(turnAroundVisible!.visibility).toBe('visible')
    expect(turnAroundVisible!.tabIndex).toBe(0)
    expect(turnAroundVisible!.rect.w).toBeGreaterThan(0)
    expect(turnAroundVisible!.rect.h).toBeGreaterThan(0)

    const resetMidway = await describeByLabel(page, 'Reset Wall Panel')
    expect(resetMidway!.tabIndex, 'Wall Panel is still offscreen, just on the other side').toBe(-1)
    expect(resetMidway!.ariaHidden).toBeNull()

    // Rotate back to the start — the policy must be reversible, not a one-way ratchet.
    await setCameraAngle(page, 0)

    await expect
      .poll(async () => (await describeByLabel(page, 'Turn Around'))!.ariaHidden)
      .toBe('true')
    const resetBack = await describeByLabel(page, 'Reset Wall Panel')
    expect(resetBack!.tabIndex).toBe(-1)
    expect(resetBack!.ariaHidden).toBeNull()
  })

  test('real browser Tab order skips offscreen/behind-camera controls, and picks them up once perceivable', async ({
    page,
  }) => {
    const tabTo = async (count: number): Promise<Set<string>> => {
      const seen = new Set<string>()
      for (let i = 0; i < count; i++) {
        await page.keyboard.press('Tab')
        const label = await page.evaluate(
          () =>
            document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.tagName
        )
        if (label != null) seen.add(label)
      }
      return seen
    }

    const atDefault = await tabTo(15)
    expect(atDefault.has('Player Name'), 'on-screen HUD control reachable').toBe(true)
    expect(atDefault.has('Play'), 'on-screen HUD control reachable').toBe(true)
    expect(atDefault.has('Reset Wall Panel'), 'offscreen Wall Panel control must be skipped').toBe(
      false
    )
    expect(atDefault.has('Turn Around'), 'behind-camera control must be skipped').toBe(false)
    expect(atDefault.has('Ambush Alert'), 'behind-camera control must be skipped').toBe(false)

    await page.evaluate(
      () => document.activeElement instanceof HTMLElement && document.activeElement.blur()
    )
    await setCameraAngle(page, Math.PI)
    await expect
      .poll(async () => (await describeByLabel(page, 'Turn Around'))!.ariaHidden)
      .toBe(null)

    const afterRotation = await tabTo(20)
    expect(
      afterRotation.has('Turn Around'),
      'now-visible Behind-You control becomes reachable'
    ).toBe(true)
    expect(
      afterRotation.has('Ambush Alert'),
      'now-visible Behind-You control becomes reachable'
    ).toBe(true)
    expect(
      afterRotation.has('Reset Wall Panel'),
      'Wall Panel rotated to the opposite offscreen edge — still skipped'
    ).toBe(false)
  })
})

test.describe('Tier 3 canary — examples/react/uikit world-space camera-follow gap', () => {
  // Expected to currently FAIL: `packages/uikit/src/react/build.tsx`'s auto-wired
  // `setupA11yProjection` call reads `camera = useThree((s) => s.camera)` — R3F's OWN default
  // camera (an untouched default PerspectiveCamera, since `<Canvas>` in
  // examples/react/uikit/App.tsx sets no `camera` prop) — for EVERY uikit root, including the
  // world-space Wall Panel and Behind-You panel. Those two roots are actually rendered relative
  // to Flatland's OWN internal camera (`flatlandCamera`, the one `<CameraOrbit>` drives and the
  // one `window.__uikitA11yScene.setCameraAngle` moves). Because the a11y projection watches the
  // wrong camera object, rotating the scripted camera has NO effect on their a11y visibility
  // state — confirmed via repeated live probing (see the report). This is a real, previously
  // undocumented library/example integration bug, not a flake. Per instructions, library source
  // is not touched to force this green; `test.fail()` keeps the assertion honest while making the
  // suite still report success, AND turns into a loud "unexpectedly passed" signal the moment
  // someone fixes the camera wiring.
  test.fail(
    'rotating the scripted camera changes the Behind-You panel a11y-hidden state',
    async ({ page }) => {
      await page.goto(REACT_URL, { waitUntil: 'networkidle' })
      await waitForA11yMembers(page, 10)

      const before = await describeByLabel(page, 'Turn Around')
      expect(before!.ariaHidden).toBe('true')

      await setCameraAngle(page, Math.PI)
      await page.waitForTimeout(1000)

      const after = await describeByLabel(page, 'Turn Around')
      // This is the assertion that SHOULD hold once the projection uses the right camera.
      expect(after!.ariaHidden).toBeNull()
    }
  )
})
