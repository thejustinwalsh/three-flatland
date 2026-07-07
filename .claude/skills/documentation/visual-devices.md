# Visual Devices — Catalog for Graphics-Library Docs

three-flatland is a 2D graphics library. Pure-prose docs are malpractice. This catalog organizes visual devices by category, with named exemplars and effort estimates, so audits can prescribe specifics rather than vague "add a diagram."

---

## 1. Conceptual Diagrams

### Hand-drawn / Excalidraw-style
- **What:** loose, sketchy diagrams that signal "mental model, not spec." Lowers reader's guard.
- **Tools:** Excalidraw (`excalidraw.com`), tldraw, roughjs
- **Exemplars:** tldraw docs, fly.io docs (Annie Ruygt illustrations), Tailscale "How Tailscale Works"
- **Effort:** Low — Excalidraw exports SVG, commit to `docs/public/diagrams/`
- **Use for:** architecture/mental-model pages (the render pipeline, effect-layer relationships)

### Mermaid (code-as-diagram)
- **What:** diagrams in markdown, version-controlled
- **Effective types:**
  - **Sequence diagrams** — async/lifecycle (`sprite → SpriteGroup → renderer → effect pass`)
  - **Flowcharts** — build pipelines, decision trees ("which lighting preset?")
  - **State diagrams** — animation states, loader states
  - *Skip class diagrams* — they read as enterprise-ware
- **Effort:** Low. Astro plugin: `rehype-mermaid` or `astro-mermaid`. Alternative: client-side `<Mermaid>` component with dynamic import (no build-time deps).
- **Exemplars:** GitHub markdown rendering, Astro docs, Prisma docs

### Custom-illustrated
- **What:** brand-defining illustrations (React's Maggie Appleton work, Stripe's flow art, Linear's polish)
- **Effort:** High — requires illustrator + style guide
- **Use for:** landing pages, conceptual hero illustrations. Not for reference docs.

### Annotated screenshots / numbered callouts
- **What:** screenshot + numbered hotspots referenced in margin prose
- **Tools:** custom `<AnnotatedImage>` MDX component (~80 lines of CSS-positioned spans)
- **Exemplars:** Apple HIG, Figma docs, Storybook UI labels
- **Use for:** devtools dashboard, lighting scenes with multiple sources, atlas/tile grids

---

## 2. Live / Interactive Visuals

### Slider-driven parameter previews
- **What:** sliders bound to TSL uniforms; reader scrubs and sees the effect change in real time
- **Tools:** Tweakpane (already used in `@three-flatland/devtools`), or Leva, or hand-rolled
- **Effort:** Medium — build `<UniformPlayground>` MDX component, mount Three+TSL canvas with editable uniforms. EffectSchema already declares what's tweakable, so the component reflects schema fields directly.
- **Exemplars:** uicolors.app, cubic-bezier.com, easings.net, three.js examples GUI
- **Use for:** *every* effect-uniform page (DefaultLightEffect, PassEffects, MaterialEffects). Highest-impact opportunity for this library.

### Before/after draggable seam
- **What:** two images stacked, draggable seam reveals the difference
- **Tools:** `img-comparison-slider` web component (drop-in, ~5 KB)
- **Effort:** Low (afternoon)
- **Exemplars:** juxtapose.knightlab.com, NVIDIA RTX comparison pages, GitHub image diff
- **Use for:** lighting on/off, baked vs runtime normals, post-process applied vs not, FXAA off/on, normal-map on/off, banding on/off, with-shadows / no-shadows

### Live-rendered embeds
- **What:** runnable code in an iframe with editable source
- **Tools:** Sandpack (`@codesandbox/sandpack-react`), StackBlitz embeds
- **Caveat:** WebContainers may not expose WebGPU — for three-flatland prefer self-hosted iframes that load the project's own `examples/` build output (already wired via `StackBlitzEmbed`)
- **Use for:** quick-start, recipes, examples pages

### Inline shader / canvas demos
- **What:** single-canvas demo with one or two sliders, focused on one concept
- **Exemplars:** thebookofshaders.com (gold standard), three.js examples, WebGPU samples
- **Effort:** Medium — `<TSLPlayground>` MDX component
- **Use for:** "what does roughness do" / "what does shadowMaxDistance do" — single-knob explainers

### Step-through animations / scrubbers
- **What:** multi-step algorithm, reader drags a scrubber to walk through frames
- **Exemplars:** ciechanow.ski (gold standard for graphics docs), distill.pub, redblobgames.com
- **Effort:** High to author from scratch. ~150 lines of React on top of `framer-motion`'s `useMotionValue`.
- **Use for:** Forward+ tile binning, radiance cascade levels, JFA SDF generation, occlusion-pass walkthrough. **One flagship explainer, not every page.**

---

## 3. Code-Output Pairing

### Side-by-side code + rendered output
- **What:** code on the left, live canvas on the right, in the same MDX block
- **Tools:** custom `<Example>` MDX component that splits prose page into code tab + iframe
- **Effort:** Medium — reuse existing `examples/` builds as iframe sources
- **Exemplars:** Tailwind utility docs (every utility has live HTML preview), Radix UI primitives, MUI
- **Use for:** *the highest-impact upgrade*. Every reference page (Sprite2D, TileLayer, lighting effects, pass effects) gets one. Converts "documentation about a graphics library" to "graphics library that documents itself."

### Tabbed code with persistent output (Stripe 3-pane)
- **What:** tabs for `three` / `react` / TSL with one persistent output canvas below
- **Effort:** Medium–High
- **Use for:** showing the same operation in three flavors with one shared visual

### Diffs (before/after refactor, two API styles)
- **What:** code with `+`/`-` highlighting showing what changed
- **Tools:** Shiki (Starlight default) supports diff syntax + `// [!code ++]` annotations
- **Effort:** Low
- **Use for:** migration guides, "old API vs new API" walkthroughs

---

## 4. Reference-Table Visuals

- **Compat / support matrices** — MDN-style, caniuse-style. Effort: low. Use for WebGPU adapter feature support.
- **Keyboard interaction tables** — Radix-style (`Space → Activates the focused button`). Effort: low. Use for devtools panel shortcuts.
- **Parameter tables with inline previews** — easings.net (each easing name has its curve). Effort: medium. Use for blend modes, easing curves, light falloff curves, post-process presets. **Highest-ROI table type for this library.**
- **Color/palette swatches** — Tailwind colors, Radix Colors. Effort: low.

---

## 5. Spatial / Geometric Explanations (high-priority for graphics)

This category is the most under-served by generic docs tooling and the most relevant.

| Device | Effort | Use for |
|--------|--------|---------|
| Coordinate-system / handedness diagrams | Low (SVG) | Introducing world / local / screen space conventions |
| Anchor / pivot visualizations (3×3 grid of dots) | Low (SVG) | `Sprite2D.anchor` |
| Tile / atlas grid overlays (CSS grid over `<img>`) | Low | Tilemap and spritesheet docs |
| UV unwrapping diagrams | Medium | Custom material authors |
| Light frustum / shadow volume sketches | Medium | Lighting concepts page |
| Render-target / pass diagrams (RenderDoc-style) | Medium | OcclusionPass, lighting tile pass, effect pipeline |

---

## 6. Performance Visualizations

- **Frame timeline charts** — Chrome DevTools Perf panel screenshots
- **Live `stats-graph` sparkline** — reuse `packages/devtools/src/stats-graph.ts` directly in docs MDX (effort: low)
- **Memory / buffer layout diagrams** — stacked-byte SVG. WebGPU Fundamentals has excellent examples. **High-value for the TSL uniform/storage interleaved-buffer docs.**

---

## 7. Comic / Illustrated Narratives

- **Julia Evans zines** (jvns.ca) — hand-drawn educational comics
- **"Build your own X" frames** — buildyourownlisp, craftinginterpreters
- **GitHub illustrated guides** ("The GitHub Flow")
- **Effort:** High to author. Use for one tentpole page ("anatomy of a SpriteGroup") — don't apply broadly.

---

## 8. Bret Victor / Distill / Ciechanowski Family (aspirational)

The visual ceiling for graphics docs.

- **ciechanow.ski** — "Lights and Shadows," "Cameras and Lenses." The single best target for "what would three-flatland docs look like at peak ambition." Hand-rolled canvas + WebGL.
- **distill.pub** — formal explorables
- **acko.net** — Steven Wittens' MathBox-driven explainers
- **thebookofshaders.com** — Patricio Gonzalez Vivo. Most directly applicable template.
- **redblobgames.com** — Amit Patel. Hex grids, A*, noise.
- **pomb.us/build-your-own-react** — scrubber-driven code walkthrough

**Use for:** one or two flagship pages, e.g. "How Forward+ tiled lighting works." The page that gets shared on Twitter.

---

## Synthesis: Priority Patterns for three-flatland

Ranked by impact-per-hour:

1. **Side-by-side code + live canvas** (`<Example>`) — highest delta. Every API page should render its output.
2. **Slider-driven parameter previews** (`<UniformPlayground>`) — maps directly onto EffectSchema uniform fields.
3. **Before/after draggable seam** (`<Compare>`) — drop-in `img-comparison-slider`. Ideal for lighting, baking, post-processing.
4. **Annotated screenshots** (`<AnnotatedImage>`) — for devtools panel and rendered scenes.
5. **Tile / atlas grid overlays** — CSS grid over a texture for tilemap and spritesheet docs.
6. **Mermaid flow + sequence diagrams** — pipeline ordering, effect chain, lifecycle.
7. **Excalidraw architecture sketches** — distinct visual register for "how the pieces fit" pages.
8. **Inline parameter tables with mini-previews** — blend modes, easings, falloff curves.
9. **One Ciechanowski-style flagship** — "How Forward+ tiled lighting works."
10. **Live `stats-graph` sparkline** — performance docs, reusing existing devtools code.

---

## Tooling for Astro Starlight

| Need | Recommendation |
|------|----------------|
| Mermaid | `rehype-mermaid` (build-time SVG) or client-side `<Mermaid>` with dynamic import |
| Excalidraw | author online, export SVG, commit to `docs/public/diagrams/` |
| MDX components | Astro supports MDX out-of-box. Author `<Example>`, `<Compare>`, `<AnnotatedImage>`, `<UniformPlayground>`, `<TileGrid>` as React or vanilla islands |
| Image diff slider | `img-comparison-slider` web component — works in MDX directly |
| Sandpack | `@codesandbox/sandpack-react` for non-WebGPU snippets. For WebGPU, prefer self-hosted iframes |
| Live React in MDX | `<MyDemo client:visible />` — defer init until scroll |
| Code highlighting | Shiki (Starlight default) supports diff + `// [!code ++]` annotations |
| Tweakpane | already used by `@three-flatland/devtools` — reuse for slider UIs in docs demos. Pane consistency between docs and devtools is itself a pedagogical signal. |

---

## Minimum Viable Visual Upgrade

If only three devices ship:

1. **`<Example>`** — code + live canvas pair. Every API page gets one. Reuses existing examples builds.
2. **`<Compare>`** — before/after seam slider. Drop-in component. Lighting, baking, post-process, normal-map.
3. **`<AnnotatedImage>`** — numbered hotspots. Serves both pipeline diagrams and spatial tilemap/atlas docs.

These three cover code-output pairing, interactive comparison, and spatial annotation — the three categories most under-represented in current graphics-library docs and most aligned with reusing the existing example suite.

---

## Performance Contract for Live Demo Components

**This is a hard contract.** Any docs component that mounts a `three.js` / `three-flatland` / WebGPU canvas (`<Example>`, `<UniformPlayground>`, `<TSLPlayground>`, anything that puts pixels on screen via the GPU) MUST satisfy all of the following or it does not ship:

### 1. Lazy bundle loading
- The component file itself can ship in the docs bundle, but `three`, `three-flatland`, `@three-flatland/presets`, `@three-flatland/nodes`, and any heavy client lib (mermaid.js, Skia WASM, `img-comparison-slider`) MUST be loaded via dynamic `import('...')` inside the client-side mount path.
- Astro: use `client:visible` or `client:idle` rather than `client:load` so the JS doesn't block first paint.
- The *static* fragment of the page (placeholder image, code block, prose) renders without any of those imports.
- Verify by building the docs and inspecting the chunk graph: a fresh page load to `/three-flatland/getting-started/introduction/` must not pull `three.js` into the initial waterfall.

### 2. IntersectionObserver mount/dispose
- Don't initialize the demo until the placeholder enters the viewport (`rootMargin: '200px'` is a sensible default — start fetching deps just before the user scrolls in).
- When the placeholder leaves the viewport, dispose: stop the rAF loop, dispose any `WebGPURenderer` / `Flatland` / `Sprite2DMaterial` / textures, drop the canvas. WebGPU contexts are expensive; leaving them parked off-screen tanks battery and shared GPU bandwidth.
- On re-entry, restart from a fresh dispose-aware state. Idempotency is the contract.

### 3. Mobile-first activation
- On viewports < ~768px (and on `(prefers-reduced-data: reduce)`), do **not** auto-mount the canvas even when it scrolls into view. Show a static placeholder (an actual rendered PNG of the demo's first frame) with a tap-to-activate overlay ("▶ Run interactive demo").
- WebGPU on mobile Safari is still patchy; mobile users on a docs site rarely want to wait for a multi-MB three-flatland demo to download on cellular.
- Once activated, behave as desktop (lazy-load deps, then mount). Capture the activation in a per-page state so subsequent canvases on the same page don't re-prompt.

### 4. Respect `prefers-reduced-motion`
- If the user has set `(prefers-reduced-motion: reduce)`, render a static placeholder by default and require explicit activation, even on desktop.
- Don't run autoplay animation loops in this state. If activated, run at a steady single-frame state or expose a manual scrubber.

### 5. Single shared dependency cache
- Don't have each `<Example>` instantiate its own `await import('three')`. Wrap the dynamic imports in a module-level memoized loader (e.g., `let threePromise: Promise<typeof three> | null = null`) so 5 demos on one page share one network fetch + one parse.
- Same pattern for `three-flatland` and any preset/node packages.

### 6. Shared `<LiveCanvas>` host
- Build one component that owns lazy-load + IntersectionObserver + mobile gating + reduced-motion gating + dispose. Have `<Example>`, `<UniformPlayground>`, `<TSLPlayground>` compose with it rather than re-implement the contract.
- Recommended path: `docs/src/components/LiveCanvas.tsx` (React island, since R3F integration is most likely there).

### 7. Telemetry + budget
- During the audit, sample 3–5 representative pages with multiple demos and verify:
  - Initial JS payload (without scroll) — target < 200 KB gzipped, identical to a pure-prose page
  - First demo activation — target < 800 KB additional (one-time, cached for subsequent demos on same page)
  - GPU memory after disposing 5 demos in sequence — should return to baseline; if it grows, dispose is leaky
- Add a build-time check: `pnpm dev` + scrape network panel, fail the audit if a fresh prose page pulls in three.js.

### Failure modes to actively guard against

- **Eager evaluation in module scope** — `const renderer = new WebGPURenderer()` at the top of an `Example.tsx` will run during `client:load` even if the user never scrolls to that demo. Always defer to mount.
- **Effect-without-cleanup** — `useEffect(() => { mount(); }, [])` without a return value leaks the canvas forever. Always return a dispose closure.
- **Multiple WebGPU contexts on screen at once** — some browsers cap simultaneous contexts. Pause off-screen demos rather than running them all.
- **`three` imported via static import in MDX-adjacent helpers** — even a `loadExample()` helper that statically imports anything from `three` will pull it into the prose-page bundle. Audit `docs/src/utils/` for this anti-pattern during the audit.

### How this lives in the audit

Layer 2 of the audit (engagement rubric) treats violation of this contract as a **failing** criterion. A page that adds a live demo without lazy-loading is *worse* than a page with no demo, because it tanks every other page's first paint via shared bundle pollution. Better to ship the prose-only version.
