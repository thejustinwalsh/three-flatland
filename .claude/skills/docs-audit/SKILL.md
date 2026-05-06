# Documentation Audit Skill

> **Purpose:** Keep docs accurate, engaging, and visually clear — not just complete.
> **Core Principle:** Docs are part of the product. Loved docs *render the product on every page* and respect the reader's attention.

**Required Reading:**
- [react-best-practices.md](react-best-practices.md) — Modern React 19 async patterns
- [loved-docs-patterns.md](loved-docs-patterns.md) — What separates loved docs from complete docs
- [visual-devices.md](visual-devices.md) — Catalog of visual devices for graphics-library docs

---

## When to Use This Skill

- Updating documentation after API changes
- Adding new features that need documentation
- Preparing for a release
- User reports incorrect documentation
- Periodic maintenance checks (recommended quarterly)

---

## Audit Process

The audit has three layers — accuracy, engagement, and machine-readability. Run all three. Skipping engagement keeps docs technically correct but flat. Skipping LLM is silent debt.

### Layer 1 — Accuracy (the original audit)

**Files in scope:**
- `docs/src/content/docs/getting-started/*.mdx`
- `docs/src/content/docs/guides/*.mdx`
- `docs/src/content/docs/examples/*.mdx`
- `docs/src/content/docs/showcases/*.mdx`
- Any top-level pages (`index.mdx`, `branding.mdx`, `llm-prompts.mdx`)

**Source of truth:**
- `examples/three/*/main.ts` and `examples/react/*/App.tsx` — working code is ground truth
- `packages/three-flatland/src/**/*.ts` — for API verification
- `packages/presets/src/**/*.ts`, `packages/nodes/src/**/*.ts`

**Verification checklist (per code sample):**
- [ ] **Import paths** — correct package names (`three-flatland` vs `three-flatland/react`, `@three-flatland/nodes`, `@three-flatland/presets`)
- [ ] **Class names** — match actual exports (e.g., `TileMap2D` not `Tilemap`)
- [ ] **Constructor signatures** — options match actual implementation
- [ ] **Method names** — exact match (e.g., `play()` not `playAnimation()`)
- [ ] **Property names** — singular vs plural, exact spelling
- [ ] **R3F `extend()`** — every JSX element from a custom class needs `extend({ ClassName })`
- [ ] **R3F imports** — from `@react-three/fiber/webgpu`, not `@react-three/fiber`
- [ ] **`syncKey="framework"`** on every code-sample Tabs block — preserves user's framework choice across pages
- [ ] **Modern React async** — `use()` + Suspense, NOT `useEffect` + `useState` for data loading. See [react-best-practices.md](react-best-practices.md)
- [ ] **Three.js / React parity** — both frameworks demonstrate the same outcome; no framework left half-implemented
- [ ] **Cross-link paths** — relative paths resolve correctly. From `/guides/X.mdx`, sibling pages are `../sibling/`, showcases are `../../showcases/Y/`. Anchor fragments must match the actual heading slug.

### Layer 2 — Engagement (the "loved docs" rubric)

Every prose page (not auto-generated API pages) is graded against eight criteria. A page is **passing** when it scores 6+ of 8. Failing pages get a fix list.

| # | Criterion | What good looks like |
|---|-----------|----------------------|
| 1 | **Hook in 30s** | First non-frontmatter line states what the page lets the reader *do*, not what the API *is*. ("Render thousands of sprites with a single draw call." not "SpriteGroup is a class that...") |
| 2 | **One visual** | At minimum a static rendered output. Ideally a `<Compare>`, `<Example>`, mermaid diagram, or annotated image. Pure-prose pages fail this criterion. |
| 3 | **Framework parity** | Three.js + R3F tabs with `syncKey="framework"`; shared explanatory prose pulled out of tabs |
| 4 | **Signature callout** | At least one `:::tip[Performance note]` (the three-flatland signature) where applicable. Not every page needs one — but a perf-relevant page that has none is suspect. |
| 5 | **Concepts vs Reference clarity** | Page is unambiguously one of: tutorial (Learn), conceptual explainer (Concepts), how-to recipe (Guides), or API surface (Reference). Mixed-mode pages should be split. |
| 6 | **One human sentence** | A "you don't need to remember this" / "this is the part that bites you" / "leave it alone unless..." moment. Disarms the reader. Permission to be a person. |
| 7 | **Cross-links** | Links to (a) the matching `examples/` entry, (b) the relevant API reference page, (c) prerequisite concept page. Missing any of the three is a finding. |
| 8 | **Public API is JSDoc'd** | Every public class / function / option referenced on the page has a `/** ... */` block in source with `@param` / `@returns` / `@example` where useful. The auto-generated API page is only as good as the JSDoc. |

### Layer 3 — LLM Docs

`llms.txt` and `llms-full.txt` decay silently. Audit them every time.

**Verification checklist:**
- [ ] **`docs/public/llms.txt`** — every link still resolves to a current page (no renamed slugs)
- [ ] **Sections grouped by user intent** — "Build a sprite," "Add a light," not just mirroring sidebar IA
- [ ] **One-line descriptions** for every link — answers *when an LLM would want this*
- [ ] **`docs/public/llms-full.txt`** — covers the same surface as the `llms.txt` index; not stale relative to current source
- [ ] **No broken anchor fragments**
- [ ] **Generated, not hand-maintained** (long-term goal — flag if drift detected and the project has a manual generation step)

When the audit finds drift in `llms-full.txt`, regenerate. If there's no automated path, that's itself a finding — recommend a build step.

### Layer 4 — JSDoc Audit (always)

Auto-generated API pages are only as good as the source JSDoc. For every public API touched by the audited pages:

- [ ] Class has a class-level JSDoc with `@example`
- [ ] Public methods have `@param` / `@returns`
- [ ] Constructor options interfaces have field-level JSDoc
- [ ] Internal-only APIs are marked `@internal` (they get filtered from the API site)

A new public API ships with JSDoc, *or* the audit logs it as a finding. **Do not patch JSDoc by reading docs prose** — read the source, infer intent, ask if unclear.

---

## Cross-Reference Mapping

| Doc File | Reference Example | What to Verify |
|----------|-------------------|----------------|
| `quick-start.mdx` | `examples/three/basic-sprite/`, `examples/react/basic-sprite/` | Basic usage pattern, framework parity |
| `guides/sprites.mdx` | `examples/*/basic-sprite/*` | Sprite2D API, anchor/scale/lit/castsShadow |
| `guides/animation.mdx` | `examples/*/animation/*` | AnimatedSprite2D API, animation set shape |
| `guides/batch-rendering.mdx` | `examples/*/batch-demo/*` | SpriteGroup, Sprite2DMaterial, instance buffer layout |
| `guides/flatland.mdx` | `examples/*/lighting/*` (uses Flatland) | Constructor options, `globals`, `addPass`, `setLighting` |
| `guides/loaders.mdx` | `examples/*/animation/*`, `examples/*/lighting/*` | TextureLoader / SpriteSheetLoader / TiledLoader / LDtkLoader, `normals: true` |
| `guides/baking.mdx` | `scripts/bake-dungeon-normals.ts` | `flatland-bake` CLI, sidecar files, hash stamps |
| `guides/tsl-nodes.mdx` | `examples/*/tsl-nodes/*` | createMaterialEffect, all node exports |
| `guides/pass-effects.mdx` | `examples/*/pass-effects/*` | createPassEffect, schema fields, DefaultLightEffect schema |
| `guides/lighting.mdx` | `examples/*/lighting/*` | Light2D types, presets, categoryQuotas |
| `guides/shadows.mdx` | `examples/*/lighting/*` | castsShadow / shadowRadius / receiveShadows, OcclusionPass |
| `guides/tilemaps.mdx` | `examples/*/tilemap/*` | TileMap2D, markOccluders, layer API |
| `guides/skia.mdx` | `examples/*/skia/*` | SkiaCanvas, drawing nodes, paint, font loader |
| `guides/devtools.mdx` | `examples/*/lighting/*`, `mini/breakout/*` | createPane, usePane, register* APIs |

---

## Common Discrepancies

| Category | Common Issue | How to Fix |
|----------|--------------|------------|
| Imports | Wrong package | Check `packages/*/src/index.ts` exports |
| Class names | Hypothetical or stale | Check actual class exports |
| Properties | `sprite.layers` vs `sprite.layer` | Check class definition |
| Methods | Missing or renamed | Check class definition |
| Options | Different option names | Check constructor/factory signature |
| TSL nodes | Wrong package/names | Effect-node functions are in `@three-flatland/nodes`, not `three-flatland` |
| R3F `extend()` | Missing `extend()` call | React examples MUST include `extend({ ClassName })` |
| R3F imports | Missing `extend` import | Import from `@react-three/fiber/webgpu` |
| Tabs sync | Missing `syncKey="framework"` | Add it to every code-sample Tabs block |
| Cross-links | Wrong relative depth (e.g., `../showcases/` from `/guides/` should be `../../showcases/`) | Verify by mentally walking the path |
| Anchor fragments | Anchor doesn't match actual heading slug | Heading "X — Y" → slug `#x--y` (em-dash collapses to double hyphen) |
| Version pins | Two pages disagree on three.js / R3F minimum | Pick a single source of truth (usually `installation.mdx`) and propagate |
| Malformed fragments | `../page#section/` (slash after fragment) | Rewrite as `../page/#section` |
| React async | `useEffect` + `useState` for data loading | Use `use()` + Suspense pattern instead |
| React async | `if (!data) return null` guards | Wrap with `<Suspense fallback={...}>` |

---

## Performance Contract for Live Demos

Any component that mounts a Three.js / three-flatland / WebGPU canvas **must** lazy-load its deps via dynamic `import()`, mount/dispose on `IntersectionObserver`, gate behind a tap-to-activate placeholder on mobile, and respect `prefers-reduced-motion`. See the full contract in [visual-devices.md](visual-devices.md#performance-contract-for-live-demo-components). A page that ships an eager demo is worse than a page with no demo — it pollutes the bundle for every other page. Audit Layer 2 treats contract violations as a failing criterion.

## Engagement Devices Reference

For the full catalog, see [visual-devices.md](visual-devices.md). Quick reference:

| Device | Component | When to use |
|--------|-----------|-------------|
| Before/after seam slider | `<Compare>` | Lighting on/off, baked vs runtime, post-process applied vs not, normal-map on/off |
| Annotated screenshot | `<AnnotatedImage>` | Devtools panel, lighting scenes with multiple sources, atlas grids |
| Render-pipeline diagram | mermaid `flowchart TD` / `sequenceDiagram` | Frame ordering, effect chain, loader lifecycle |
| Architecture sketch | Excalidraw → committed SVG | "How the pieces fit" mental-model pages |
| Live example embed | `<StackBlitzEmbed>` (existing) | Examples pages, showcases |
| Performance sparkline | Reuse `packages/devtools/src/stats-graph.ts` | Performance / batch-rendering pages |

---

## Signature Callout: `Performance note`

three-flatland's signature callout is `:::tip[Performance note]`. It marks a place where the reader should know the perf cost / win — without disrupting the main narrative. Use it sparingly (1–2 per page max) so it stays signal, not noise.

```mdx
:::tip[Performance note]
The 32-tap SDF trace is the dominant per-light cost in dense scenes — flipping
cosmetic lights to `castsShadow: false` is often the single biggest perf win.
:::
```

This is the equivalent of Next.js's "Good to know" — a subtle voice marker that becomes part of the brand.

---

## Audit Process — Mechanics

### 1. Identify scope
List all prose pages (excluding auto-generated `api/`). 27 pages currently.

### 2. Read in batches, parallel
Use `Read` tool on 5 pages at a time. Build a per-page findings table as you go.

### 3. Spot-check API generation
Sample 3–5 random API pages. Are they generated? Do JSDoc gaps show as missing prose?

### 4. Verify cross-links
For each finding, mentally walk the relative path. `cd` doesn't help — paths are static.

### 5. LLM docs diff
`docs/public/llms.txt` link list vs current sidebar. Any renamed slugs are findings.

### 6. Compile report
Use the template below. Group by file, then by severity. Surface IA concerns separately at the top.

---

## Audit Report Template

```markdown
# Documentation Audit Report

**Date:** YYYY-MM-DD
**Pages audited:** X (prose) + Y (API spot-checked)
**Scope:** Accuracy + Engagement + LLM Docs + JSDoc

## Top-Level Findings

- IA observations (Concepts/Learn/Reference split candidates)
- Voice / signature callout adoption
- Visual coverage gaps (which pages have no visual)
- LLM docs drift summary
- JSDoc coverage gaps

## Per-Page Findings

### `path/to/page.mdx`
**Score: N/8** — [pass | fail]

**Layer 1 (Accuracy):**
- ✅ All code samples verified against `examples/.../...`
- ⚠️ Line N: malformed cross-link `../X#Y/` → should be `../X/#Y`
- ❌ Line N: `Three.js >= 0.182.0` contradicts `installation.mdx`

**Layer 2 (Engagement):**
- ✅ Hook strong
- ❌ No visual — recommend `<Compare>` of lighting on/off
- ✅ Framework parity
- ❌ No signature callout — line N is a natural fit ("the 32-tap trace…")
- ❌ Mixed Concepts + Reference — split candidate
- ✅ Cross-links present
- ⚠️ JSDoc on Foo.bar is a single line; missing @param

**Recommended fixes:**
1. (Critical) ...
2. (Medium) ...
3. (Low) ...

## Cross-Cutting Recommendations
...
```

---

## Quick Commands

```bash
# Run all examples to verify they work
pnpm dev

# Run specific example
pnpm --filter=example-three-basic-sprite dev

# Check what's exported from core
grep -r "^export" packages/three-flatland/src/index.ts packages/three-flatland/src/*/index.ts

# Find all TSL node exports
grep -r "^export.*function" packages/nodes/src/

# Spot-check JSDoc presence
grep -B1 "^export class\|^export function" packages/three-flatland/src/sprites/Sprite2D.ts | head -40
```

---

## Package Export Summary

### `three-flatland`
Core API: Sprite2D, AnimatedSprite2D, SpriteGroup, Flatland, MaterialEffect / PassEffect / LightEffect factories, loaders (TextureLoader, SpriteSheetLoader, TiledLoader, LDtkLoader), TileMap2D, devtools provider stubs.

### `three-flatland/react`
Re-exports everything from `three-flatland` + ThreeElements augmentation for R3F (`<sprite2D>`, `<spriteGroup>`, etc.) + `attachLighting` / `attachEffect` helpers.

### `@three-flatland/nodes`
TSL effect node functions (tint, hueShift, outline, dissolve, posterize, crtVignette, vhsDistortion, scanlines, palettize, lcdGrid, …). 100+ composable nodes.

### `@three-flatland/presets`
Pre-configured effects: `DefaultLightEffect`, `DirectLightEffect`, `SimpleLightEffect`, `RadianceLightEffect`, `NormalMapProvider`, `AutoNormalProvider`. React entrypoint at `@three-flatland/presets/react`.

### `@three-flatland/devtools`
Tweakpane-based panes (`createPane`, `usePane`), browser dashboard, Vite plugin (`@three-flatland/devtools/vite`).

### `@three-flatland/skia`
Skia WASM bindings + `@three-flatland/skia/three` + `@three-flatland/skia/react` entrypoints.

### `@three-flatland/bake`
Generic offline-bake framework + `flatland-bake` CLI. `@three-flatland/normals` is the canonical consumer.
