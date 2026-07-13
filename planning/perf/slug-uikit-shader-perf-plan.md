# Slug + uikit shader perf hardening plan

Captured 2026-07-13, branch `feat/uikit-fork`. Source of the perf recommendations: a
Codex (GPT) perf-exploration pass over our TSL shaders + the windfoil reference, plus a
Codex adversarial review. The raw Codex output lived in the gitignored `.codex-perf/`;
this doc inlines it so it survives.

## How we got here (context)

Profiling the committed render benchmark (`pnpm --filter=example-react-uikit-perf bench`)
showed the fork's per-frame GPU floor was **fill-bound (per-fragment over screen area),
not per-glyph** — 64× the glyphs (192→12k) barely moved it. Method that nailed it: a
**viewport-scaling test** — GPU-ms at 1600×1000 vs 640×400 vs 400×260 at a fixed low
load, fit `GPU ≈ fixed + k·pixels`. Slug ≈ 1.9ms fixed + 2.9ms/MP fill; MSDF ≈ 0.34 +
1.1ms/MP.

Comparison codebases (cloned to job tmp, analyzed): **JSlug** (manthrax — architecturally
identical to ours, no missing unlock, leaner fragment), **windfoil** (texel-org — exact
box-filtered area vs our winding-ramp), Lengyel's reference. Findings: Slug wins legible
8–64px UI text (~1.2–3.4× vs windfoil); windfoil wins minification/sub-pixel/cusps/
exactness/atlas-memory; MSDF wins 3D-minification (mipmaps).

## Shipped (do NOT redo)

- **`dfbf5a6d`** perf(uikit,slug): (1) panel material — the rounded-corner SDF (4×
  `radiusDistance` = 8 sqrt) was evaluated for all four corners unconditionally then a
  branch selected one; gated INSIDE the branch so flat-fill computes zero corners.
  (2) slug text+stroke — fixed `Loop(40)` → dynamic `Loop({start,end:curveCount})`
  (register pressure was reserving for 40 curves/fragment; also fixed a latent >40-curve
  truncation bug). ~30–41% GPU drop, pixel-identical.
- **`6f6f5f36`** fix(slug): numerically-stable q-form quadratic solve (grazing curves).
- **`866f77f9`** fix(slug): address the Codex adversarial review of the q-form —
  (a) grazing guard was `d < 1/65536`, which collapsed DISTINCT roots when the leading
  coefficient is small (root separation is 2d/|a|); re-keyed on the pre-clamp
  discriminant `discRaw <= 0`, and restructured `stableRoots` to imperative
  `If(nearLinear).ElseIf(grazing).Else(qform)` which ALSO fixed the Codex perf finding #1
  (branchless `select` evaluated all four divisions every fragment; common path now pays
  two). (b) added a defensive loop cap `MAX_SAFE_BAND_CURVES=512` (corrupt/hostile
  `.slug.glb` from an external URL could spin the dynamic loop into a GPU watchdog).
  (c) updated `reference.ts` to mirror the q-form so the tests actually cross-check it +
  added the counterexample as a regression test.

## Measurement workflow for the remaining passes

GPU-ms is NOISY on battery (we saw ±2ms swings; upstream MSDF drifting 2.28→1.12 while
unchanged). So per pass:
1. Implement.
2. **Back-to-back A/B via `git stash`** — measure with the change, `git stash`, measure
   without, `git stash pop` — to isolate the delta from thermal/battery drift.
3. Verify **pixel-parity** (bento/lab screenshots + `slug/src/shaders/reference.test.ts`).
4. Commit only real wins.
Full-bench snapshots (`report.html` + `text-report.html`) bracket the whole loop
(before → after); the fast focused probe attributes each pass.

## Codex perf plan — ranked zero-regression wins

Estimates are Codex hypotheses to validate on the bench, not measured. #1 is already done
(folded into `866f77f9`).

1. **[DONE] Stop eager root-fallback eval** — `select` evaluated q/a, c/q, b/a, c/2b every
   fragment; imperative `If/ElseIf` pays only the taken branch. ~10–25% fill ALU.
   `solveQuadratic.ts`.
2. **Early hull bound in each band reference** — pack the sorted axis hull-max (max-X for
   H bands, max-Y for V) into the RG band-reference texel's `y`, so the shader tests the
   sorted early-exit right after the reference load and skips the two terminal curve
   texel loads + point reconstruction (up to 4 curve reads/fragment). Compute the hull
   from the half-float-decoded coords or round OUTWARD (never inward). ~5–15% (more CJK).
   Med — touches `pipeline/texturePacker.ts:158`, baked-format metadata/versioning,
   loaders, `slugFragment.ts:115,129`, tests.
3. **Unclipped instanced-panel variant (build-time)** — every instanced-panel fragment
   evaluates 4 plane distances + 4 `fwidth` + 4 `smoothstep` even when all lanes hold the
   disabled sentinel. Build a zero-plane material for batches with no clipping (and maybe
   1–4-plane variants). Large panel-floor win where most cards/backgrounds are unclipped.
   Med/high — batching policy is the hard part, NOT shader syntax. `shader.ts:298`.
   Build-time JS omits the graph; do NOT use a runtime `select`.
4. **Only the real non-instanced clip-plane count** — the uniform clip path
   (`shader.ts:323`, loop at `:336`) always builds 4 lanes; build `min(planes.length,4)`
   at graph-build time. ≤75% of that subpath for the common 1-plane case. Low.
5. **Exact quadratic glyph bounds** — `buildGpuGlyph.ts:79` includes the control point
   directly; a quadratic doesn't reach its control point, so the quad/bands/overdraw are
   enlarged. Evaluate the per-axis derivative-zero extremum instead. Modest for fonts,
   ~5–30% for loose-control SVGs. Low, CPU-side (keep the half-pixel dilation outside).
6. **Per-glyph band count (not fixed 16)** — dense CJK/complex SVG keep a large curves/band
   term. Choose a power-of-two in [8,64] from curve count + projected reference
   duplication, target ~3–6 curves/band. ~20–50% dense-CJK fragments; little/negative for
   Latin if applied globally. Med — needs corpus stats + tuning across Latin/CJK/SVG/
   WebGPU/WebGL2. `bandBuilder.ts:3`. (Dynamic loops already support any count.)
7. **Branch per individual root contribution** — `slugFragment.ts:141,191` build both root
   ramp/weight then mask with `select`; root codes usually authorize one root. Test
   `If(hasRoot1)/If(hasRoot2)`. 3–10%, uncertain (per-lane root-code divergence may
   offset). Low — bench both backends, reject if it loses.
8. **[trivial] Short-circuit decoration rects in the STROKE material** — the fill material
   uses a real `If` for rect sentinels, but the stroke evaluates `slugStroke()` then
   `isRect.select(0, coverage)`, so underline/strike rects still run both band walks + the
   distance-to-Bézier solver. Mirror the fill's `If/Else`. `SlugStrokeMaterial.ts:208`.
9. **Dedup ALL identical band lists (not just adjacent)** — `texturePacker.ts:158` only
   compares the previous band; use a per-glyph map from the full ordered index list to its
   offset (+ optional contiguous-suffix reuse). Atlas size/upload; small GPU. Low.

**Conditional follow-up:** for LIT (non-basic) panels `computePanelFragment` runs twice
(color `shader.ts:353` + normal `:373`), re-deriving the corners. Inspect generated
WGSL/GLSL first; if Three doesn't CSE it, share one node result. Does NOT hit the default
`MeshBasicNodeMaterial` background (normalNode skipped), so it's not the measured floor.

## Windfoil-for-SVG verdict: DO NOT default it (yet)

Fails both gates: (1) **not generally faster for typical SVGs** — Slug wins through
practical sizes (dense 240-quad shape ~6× at 12px, tiger ~4.6× at 64px); windfoil only
crosses over ~512px+ magnification. (2) **not proven better off-axis** — windfoil's exact
derivation assumes an axis-aligned box, but its `fwidth` collapses to an AABB that **loses
the oriented pixel parallelogram** (ALGORITHM.md flags rotated/sheared as a limitation), so
it can trade shimmer for orientation-dependent over-filter/blur — NOT crispness-preserving.
**True off-axis superiority needs a parallelogram-footprint integral / oriented filter,
which NEITHER Slug nor windfoil has.** Windfoil also isn't a node swap (needs CPU xy-
monotone subdivision, a one-axis band atlas, duplicated pieces, different row metadata).
Future opt-in only for highly-magnified vector art / hairline technical graphics / known
axis-aligned shapes, as a build-time `coverageStrategy` variant + separate atlas/draw
bucket — never both algorithms behind a runtime `select`.

## CJK scaling

Per-fragment curve iterations ≈ `C·(2/B + fx + fy)` (C=curves/glyph, B=bands/axis=16). Latin
C≈40 → ~11; localized CJK C≈160 → ~30; dense long-stroke → 40–50+. So a dense Han glyph is
~2.5–5× a Latin glyph per covered fragment. Data: 100–200-curve CJK glyph ≈ 4–10 KB;
thousands of Han → tens of MB (Latin reuses a small repertoire). Not a killer for a few
labels (screen coverage + batching dominate); serious for many large dense CJK or a broad
atlas. Mitigations in order: (1) adaptive 32/64-band CJK glyphs (win #6), (2) the early
hull-bound layout (win #2), (3) on-demand exact glyph paging/subsetting, (4) separate
Latin/CJK atlas pages, (5) compact integer header/reference textures (verify WebGL2+WebGPU
parity first), (6) cache glyph pages by font+variation. Do NOT use windfoil for normal
8–64px CJK (structurally slower); the banded-ink guard is APPROXIMATE, not zero-regression.

## Attractive ideas to REJECT (look like wins, regress quality)

- Banded-ink minification guard as "free": approximate; punctuation stays on it to 15–30px.
- One ray instead of dual-ray: loses corner/tip reliability.
- Higher weightBoost/thicken/stemDarken "for speed": appearance change, not optimization.
- Smaller dilation/AA skirt: clips boundary pixels + off-axis fringes.
- Curve precision below RGBA16F: resolution ceiling + grazing/large-zoom errors.
- Removing the q-form or grazing guard: known fringe/needle regression.
- Branchless panel-corner or root-fallback selection: restores the eager-work problem.
- Treating averaged winding as exact final coverage for all self-intersections: documented
  high-winding limitation.

## TSL guardrails (from the skill, reinforced by Codex)

Build-time JS for structural material variants (not runtime `select`); runtime `If` only
when a branch skips substantial work; keep every `fwidth` top-level and unconditional.
