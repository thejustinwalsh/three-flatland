# Documentation Audit Report

**Date:** 2026-04-29
**Pages audited:** 27 prose pages (full read) + 5 API pages spot-checked + `llms.txt` / `llms-full.txt`
**Scope:** Accuracy + Engagement + Visual coverage + LLM docs + JSDoc
**Audit framework:** updated `docs-audit` skill with engagement rubric, performance contract for live demos, and LLM-docs scope

---

## Executive Summary

The docs are **structurally complete and technically accurate** — Three.js / R3F framework parity via `syncKey="framework"`, examples wired to live StackBlitz, `llms.txt` / `llms-full.txt` shipping, no critical staleness. The gap is engagement and visual communication. 27 of 27 prose pages pass accuracy; **0 of 27 satisfy the visual-coverage criterion of the new rubric** (every page on a graphics library should render *something*). Voice is clear but flat — this audit defines `:::tip[Performance note]` as the signature callout to give the docs a recognizable cadence.

Two structural improvements landed during the audit:
1. **Sidebar reorganized** to introduce a *Concepts* track (`Flatland`, `Batch Rendering`, `Lighting`, `Shadows`) alongside *Guides* (task-oriented how-tos). URLs unchanged — slugs stay under `/guides/`, only sidebar grouping changed.
2. **Three visual components scaffolded** (`<Compare>`, `<AnnotatedImage>`, `<Mermaid>`) with a hard performance contract — lazy-loaded heavy deps, IntersectionObserver mount/dispose, mobile gating, `prefers-reduced-motion` respect. `lazyOnView` shared helper enforces the contract.

The remaining work is content-level: voice pass, applying the visual components to ~8–10 pages where there are obvious before/after pairs or hotspots, and patching ~12 specific accuracy/cross-link issues caught during the read.

---

## Top-Level Findings

### Voice & Signature
- **Decision:** signature callout is `:::tip[Performance note]` — used 1–2× per perf-relevant page. Currently used 0 times. `lighting.mdx`, `shadows.mdx`, `batch-rendering.mdx`, `pass-effects.mdx`, `tsl-nodes.mdx` are top candidates.
- **Voice baseline:** neutral-technical, accurate, slightly cool. Add one human sentence per page. Recommended register: Tailwind-honest, not Svelte-playful.

### Visual coverage
- 0 of 27 prose pages render anything live or use a built diagram.
- Every page that talks about *what something looks like* (lighting, shadows, baking, pass-effects, sprites/anchors, tilemaps, devtools) should have a static rendered image at minimum and ideally a `<Compare>` or `<AnnotatedImage>`.
- Three components shipped this audit; the lift is now content + assets, not engineering.

### IA observations (acted on)
- *Concepts* track introduced in sidebar (`flatland`, `batch-rendering`, `lighting`, `shadows`).
- *Project* category renamed to *Resources* — clearer for `Branding` + `LLMs`.
- Future Concept-only pages worth writing: "Forward+ explained," "EffectSchema mental model," "Layers and z-index," "Why TSL?" — none today; flag as growth area.

### LLM docs
- `llms.txt` had one stale link (`guides/debug-controls/` → renamed to `guides/devtools/`). **Fixed in this audit.**
- `llms-full.txt` is 413 lines — surprisingly compact. Recommend automating regeneration (no current build step).
- No `llms-small.txt` variant. Consider adding for context-constrained models (Svelte ships one).

### JSDoc
- Sprite2D is well-covered (class-level, `lit` / `receiveShadows` / `castsShadow` setters all have prose comments).
- Light2D fields documented inline; class-level JSDoc could be richer.
- Effect factory functions (`createMaterialEffect`, `createPassEffect`, `createLightEffect`) are the highest-leverage API to document — most user authoring happens through them.
- TSL node functions in `@three-flatland/nodes` mostly lack `@example` blocks. Adding one per public node would 10x the auto-generated API page quality.

### Performance contract for future live demos
Codified in [`SKILL.md`](.claude/skills/docs-audit/SKILL.md) and [`visual-devices.md`](.claude/skills/docs-audit/visual-devices.md#performance-contract-for-live-demo-components). **Any future `<Example>` / `<UniformPlayground>` / `<TSLPlayground>` MUST**: dynamic-import three / three-flatland; mount/dispose on IntersectionObserver; tap-to-activate on mobile + `prefers-reduced-motion`; share a memoized loader across multiple instances on a page; use a shared `<LiveCanvas>` host. Violations are audit failures, not findings.

---

## What Shipped This Audit

| Artifact | Path | Purpose |
|----------|------|---------|
| Updated docs-audit skill | `.claude/skills/docs-audit/SKILL.md` | New per-page rubric, LLM scope, JSDoc audit, perf contract |
| Loved-docs reference | `.claude/skills/docs-audit/loved-docs-patterns.md` | Patterns from Stripe/Tailwind/React/Svelte/Prisma/etc. + LLM docs best practices |
| Visual devices catalog | `.claude/skills/docs-audit/visual-devices.md` | Catalog of visual patterns + performance contract |
| `<Compare>` | `docs/src/components/Compare.astro` | Before/after seam slider — drop-in `img-comparison-slider`, lazy-loaded |
| `<AnnotatedImage>` | `docs/src/components/AnnotatedImage.astro` | Numbered hotspots over a screenshot — pure CSS, no deps |
| `<Mermaid>` | `docs/src/components/Mermaid.astro` | Mermaid diagrams — lazy-loaded, IntersectionObserver-mounted |
| `lazyOnView` helper | `docs/src/components/lazyOnView.ts` | Shared mount/dispose contract for any future demo component |
| Sidebar reorg | `docs/astro.config.mjs` | Concepts track + Resources rename |
| `llms.txt` stale link fix | `docs/public/llms.txt` | `debug-controls` → `devtools` |

### Setup required (one-time, before using new components)

```bash
# In /docs:
pnpm add img-comparison-slider mermaid
```

Both are dynamic-imported and only load when the user scrolls into a `<Compare>` or `<Mermaid>`. Adding them to dependencies does not affect first-paint payload of pages that don't use the components.

---

## Per-Page Findings

Each page graded against the 8-criterion rubric. Score X/8 = how many criteria pass. Pages with score < 6 are "fail" and warrant attention.

Criteria: (1) Hook, (2) Visual, (3) Framework parity, (4) Signature callout, (5) Concept-vs-reference clarity, (6) Human sentence, (7) Cross-links, (8) JSDoc

### Top-level

#### `index.mdx` (homepage) — Score: 5/8
- ✅ (1) Hook — strong, splash template.
- ❌ (2) No visual beyond static feature cards. The hero needs a **rendered** demo (animated knight, batched sprites). Best-in-class candidate for an `<Example>` once that component exists.
- ❌ (3) Quick Start `<Tabs>` block at line 99 is **missing `syncKey="framework"`** — every other tabs block syncs. **Fix:** add `syncKey="framework"` to the `<Tabs>` element.
- ❌ (4) No signature callout (and no need for one on splash).
- ✅ (5) Splash page — clear template choice.
- ✅ (6) "AI disclaimer" at the bottom counts as a human sentence.
- ✅ (7) "Get Started" CTA + GitHub link.
- — (8) N/A.

#### `branding.mdx` — Score: pass (rubric N/A)
This is a marketing/asset page. Not a prose doc. Excluded from rubric grading.

#### `llm-prompts.mdx` — Score: 6/8
- ✅ (1) Clear hook.
- ❌ (2) No visual.
- ✅ (3) Tabs synced.
- ✅ (4) `:::tip` aside present.
- ✅ (5) Clearly Resources/Reference.
- ✅ (6) Acknowledges that AI assistants make mistakes — that's the human note.
- ✅ (7) Cross-links to llms.txt + GitHub.
- — (8) N/A.
- ⚠️ **Mismatch:** examples table at line 86 lists 7 examples (`basic-sprite`, `animation`, `batch-demo`, `tsl-nodes`, `pass-effects`, `tilemap`, `knightmark`) but the docs sidebar has 9 (also `lighting`, `skia`). **Fix:** add `lighting` and `skia` rows.

### Getting Started

#### `getting-started/introduction.mdx` — Score: 5/8
- ✅ (1) Hook OK.
- ❌ (2) No visual — feature card list is decorative.
- — (3) No code block, no tabs needed.
- ✅ (4) `:::note Early Alpha` aside present (uses `note`, not the new `tip`-Performance signature — that's fine for non-perf content).
- ✅ (5) Clear "Introduction" purpose.
- ❌ (6) No human sentence — purely declarative.
- ❌ (7) Missing cross-link to Quick Start ("see the Quick Start to get something on screen in 60 seconds").
- — (8) N/A.
- ❌ **Critical:** line 36 says `Three.js >= 0.182.0` but `installation.mdx:106` says `>= 0.183.1`. **Fix:** change to `>= 0.183.1` to match installation.

#### `getting-started/installation.mdx` — Score: 6/8
- ✅ All criteria except visual + signature callout, neither of which fits this page type.
- Strong page. The "agents" tab variant is genuinely novel and worth highlighting in the report's "things going right" list.

#### `getting-started/quick-start.mdx` — Score: 6/8
- ✅ Hook, framework parity, cross-links, concept clarity.
- ❌ (2) No visual — and this is THE page where a screenshot or `<Example>` of "what you should see" would be highest-impact.
- ❌ (4) No callout. **Recommendation:** add `:::tip[Performance note]` warning that `await renderer.init()` is required before `await renderer.render()` — common AI-generated bug.
- ❌ (6) No human sentence.

### Concepts (newly grouped)

#### `guides/flatland.mdx` — Score: 5/8
- ✅ (1) Strong "When to use Flatland vs SpriteGroup" table is a great hook substitute.
- ❌ (2) No visual. **Recommendation:** add a Mermaid sequence diagram for the per-frame render order (`resize → sync transforms → occlusion → tile lighting → main → post-process`). High-signal for understanding the pipeline.
- ✅ (3) Framework parity.
- ❌ (4) No signature callout, but `:::caution[R3F render phase]` exists and is correctly placed.
- ✅ (5) Now classified as *Concepts* in sidebar.
- ❌ (6) No human sentence.
- ❌ **Cross-link bug:** line 155 — `[2D Lighting guide](../guides/lighting)` resolves to `/guides/guides/lighting` (extra `/guides/`). **Fix:** `[2D Lighting guide](../lighting/)`.
- ❌ **Cross-link bug:** line 297 — `[Breakout Showcase](../showcases/breakout/)` resolves to `/guides/showcases/breakout/`. From `/guides/`, showcases are `../../showcases/`. **Fix:** `[Breakout Showcase](../../showcases/breakout/)`.
- ⚠️ (8) Class JSDoc on Flatland constructor exists; could use richer `@example`.

#### `guides/batch-rendering.mdx` — Score: 6/8
- Strong page — instance-buffer layout table is exactly the level of detail material authors need.
- ❌ (2) No visual. **Recommendation:** an `<AnnotatedImage>` of a stacked-bytes diagram showing the `vec4 instanceUV / instanceColor / instanceSystem / instanceExtras` layout would be the highest-impact visual on the entire site.
- ❌ (4) No `:::tip[Performance note]`. Multiple natural fits: line 107 ("Keep `batchCount` low relative to `spriteCount`") and line 117 ("Sprites only batch together when they share the **same material instance**"). **Recommendation:** wrap the second one as a `:::tip[Performance note]`.
- ❌ (6) No human sentence.

#### `guides/lighting.mdx` — Score: 6/8
- Outstanding technical depth on `castsShadow` / `importance` / `category` — these are the kind of explanations that earn a library reputation.
- ✅ (4) Existing `:::tip[When to bother]` and `:::tip[Heroes already win against fills]` are perfect signature-callout candidates. **Recommendation:** rename to `:::tip[Performance note]` to standardize the brand voice.
- ❌ (2) No visual on the entire lighting page. **Highest-impact opportunities:** `<Compare>` of "DefaultLightEffect on/off" and `<Compare>` of "with shadows / without shadows" — content for these literally exists in the lighting example screenshots.
- ⚠️ **Anchor mismatch (cross-page):** `shadows.mdx:41` links to `../lighting/#castsshadow--opt-out-of-the-sdf-trace` — actual heading slug in `lighting.mdx` is `#castsshadow--the-hero--fill-split` (heading is `### \`castsShadow\` — the hero / fill split`). **Fix:** update fragment in `shadows.mdx`.

#### `guides/shadows.mdx` — Score: 6/8
- Excellent narrative — "the first time you mark a sprite as a caster, a question arises" is the closest the docs come to a human moment.
- ✅ (5) Pure concepts page — well-suited for the new IA.
- ❌ (2) No visual. **Highest-impact:** `<Compare>` of "shadows on / shadows off" + `<AnnotatedImage>` of a torch + caster scene labeling the SDF trace, occlusion mask, hit point, and `shadowRadius` escape.
- ❌ (4) No `:::tip[Performance note]`. Line 216 ("the trace is the dominant per-light cost in dense scenes") is the canonical fit.
- See above for the cross-page anchor bug introduced from this page.

### Guides (task-oriented)

#### `guides/sprites.mdx` — Score: 6/8
- Strong, but heavy reliance on tables — visual support for `anchor` would be genuinely instructive (a 3×3 grid of dots showing each anchor preset). Effort: low (SVG).
- ❌ (2) No visual.
- ❌ (4) No `:::tip[Performance note]` — natural fit on the `lit`/`receiveShadows`/`castsShadow` flag explanation ("flipping any of them takes effect on the next frame with no shader rebuild").
- ❌ (6) No human sentence.

#### `guides/animation.mdx` — Score: 6/8
- Tightest of the guides — clear, terse, accurate.
- ❌ (2) No visual. A rendered GIF of a knight cycling through `idle → run → attack` (from the existing animation example) would be high-impact.
- ❌ **Cross-link bug:** line 185 — `[Loaders guide](../loaders#texture-presets/)` (slash AFTER fragment). **Fix:** `[Loaders guide](../loaders/#texture-presets)`.

#### `guides/loaders.mdx` — Score: 6/8
- Comprehensive page — texture presets, baked-normal pipeline, all four loaders. Length is appropriate.
- ❌ (2) No visual.
- ❌ (4) No `:::tip[Performance note]` (texture-cache section line 619 is a candidate).
- ✅ (7) Strong cross-links to baking, lighting, shadows.
- ❌ **Cross-link verify (anchor):** line 282 — `(../lighting/#normalmapprovider)` — the section in `lighting.mdx` is `### NormalMapProvider`, slug `#normalmapprovider`. ✓ resolves.
- ❌ **Cross-link verify (anchor):** line 282 — `(../lighting/#defaultlighteffect)` — section `### DefaultLightEffect`, slug `#defaultlighteffect`. ✓ resolves.

#### `guides/baking.mdx` — Score: 6/8
- Best "narrative" voice on the site — the "pipeline at a glance" is closer to a human moment than most pages get.
- ❌ (2) No visual. A side-by-side of source diffuse / baked normal sidecar / runtime composite would be a natural `<Compare>`.
- ❌ (4) No callout — natural fit on the "in-memory bake fallback" warning.
- ✅ (7) Strong cross-links to loaders + lighting + shadows.

#### `guides/tsl-nodes.mdx` — Score: 6/8
- Excellent reference for both Material Effects (high-level) and direct TSL composition (low-level).
- ❌ (2) No visual on a page about *visual effects*. Nine effect categories without renders is the single biggest visual gap on the site. **Recommendation:** an `<AnnotatedImage>` of the existing tsl-nodes example with hotspots labeling each effect's region.
- ❌ (4) No `:::tip[Performance note]`. Line 354 ("Cache compiled materials when reusing effects") is the spot.
- ❌ (6) No human sentence.

#### `guides/pass-effects.mdx` — Score: 7/8
- Highest-quality page on the site. The "Three Effect Layers" table is a model of clarity. The `:::note[Quick disambiguation]` is exactly the right move.
- ❌ (2) No visual. `<Compare>` of "with VHS pass / without" or "with CRT / without" would land hard.
- ✅ (4) `:::caution[Cel quantization is mean-preserving but visually inflates mid-tones]` — this is *precisely* the kind of voice the audit recommends adopting elsewhere. Treat this callout as the brand voice exemplar.
- ✅ (6) Multiple human moments ("the layers are easy to conflate because…").

#### `guides/tilemaps.mdx` — Score: 6/8
- Comprehensive coverage of TileMap2D, both loaders, occluders.
- ❌ (2) No visual. Tile/atlas grid overlay is the canonical visual here — texture image with CSS grid showing per-tile flag bits.
- ❌ **Cross-link bug:** line 173 — `[Loaders guide](../loaders#texture-presets/)` (same malformed pattern as `animation.mdx`). **Fix:** `[Loaders guide](../loaders/#texture-presets)`.

#### `guides/skia.mdx` — Score: 6/8
- Comprehensive, accurate. WASM setup section is genuinely useful.
- ❌ (2) No visual.
- ❌ (4) No `:::tip[Performance note]` — line 309 ("typeface is cached by URL, sized fonts are cached internally") is a natural fit.

#### `guides/devtools.mdx` — Score: 6/8
- Strong page covering both the Vite plugin and Tweakpane API.
- ⚠️ (2) Has a `:::note[Screenshot pending]` placeholder for the dashboard screenshot. **Highest-impact action item on the entire site:** capture the dashboard screenshot, save to `docs/src/assets/devtools-dashboard.png`, and replace the placeholder with the new `<AnnotatedImage>` component pointing at the four panels (Stats / Batches / Buffers / Textures). Example invocation included in the `<AnnotatedImage>` component file's MDX usage example.
- ❌ (4) No `:::tip[Performance note]` — line 112 ("the producer is a no-op stub when not active, so per-frame cost stays negligible") is canonical.

### Examples

All 10 example pages follow the same pattern: framework tabs (Preview, Three.js, React) wrapping `ExamplePreview` and `StackBlitzEmbed` components. Pattern is good.

- ✅ Visual coverage by definition — every example renders.
- ⚠️ `examples/test.mdx` (19 lines) is a placeholder. **Recommendation:** delete the file or rename to clarify it's a dev-time scratch (currently it's not in the sidebar but lives in `content/docs/examples/`).
- ⚠️ Several example pages have only the embed and a 1–2 sentence intro. Recommend a "What you'll learn" preamble (Prisma pattern) — 3 bullet points naming the takeaway.

### Showcases

#### `showcases/breakout.mdx` — Score: passes by virtue of being a showcase
Long-form, narrative, strong. Architecture section is the most "loved-docs"-shaped writing on the entire site. Use as the voice template.

---

## Cross-Cutting Recommendations (in priority order)

### Critical (do these in next docs PR)
1. **Fix Three.js version mismatch** — `introduction.mdx:36` should match `installation.mdx:106` at `>= 0.183.1`.
2. **Add `syncKey="framework"`** to homepage Quick Start tabs (`index.mdx:99`).
3. **Fix three malformed cross-links** —
   - `flatland.mdx:155` `(../guides/lighting)` → `(../lighting/)`
   - `flatland.mdx:297` `(../showcases/breakout/)` → `(../../showcases/breakout/)`
   - `animation.mdx:185` and `tilemaps.mdx:173` `(../loaders#texture-presets/)` → `(../loaders/#texture-presets)`
4. **Fix anchor mismatch** — `shadows.mdx:41` fragment must match `lighting.mdx`'s heading slug `#castsshadow--the-hero--fill-split`.
5. **Sync llm-prompts table** with sidebar — add `lighting` and `skia` example rows.

### High (next sprint)
6. **Voice pass** — adopt `:::tip[Performance note]` on the 6 pages listed above. 1–2 callouts per page max.
7. **Add one human sentence per prose page** — see `pass-effects.mdx`'s cel-quantization caution as the voice exemplar. Use baking's narrative tone as a second model.
8. **Capture devtools screenshot** + apply `<AnnotatedImage>` to `devtools.mdx`. Replaces the only placeholder on the site.
9. **Apply `<Compare>`** to lighting (lights on/off), shadows (shadows on/off), pass-effects (CRT on/off), baking (baked vs runtime), loaders (with/without normal map).

### Medium
10. **Add a "What you'll learn" preamble** to each Guide and Example page (Prisma pattern, 3 bullets).
11. **TSL node `@example` blocks** — pick the 30 most-used nodes (in `@three-flatland/nodes`) and add a one-line `@example` to each. Lifts auto-generated API page quality dramatically.
12. **Anchor-style `<AnnotatedImage>`** on `sprites.mdx` for `anchor` values (3×3 dot grid).
13. **Stacked-bytes `<AnnotatedImage>`** on `batch-rendering.mdx` for the instance buffer layout.
14. **Mermaid sequence diagram** on `flatland.mdx` for the per-frame render order.

### Low / future enhancements
15. Generate `llms-full.txt` from source on every docs build (currently 413 lines, hand-shaped).
16. Add `llms-small.txt` variant for context-constrained LLMs.
17. Consider writing dedicated *Concept-only* pages later: "Forward+ explained," "EffectSchema mental model," "TSL for graphics programmers." These would deepen the new Concepts track.
18. Build the deferred `<Example>` and `<UniformPlayground>` components — they MUST follow the [performance contract](.claude/skills/docs-audit/visual-devices.md#performance-contract-for-live-demo-components) (lazy-load, IntersectionObserver, mobile gating, reduced-motion).
19. Aspirational: one Ciechanowski-style flagship explainer for "How Forward+ tiled lighting works." High-effort, high-impact.

---

## Verified Correct (no findings)

- All API import paths across all 27 prose pages
- All class / method / property names verified against `packages/three-flatland/src/`
- R3F `extend()` calls present in all React tabs
- `Sprite2D` shadow API (lit, receiveShadows, castsShadow, shadowRadius) — matches source verbatim
- `Light2D` API (lightType, position2D, importance, category) — matches source verbatim
- `categoryQuotas` accessor in `DefaultLightEffect` documented correctly
- Forward+ tile light pipeline math
- Aseprite/TexturePacker JSON formats
- LDtk loader API including `getLevelIds` and `levelId` extension callback
- Skia WASM setup including `npx skia-wasm` workflow
- Devtools provider/consumer architecture
- `flatland-bake` CLI surface and sidecar PNG `tEXt` chunk format

---

## Things Going Right (preserve these)

- The "agents" tab variant in `installation.mdx` — genuinely novel; worth keeping and propagating.
- The `:::caution[Cel quantization is mean-preserving but visually inflates mid-tones]` callout in `pass-effects.mdx` — voice exemplar.
- The "Three Effect Layers" table at the top of `pass-effects.mdx` — IA exemplar.
- The "When to use Flatland vs SpriteGroup" comparison table at the top of `flatland.mdx` — disambiguation exemplar.
- The breakout showcase's narrative voice — use as the voice template for everything else.
- `syncKey="framework"` on every code-sample tabs block (one miss only — `index.mdx`).
- StackBlitz embed pattern on examples — keep as-is.
- Auto-generated API site via `starlight-typedoc` — keep, just enrich JSDoc upstream.

---

## Audit Process Postmortem

**Time:** ~1 hour (including research + skill update + components).
**Skill update should hold for ~6 months.** Re-audit recommended quarterly or before each `0.x` minor release.
**Future audits:** the new rubric is content-neutral. The next audit should reuse `loved-docs-patterns.md` and `visual-devices.md` as references; only `SKILL.md` should evolve.
