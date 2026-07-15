# Glyph packing & paging design (CJK + large icon sets)

Written before the Simplified-Chinese second pass, because a change in the overnight perf run
(`d58148ea`, R32Float band shrink) introduced a hard **atlas size cap** that a full CJK font — or
a big icon set — will hit. This describes the cap and the paging design that removes it, for BOTH
fonts and icon (`SlugShapeSet`) bakes.

## The size cap I introduced

`d58148ea` shrank the band texture RG32F→R32F by packing two ints into one 24-bit-exact float32:

- `packRefCoord(x, y) = y·4096 + x`, guarded `y < 4096`. → the **curve texture is capped at 4096
  rows × 4096 wide = 16.7M texels** (~8–16M curves with endpoint sharing).
- `packHeader(count, offset) = count·16384 + offset`, guarded `offset < 16383` → per-glyph band
  list capped at 16383 texels (fine for any single glyph).

**Before R32F** the ref was two separate float32s, so `texelY` was limited only by the GPU max
texture dimension (16384) — a 16384×4096 curve texture (~67M texels). **My pack cut the max curve
texture height 16384 → 4096 (≈4×).** That bought the ~5% band-read bandwidth win; the cost is that
the *single-atlas* ceiling dropped.

**What still fits:** Latin + a moderate CJK subset (a 20k-glyph CJK font ≈ 4.5M texels ≈ 1100
rows). **What doesn't:** a full CJK repertoire (~70k unified ideographs × ~150 curves ≈ 15M texels
≈ 3700 rows) is right against the 4096-row ceiling, and CJK **plus** a large icon library exceeds
it. Dense scripts and big icon sets need paging.

## Why paging, not a bigger texture

- Relaxing the pack back to RG32F restores the height headroom but forfeits the bandwidth win and
  *still* hits the GPU max (16384) + memory for full CJK. A 16384²  RGBA16F curve texture is ~2 GB.
- So the scalable answer is **pages**: split the repertoire across N independent
  (curveTexture + bandTexture) pairs, each self-contained under the R32F caps. `packRefCoord` /
  `packHeader` are computed **per page**, so they never overflow — a page is just a small atlas.

## Design

### Bake side
- The baker assigns glyphs to pages greedily: fill a page's curve texture up to a budget (e.g.
  2048 rows, comfortably under the 4096 cap) then open a new page. Each page packs its own curve +
  band textures with the existing R32F/dedup/tight-bounds code, unchanged.
- Baked format gains `pages: [{ curveTexture, bandTexture }]` + a `codepoint → { page, pageLocalLoc }`
  map (glyph loc becomes page-relative). `FL_slug_font` version bump.
- **Icons page identically** (explicit requirement): `SlugShapeSet` runs the SAME `packTextures`,
  so it inherits the same caps and the same page structure. `uikit-bake icons` splits a large atlas
  into pages; `FL_slug_shapes` gains the same `pages` array + a `shapeName → { page, loc }` map.
  Because `SlugShapeSet.fromBaked`/`registerShape` already re-pack on load, paging is transparent
  to consumers once the shape→page map exists. (Bit-exact shape contract is preserved: fround still
  runs per shape; a page boundary never changes a curve.)

### Runtime side
- Each glyph instance carries a **page index** — a new per-instance lane, or fold into a spare
  channel of an existing `glyph*` vec4. Same-page glyphs share curve/band textures.
- Two ways to draw multiple pages:
  - **(A) one draw per page** — batch instances by page; each page's `InstancedMesh` binds that
    page's textures. No new GPU features; +1 draw per page. Pages are few (full CJK ≈ 8–20 pages at
    2048 rows; icons ≈ 1–3), so the draw cost is trivial. **Reuses the batch-by-key machinery we
    just built for the panel clip variant (`e2d12fc0`)** — page index becomes a batch key.
  - **(B) `sampler2DArray` pages** — curve/band textures become array layers; the instance's page
    index selects the layer in the shader. One draw for all pages, but needs TSL array-texture
    plumbing + a uniform layer count + per-page row alignment.
- **Recommendation: (A).** Few pages ⇒ few extra draws; it slots into existing batching. Reserve
  (B) only if one frame mixes hundreds of pages (not a real case).

### On-demand / subsetting (CJK memory)
A full CJK atlas is tens of MB. Most apps should **subset by the codepoints actually used** (the
CLI already subsets by Unicode range) and page only those. Lazy page load (fetch a page on first
use of a codepoint it holds) is the follow-up for dynamic text. The Chinese benchmark pass bakes a
page set for exactly the glyphs it renders — NOT the full repertoire.

## What does NOT change
- Per-fragment shader cost — paging only routes a fragment to its page's textures; the coverage
  walk is identical. The R32F bandwidth win, band dedup, and tight bounds all carry per page.

## Sequence to unblock the Chinese second pass
1. `pages[]` + page-relative glyph loc in the baked font & shape formats (version bump) + greedy
   page assignment in the baker.
2. Per-instance page index + batch-by-page (option A) in `SlugText`/`SlugBatch`/`SlugShapeSet`.
3. Loader resolves codepoint / shape → page; the material binds that page's curve+band textures.
4. THEN: the benchmark language toggle's Chinese pass bakes/loads a Simplified-Chinese page set and
   renders it. (Font source: `packages/skia/third_party/skia/resources/fonts/NotoSansCJK-VF-subset.otf.ttc`
   or a system PingFang/Hiragino/STHeiti, subset to the benchmark's codepoints.)
