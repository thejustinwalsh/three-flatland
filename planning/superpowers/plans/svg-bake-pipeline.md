# SVG Bake Pipeline — Completion Plan

> Horde execution plan. Evidence brief: `planning/superpowers/specs/svg-bake-pipeline-evidence.md`.
> Every claim below was verified against source on 2026-07-11 in the `uikit-fork` worktree.

## 0. Executive framing

**This is a completion, not a greenfield build.** The offline bake, the GLB format, the
round-trip guard, and the CLI **already exist and are tested**. What is missing is the
**consumption seam**: uikit mints a fresh `SlugShapeSet` per distinct SVG source
(`packages/uikit/src/components/svg.ts:146`), so `ShapeGroupManager` — which batches
correctly and keys by set identity first (`packages/uikit/src/svg/render/instanced-shape-group.ts:96-129`)
— never sees two icons in one set. That single line is why uikit-bento draws 26
`InstancedShapeMesh` for 26 icons.

**Honest framing of the win** (per the evidence brief): GPU is fill-bound at retina
(~2–4 ms steady-state); this is a draw-count / CPU-overhead / scalability and
architecture-parity win, **not** a frame-time win. Do not oversell GPU ms anywhere
(commits, docs, examples).

## 1. Verified inventory — EXISTS vs MISSING

### EXISTS (implemented + tested — do not rebuild)

| Piece | Where | Proof |
| --- | --- | --- |
| `FL_slug_shapes` GLB format (versioned, SoA columns, CSR offsets) | `packages/slug/src/format.ts:57-95` (`SLUG_SHAPES_EXTENSION_NAME`, `SLUG_SHAPES_VERSION=1`, `SLUG_SHAPE_COLUMNS`) | shared read/write contract, same pattern as `FL_slug_font` |
| Offline pack: `packShapeSet(set, meta)` | `packages/slug/src/bake.ts:454-544` | geometry-complete (curves + contourStarts + prebuilt bands), sorted ascending by id, free-form `meta` JSON |
| Runtime load: `SlugShapeSet.fromBaked(buffer)` | `packages/slug/src/SlugShapeSet.ts:154-244` | zero-dep `readGlb`, version gate, **stays growable after load** (`_nextId` continues), `meta` round-trips |
| Bit-exact round-trip guard | `packages/slug/src/shapesBake.test.ts` (4 tests) | curves/contours/bands/bounds deep-equal (float32 snap at `SlugShapeSet.ts:60-68` makes it BIT-exact), GPU textures bit-identical, meta round-trip, growth-after-load, version refusal |
| Bake CLI: `uikit-bake icons <svg...\|dir> -o out.glb` | `packages/uikit/src/cli.ts:189-253` | parses via `@three-flatland/slug/svg`, one shared set, `meta.icons = { name: { handles, fills } }`; happy-dom `DOMParser` shim (`cli.ts:79-103`); also reachable as `flatland-bake uikit icons` |
| Runtime SVG parse | `packages/slug/src/svg/parseSVG.ts`, `loadSVG.ts` | `loadSVGShapes(source, set?)` accepts markup or URL, **already accepts an accumulator set** (`loadSVG.ts:35-44`); cubics via `cubicToQuadraticsAdaptive` (one converter, `pipeline/fontParser.ts`) |
| Batching infra | `packages/uikit/src/svg/render/instanced-shape-group.ts:96-129` | groups keyed `SlugShapeSet` → `[majorIndex,minorIndex,depthTest,depthWrite,renderOrder]`; `SlugShapeBatch` re-binds textures by `set.version` when a shared set grows (`SlugShapeBatch.ts:110-112`) |
| Baked fixture precedent + pixel-identity harness | `examples/three/uikit/s4-bake-fixture.mts`, `s4.ts` | proves bake → load → render identity live |
| Loader-with-backends pattern to mirror | `packages/slug/src/SlugFontLoader.ts` | baked-first `_tryLoadBaked` + runtime fallback + static URL cache + corrupt-file degrade (`SlugFontLoader.ts:117-129, 222-227`) |

### MISSING (this plan's scope)

1. **Shared set at the consumption seam** — `packages/uikit/src/components/svg.ts:146`
   `loadSVGShapes(key)` omits the set argument ⇒ per-source sets ⇒ 26 draws. *(U1 — ships the draw-call win alone.)*
2. **`SlugShapeSetLoader`** — no `three.Loader<SlugShapeSet>` (URL fetch, static cache,
   R3F `useLoader` compat) analogous to `SlugFontLoader`. `SlugShapeSet.meta` is an
   untyped `Record`. *(U2)*
3. **Per-icon `viewBox` in bake meta** — `meta.icons[name]` stores `handles` + `fills`
   but not `viewBox`; `Svg` needs it for `boundingBox` (`components/svg.ts:90-101`), so a
   baked icon cannot be reconstructed into a `RegisteredSVG` today. Plus: CLI file order
   is `readdirSync` order — not explicitly deterministic. *(U3)*
4. **Name → `RegisteredSVG` resolution** from a baked set (`iconFromBaked`). *(U2)*
5. **SVG-level baked↔runtime equivalence guard** over real lucide files through the
   actual CLI path (like `baked.equivalence.test.ts` for fonts). *(U4)*
6. **uikit atlas injection + `icon` name lookup on `Svg`**; lucide generated components
   carry only `content` markup, no stable name. *(U5, U6)*
7. **Examples pair** demonstrating the baked-icon-atlas path. *(U7)*
8. **Live draw-call proof** on uikit-bento. *(U8)*

## 2. Architectural decisions (orchestrator ruling — implementers do not relitigate)

- **D1 — One shared set is both backends' destination.** uikit keeps a module-level
  shared `SlugShapeSet` (new `packages/uikit/src/svg/shape-set.ts`). Runtime-parsed SVGs
  append to it; `installIconAtlas(set)` *replaces* it with a baked set (which stays
  growable — `fromBaked` guarantees this), so runtime one-offs registered after install
  join the atlas set and still batch with baked icons. One set ⇒ one draw per order band,
  mixed baked + runtime.
- **D2 — The "loader with backends" seam lives at two levels, honestly.**
  slug ships the mechanisms: `SlugShapeSetLoader` (baked backend: `.glb` → set, no parse)
  and the existing `loadSVGShapes` (runtime backend). uikit's `loadSvg`
  (`components/svg.ts:133-149`) is the single API that dispatches: baked atlas lookup by
  icon name first, runtime parse into the shared set as fallback. There is **no
  `forceRuntime` sidecar probe** like fonts — an atlas `.glb` has no single "source file"
  to fall back to; fallback is per-icon, at the uikit seam. Document this asymmetry in
  the loader TSDoc.
- **D3 — Icon identity is a `name`, carried in meta and on the component as `icon`.**
  `meta.icons[name] = { handles, fills, viewBox }` (name = filename sans extension, the
  CLI's existing convention). The `Svg` schema gains `icon?: string` — NOT `name`
  (uikit components are `Object3D`s; `name` collides). Generated lucide components embed
  `icon: '<kebab-name>'` alongside the existing `content` fallback.
- **D4 — Additive meta, no format version bump.** Adding `viewBox` to `meta.icons[*]`
  is free-form-meta territory (`packShapeSet` carries `meta` verbatim);
  `SLUG_SHAPES_VERSION` stays 1. `iconFromBaked` throws a clear "re-bake with a newer
  uikit-bake" error on atlases whose icon entries lack `viewBox` (only repo-internal
  fixtures predate this).
- **D5 — slug owns shape code; uikit consumes slug's public API.** `SlugShapeSetLoader`
  and `iconFromBaked` live in slug and are exported from slug's root barrel (auto-flows
  to `@three-flatland/slug/react` via `export * from './index.js'`). uikit imports only
  from `@three-flatland/slug` / `@three-flatland/slug/bake` (CLI). No deep imports.
- **D6 — Deterministic bake ordering.** The CLI sorts collected SVG paths by basename
  (then full path) before registering, so shape ids are stable across re-bakes of the
  same input set. Note in `--help` text.
- **D7 — No changes to the `three-flatland` core package.** It does not depend on slug
  (verified: no slug/uikit refs in `packages/three-flatland/package.json`). The `/react`
  subpath convention is satisfied per-package (`@three-flatland/slug/react`,
  `@three-flatland/uikit/react`, `@three-flatland/uikit-lucide/react`).
- **D8 — lucide does NOT ship a monolithic 1500-icon atlas.** Apps bake the subset they
  use via `uikit-bake icons` (the CLI already takes files/dirs). uikit-lucide's job is
  only to embed the `icon` name so components resolve against whatever atlas the app
  installed.

## 3. Draw-call quantification (the target number, derived)

Measured baseline (evidence brief, live retina uikit-bento): `drawCalls: 32`,
26 = `InstancedShapeMesh` (one per icon), 65 panels → 1 draw, 831 glyphs → 2 draws.

Glyph groups key **identically** to shape groups
(`text/render/instanced-glyph-group.ts:109-121` vs `instanced-shape-group.ts:96-129`):
per font/set, then `[majorIndex, minorIndex, depthTest, depthWrite, renderOrder]`. Text
across the entire bento UI collapses to **one band per font** (831 glyphs → 2 draws over
2 fonts). Icons are `Content` elements with the same order-info plumbing, so with ONE
shared set the realistic outcome is **26 → 1** `InstancedShapeMesh` (an extra band or
two is possible if any icon sits under a different `zIndex`/depth config).

**Gates:** `InstancedShapeMesh` count in scene: 26 → **1** expected, **≤ 3** required.
Total `drawCalls`: 32 → **≤ 9** required (~7 expected: 1 panels + 2 glyphs + 1 shapes +
remaining non-uikit scene meshes).

## 4. Test/typecheck baseline (all gates are deltas from this)

```bash
pnpm vitest --run packages/slug packages/uikit   # 39 files / 458 tests pass (measured 2026-07-11)
pnpm --filter @three-flatland/slug typecheck     # clean
pnpm --filter @three-flatland/uikit typecheck    # clean
```

Root `pnpm test` runs `vitest --typecheck --run` repo-wide — final gate before PR.

## 5. Hard constraints — REPEAT IN EVERY HORDE BRIEF

- WebGPU + WebGL2 via **TSL only** — no GLSL, no `onBeforeCompile`. (No shader work is
  expected in ANY unit; if you think you need it, stop and escalate.)
- `RenderTarget`, never `WebGLRenderTarget`. (No render targets exist in this pipeline —
  keep it that way; it's data textures only.)
- **One cubic→quadratic converter**: `cubicToQuadratics`/`cubicToQuadraticsAdaptive` in
  `packages/slug/src/pipeline/fontParser.ts`. Never add a second.
- Clean package boundaries: slug owns shape code; uikit consumes
  `@three-flatland/slug`'s public exports only. No cross-package `src/` deep imports.
- Examples exist in **pairs** (three + react) or not at all.
- TSDoc terse: WHAT first, WHY only if non-obvious, never restate signatures.
- Code style: no semicolons, single quotes, `type`-only imports, `_`-prefix unused.
- Conventional Commits; NO AI-attribution trailers, no `Co-Authored-By: Claude`; do not
  hand-write changesets; commit only when asked.
- Do not bump `SLUG_SHAPES_VERSION` (D4). Do not redesign existing tested code (§1).

## 6. Units

Dependency graph:

```
U1 ──────────────────────────────► U8a (checkpoint A: incremental ship)
U2 ──┬──► U4
U3 ──┘      │
U1+U2+U3 ─► U5 ──► U6 ──► U7
                    └──► U8b (checkpoint B: full-pipeline proof)
U9 (docs) — last, parallel with U7/U8b
```

Wave 1 (parallel): **U1, U2, U3** · Wave 2 (parallel): **U4, U5, U10** (U5 waits on all
of wave 1; U10 serializes after U3 on `cli.ts` but is disjoint from U4/U5) · Wave 3:
**U6** · Wave 4 (parallel): **U7, U8b, U9**. **U8a runs the moment U1 lands** — the
draw-call win ships incrementally, before the loader/CLI work completes.

---

### U1 — Shared runtime `SlugShapeSet` in uikit `loadSvg` [SERIALIZED — hot file `components/svg.ts`] — **the incremental ship**

**(a) Context/why.** `packages/uikit/src/components/svg.ts:146` calls
`loadSVGShapes(key)` with no set argument, so every distinct `src`/`content` mints its
own `SlugShapeSet` — this is the entire 26-draw tail. `loadSVGShapes` already takes an
accumulator set (`packages/slug/src/svg/loadSVG.ts:35-44`); the shared-set growth
invariant (`SlugShapeSet.ts:26-31`: appends never move packed shapes; batches re-bind by
`version`) makes a single growing set safe. This unit alone collapses 26 → ~1 with zero
new formats.

**(b) Task.**
- New file `packages/uikit/src/svg/shape-set.ts`:
  - module-level shared set; `getSharedShapeSet(): SlugShapeSet` (lazy-create);
  - `setSharedShapeSet(set: SlugShapeSet): void` — replaces the shared set AND clears
    the svg cache (exported for U5's `installIconAtlas`; components mounted against the
    old set keep rendering from it — document this in TSDoc, standard usage installs at
    startup);
  - move `svgCache` (currently `components/svg.ts:131`) here so the cache and the set it
    populates invalidate together.
- Edit `packages/uikit/src/components/svg.ts:133-149`: `loadSvg` passes
  `getSharedShapeSet()` as the second arg to `loadSVGShapes`; delete the stale comment at
  `svg.ts:68-72` claiming cross-instance batching already happens (it only deduped
  same-source), replace with an accurate one.
- Export `getSharedShapeSet`/`setSharedShapeSet` from `packages/uikit/src/svg/index.ts`
  and the uikit root barrel.

**(c) Method — TDD red-first.** Write
`packages/uikit/src/tests/svg-shared-set.test.ts` FIRST and watch it fail: load two
DIFFERENT inline SVG `content` strings through the exported `loadSvg`/shape-set seam;
assert both `RegisteredSVG.set` references are `===` and `=== getSharedShapeSet()`;
assert same-source dedupe still holds (same content twice ⇒ same promise); assert
`setSharedShapeSet(new SlugShapeSet())` clears the cache (a re-load registers into the
new set). Reuse the happy-dom `DOMParser` shim pattern from
`packages/slug/src/svg/parseSVG.lucide.test.ts` (vitest env is `node`; happy-dom is
already a uikit devDep).

**(d) Gates.**
```bash
pnpm vitest --run packages/uikit/src/tests/svg-shared-set.test.ts   # new tests green (≥ 3 tests)
pnpm vitest --run packages/slug packages/uikit                      # ≥ 461 tests, 0 failures (458 baseline + new)
pnpm --filter @three-flatland/uikit typecheck                       # clean
pnpm --filter @three-flatland/uikit build                           # clean
```
Draw-call gate proven by U8a (26 → ≤ 3 `InstancedShapeMesh` on bento).

**(e) DO NOT.** Do not touch slug (the accumulator API already exists). Do not add a set
parameter to `Svg`'s public constructor in this unit (that's U5). Do not dispose the old
set inside `setSharedShapeSet` (mounted components still render from it). Do not "fix"
`ShapeGroupManager` — it is correct. Plus §5 blanket list.

**(f) Acceptance.** Two different SVG sources share one `SlugShapeSet`; cache/set
lifecycle covered by tests; all gates green; no public-API break (additive exports only).

---

### U2 — `SlugShapeSetLoader` + typed icon meta + `iconFromBaked` (slug) [PARALLEL — new files; one small serialized touch on `slug/src/index.ts` + `svg/index.ts`]

**(a) Context/why.** Mirrors `SlugFontLoader` (`packages/slug/src/SlugFontLoader.ts:47-113`):
a `three.Loader` subclass so vanilla users get `loadAsync`/static cached `load` and R3F
users get `useLoader(SlugShapeSetLoader, url)` for free. `SlugShapeSet.fromBaked` is the
whole decode; the loader adds fetch, HTTP error text (mirror the 404 guard at
`SlugFontLoader.ts:258-265`), caching, and the typed name→icon resolution the baked meta
currently lacks.

**(b) Task.**
- New `packages/slug/src/svg/bakedIcons.ts`:
  - `interface BakedIconEntry { handles: number[]; fills: ParsedSVGFill[]; viewBox: SVGViewBox }`
  - `interface BakedIconsMeta { icons: Record<string, BakedIconEntry> }` (the shape
    `uikit-bake icons` writes after U3);
  - `iconNamesFromBaked(set: SlugShapeSet): string[]`;
  - `iconFromBaked(set: SlugShapeSet, name: string): RegisteredSVG | undefined` —
    resolves `meta.icons[name]`, maps handle ids through `set.getShape(id)` (throw on a
    dangling id: corrupt atlas), returns the exact `RegisteredSVG` record shape
    (`packages/slug/src/svg/loadSVG.ts:7-15`) uikit already consumes; throws the D4
    "re-bake" error when an entry lacks `viewBox`.
- New `packages/slug/src/SlugShapeSetLoader.ts`: `class SlugShapeSetLoader extends Loader<SlugShapeSet>`
  — instance `load` (callback, R3F-compat, resolve via `this.manager.resolveURL`) +
  `loadAsync`; static `load(url)` with `Map<string, Promise<SlugShapeSet>>` cache +
  `clearCache()`; fetch → `arrayBuffer` → `SlugShapeSet.fromBaked`. Unlike
  `SlugFontLoader` there is NO runtime fallback here (D2) — a bad/missing `.glb` is a
  hard, descriptive error; say so in TSDoc.
- Exports: `SlugShapeSetLoader` from `packages/slug/src/index.ts` (Vector-shapes
  section, `index.ts:22-43`); `iconFromBaked`, `iconNamesFromBaked` + types from
  `packages/slug/src/svg/index.ts` and re-exported by the root barrel. `/react` flows
  automatically via `packages/slug/src/react.ts`'s `export * from './index.js'`.

**(c) Method — TDD red-first.** `packages/slug/src/SlugShapeSetLoader.test.ts` +
`packages/slug/src/svg/bakedIcons.test.ts` first: build a set with
`shapesBake.test.ts`-style fixtures, `packShapeSet(set, { icons: {...} })`, feed
`fromBaked` output to `iconFromBaked`; assert handle identity (`set.getShape` objects),
fills/viewBox parity, undefined for unknown names, throw on dangling handle id and on
missing `viewBox`. Loader test: stub `fetch` (vitest `vi.stubGlobal`) returning the GLB
bytes; assert cache hit (same promise), `clearCache`, HTTP-status error message, and
`loadAsync` parity with static `load`.

**(d) Gates.**
```bash
pnpm vitest --run packages/slug/src/SlugShapeSetLoader.test.ts packages/slug/src/svg/bakedIcons.test.ts  # ≥ 8 new tests green
pnpm vitest --run packages/slug packages/uikit    # ≥ 466 cumulative, 0 failures
pnpm --filter @three-flatland/slug typecheck && pnpm --filter @three-flatland/slug build
```

**(e) DO NOT.** Do not import `@gltf-transform/core` or anything from `./bake.js` in
loader/bakedIcons (browser graph must stay zero-dep — the bake module doc at
`bake.ts:1-8` is law). Do not add a `forceRuntime` flag (D2). Do not re-implement GLB
parsing (`glb.ts` + `fromBaked` exist). Do not parse SVG here. Plus §5.

**(f) Acceptance.** `useLoader(SlugShapeSetLoader, '/icons.shapes.glb')` type-checks in
an R3F context; `iconFromBaked` returns a `RegisteredSVG` indistinguishable (type and
content) from the runtime path's; all gates green.

---

### U3 — CLI meta v2: `viewBox` + deterministic ordering (uikit-bake icons) [PARALLEL with U1/U2 — hot file `uikit/src/cli.ts`]

**(a) Context/why.** `runIcons` (`packages/uikit/src/cli.ts:189-253`) writes
`meta.icons[name] = { handles, fills }` — no `viewBox`, so a baked icon can't drive
`Svg`'s boundingBox math (`components/svg.ts:90-101`). And `collectSvgFiles`
(`cli.ts:171-187`) inherits `readdirSync` order — ids must be stable across re-bakes (D6).

**(b) Task.** In `packages/uikit/src/cli.ts`:
- `runIcons`: capture `registered.viewBox` into each meta entry
  (`{ handles, fills, viewBox: { minX, minY, width, height } }`) — matching U2's
  `BakedIconEntry` (import the type from `@three-flatland/slug` once U2 lands, or define
  structurally and let U4 assert compatibility; coordinate with U2 via the shared type
  name in slug — final state imports the slug type).
- `collectSvgFiles`: sort the final list by `basename` then full path; duplicate icon
  names (two dirs, same filename) are a hard error naming both paths.
- Update `ICONS_USAGE` (`cli.ts:121-138`): document determinism + viewBox meta.

**(c) Method — TDD red-first.** New `packages/uikit/src/tests/cli-icons.test.ts` first:
write 2–3 tiny SVG fixtures into a `tmpdir` (plus one real lucide file read from
`packages/uikit-lucide/icons/activity.svg` for realism), invoke the exported baker
(`import baker from '../cli.js'`; `baker.run(['icons', dir, '-o', out])`), then
`SlugShapeSet.fromBaked(readFileSync(out))` and assert: `meta.icons` has per-name
`handles`/`fills`/`viewBox`; ids assigned in basename-sorted order; duplicate-name error
path. (happy-dom is a uikit devDep; the CLI installs its own shim — no test shim needed.)

**(d) Gates.**
```bash
pnpm vitest --run packages/uikit/src/tests/cli-icons.test.ts   # ≥ 4 new tests green
pnpm vitest --run packages/slug packages/uikit                 # cumulative, 0 failures
pnpm --filter @three-flatland/uikit typecheck && pnpm --filter @three-flatland/uikit build
node packages/uikit/dist/cli.js icons packages/uikit-lucide/icons/activity.svg -o /tmp/one-icon.glb  # exits 0, file parses via fromBaked
```

**(e) DO NOT.** Do not bump `SLUG_SHAPES_VERSION` (D4 — meta is free-form). Do not
change `packShapeSet`/`format.ts`/`fromBaked` (they are done and guarded). Do not make
happy-dom a hard dep (keep the lazy optional-peer import at `cli.ts:79-103`). Do not
recurse directories silently (keep non-recursive; it's documented behavior). Plus §5.

**(f) Acceptance.** A bake of the same input dir twice yields byte-identical meta
(ordering stable); baked meta is sufficient to reconstruct `RegisteredSVG` (proved by U4).

---

### U4 — SVG baked↔runtime equivalence guard [PARALLEL — new test file only] (deps: U2, U3)

**(a) Context/why.** The font pipeline's contract is guarded by
`packages/slug/src/baked.equivalence.test.ts` and documented in `packages/slug/CLAUDE.md`
("Gotchas"). Shapes need the same guard, over the REAL end-to-end paths: runtime
(`loadSVGShapes` per icon into a fresh shared set) vs baked (same SVGs through the
CLI-equivalent pack → `fromBaked` → `iconFromBaked`). Unlike fonts (approximately
equivalent — notdef fallback, outline inference), **shapes are BIT-equivalent by
construction** (float32 snap at registration, geometry-complete format). Assert the
stronger contract.

**(b) Task.** New `packages/slug/src/svg/svgBaked.equivalence.test.ts`. Fixtures: ≥ 5
real lucide files read from `packages/uikit-lucide/icons/` (e.g. `activity.svg`,
`circle.svg`, `menu.svg`, `x.svg`, `settings.svg` — pick files that exist; they are repo
sources, fine for tests, mirroring `parseSVG.lucide.test.ts`'s approach and its happy-dom
shim). Pipeline A (runtime): one shared `SlugShapeSet`, `loadSVGShapes(markup, set)` per
file in basename-sorted order. Pipeline B (baked): `packShapeSet(setA, { icons })` with
U3-shaped meta → `SlugShapeSet.fromBaked` → `iconFromBaked(setB, name)` per icon.
Assert per icon: curves/contourStarts/bands/bounds **deep-equal (bit-exact)**;
fills + viewBox equal; curve/band textures of the two sets **bit-identical**
(`Array.from(...data)` equality, as `shapesBake.test.ts:56-72` does); post-load growth:
register one more shape into setB, assert prior texel locations unchanged.

**(c) Method.** TDD trivially red-first (file doesn't exist). Write assertions before
any needed helper.

**(d) Gates.**
```bash
pnpm vitest --run packages/slug/src/svg/svgBaked.equivalence.test.ts   # ≥ 5 new tests green
pnpm vitest --run packages/slug packages/uikit                         # cumulative, 0 failures
pnpm --filter @three-flatland/slug typecheck
```

**(e) DO NOT.** Do not weaken to `closeTo` — the round-trip is bit-exact by
construction (`SlugShapeSet.ts:60-68`); a `closeTo` pass hides a real regression. Do not
import uikit's CLI from a slug test (package boundary) — replicate the 3-line
pack-with-meta step instead, and leave CLI behavior itself to U3's test. Do not add SVG
fixture copies when reading lucide sources suffices. Plus §5.

**(f) Acceptance.** The bit-parity contract is executable and documented (one-line
pointer added to the U9 docs unit). Any future format or parser drift fails loudly here.

---

### U5 — Atlas installation + `icon` resolution in uikit `Svg` [SERIALIZED — hot files `components/svg.ts`, `svg/shape-set.ts`] (deps: U1, U2, U3)

**(a) Context/why.** With U1 the draw-call win exists but every icon still parses SVG at
runtime. This unit wires the baked backend into the one consumer API (D2): install an
atlas once, `Svg` resolves icons by name with **zero parsing**, unknown icons fall back
to runtime parse *into the same set* (D1) so they still batch.

**(b) Task.**
- `packages/uikit/src/svg/shape-set.ts`: add
  `installIconAtlas(atlas: SlugShapeSet | string): Promise<void>` — string ⇒
  `SlugShapeSetLoader.load(url)`; then `setSharedShapeSet(loadedSet)`. Also
  `getInstalledAtlasNames(): string[]` (delegates `iconNamesFromBaked`).
- `packages/uikit/src/components/svg.ts`:
  - schema: `svgOutPropertiesSchema`/`SvgOutProperties` gain `icon: string().optional()`
    (`svg.ts:20-35`); NOT `name` (D3 — `Object3D.name` collision).
  - `loadSvg` (`svg.ts:133-149`) resolution order: (1) `icon` set AND shared set has
    `meta.icons[icon]` ⇒ `iconFromBaked(sharedSet, icon)` (cache key `icon:${icon}`);
    (2) existing `src`/`content` runtime path into the shared set (U1); (3) `icon` set
    but not in atlas and no `content`/`src` ⇒ descriptive error listing
    `getInstalledAtlasNames()` availability.
- Export `installIconAtlas`, `getInstalledAtlasNames` from uikit root barrel and confirm
  they flow through `@three-flatland/uikit/react` (uikit react entry re-exports core —
  verify and add if the react barrel is curated).

**(c) Method — TDD red-first.** Extend/new
`packages/uikit/src/tests/svg-icon-atlas.test.ts`: build a small atlas in-test
(`packShapeSet` with U3-shaped meta), `installIconAtlas(set)`; assert `loadSvg({icon})`
returns a `RegisteredSVG` whose `set === getSharedShapeSet()` with **no** `DOMParser`
call (spy: leave the DOMParser global unset — the baked path must not need it; the
runtime-fallback assertion then installs the shim); assert fallback path registers into
the SAME set; assert the unknown-icon error message.

**(d) Gates.**
```bash
pnpm vitest --run packages/uikit/src/tests/svg-icon-atlas.test.ts  # ≥ 5 new tests green
pnpm vitest --run packages/slug packages/uikit                     # cumulative, 0 failures
pnpm --filter @three-flatland/uikit typecheck && pnpm --filter @three-flatland/uikit build
```

**(e) DO NOT.** Do not name the prop `name` (D3). Do not fetch inside `Svg` — atlas
loading happens once via `installIconAtlas`. Do not make `icon` required or break the
existing `src`/`content` contract (upstream-uikit API compatibility is a repo constraint).
Do not dispose replaced sets (U1 rule). Plus §5.

**(f) Acceptance.** `installIconAtlas('/icons.shapes.glb'); new Svg({ icon: 'activity' })`
renders with zero SVG parsing; unknown icons degrade to runtime parse in the same set;
all gates green.

---

### U6 — lucide components carry `icon` names [SERIALIZED — `uikit-lucide/scripts/generate.ts` + full regenerate] (deps: U5)

**(a) Context/why.** Generated components (`packages/uikit-lucide/src/*.ts`, e.g.
`Activity.ts`) embed only `content` markup. Embedding the kebab filename as `icon` makes
every existing lucide component atlas-aware with zero consumer changes: atlas installed ⇒
baked handles; not installed ⇒ `content` runtime path (unchanged behavior).

**(b) Task.** `packages/uikit-lucide/scripts/generate.ts`: add
`icon: '<file-basename-sans-.svg>'` to `defaultOverrides` (alongside `content`,
`width: 24`, `height: 24`). Regenerate: `pnpm --filter @three-flatland/uikit-lucide run convert`
(if icons dir needs refresh — skip if present) then `run generate`. The `src/` churn is
generated code (eslint-disabled header) — do not hand-edit any of it.

**(c) Method — TDD red-first.** Small test
`packages/uikit-lucide/scripts/generate.test.ts` is overkill for a template change;
instead the red gate is a grep-based assertion added to U5's atlas test? No — keep it
here and simple: write the gate FIRST as a failing shell check, then change the template.

**(d) Gates.**
```bash
grep -q "icon: 'activity'" packages/uikit-lucide/src/Activity.ts        # green after regenerate
grep -rL "icon: '" packages/uikit-lucide/src --include='*.ts' | grep -v index.ts | wc -l  # 0 (every icon file carries a name)
pnpm --filter @three-flatland/uikit-lucide typecheck && pnpm --filter @three-flatland/uikit-lucide build
pnpm vitest --run packages/slug packages/uikit                          # unchanged, 0 failures
```

**(e) DO NOT.** Do not hand-edit generated `src/*.ts` (template only, then regenerate).
Do not change the upstream-compatible constructor signature (ported-package exemption in
CLAUDE.md Constraints). Do not rename exports or touch `generate-react.ts` unless the
react wrappers fail typecheck (they pass props through — expected no-op). Plus §5.

**(f) Acceptance.** Every generated component carries its kebab name; behavior without
an atlas is byte-for-byte unchanged (content fallback); build + typecheck green.

---

### U7 — Examples pair: `uikit-icons` (three + react) [PARALLEL — new dirs] (deps: U2, U5, U6)

**(a) Context/why.** CLAUDE.md law: examples exist in pairs. This pair demonstrates the
full baked path end-to-end: bake a lucide subset → `.shapes.glb` → `installIconAtlas` →
icon grid → devtools stats showing the single `InstancedShapeMesh` draw. Precedent to
copy: `examples/three/uikit` + `examples/react/uikit` (setup, gem styling,
`GemBackground`), `examples/three/uikit/s4-bake-fixture.mts` (bake-script shape),
`examples/react/uikit-bento` (lucide usage). Use the `/example` skill's scaffolding
conventions and `examples/react/CLAUDE.md`.

**(b) Task.**
- `examples/three/uikit-icons/` and `examples/react/uikit-icons/`, each with:
  - `bake-icons.mts` (mirrors `s4-bake-fixture.mts`): bakes ~24 lucide SVGs from
    `packages/uikit-lucide/icons/` into `public/icons.shapes.glb` via the CLI module or
    `loadSVGShapes` + `packShapeSet` (prefer invoking the built `uikit-bake icons` to
    dogfood the CLI: `node ../../../packages/uikit/dist/cli.js icons <files> -o public/icons.shapes.glb`);
    commit the generated `.glb` (it's a few KB) so `pnpm dev` works without a build step.
  - three variant: `installIconAtlas('/icons.shapes.glb')` then a `Fullscreen`/root UI
    grid of `Svg({ icon })` + a couple of lucide components; devtools stats visible.
  - react variant: same grid via `@three-flatland/uikit-lucide/react` components inside
    `@react-three/fiber/webgpu` Canvas; `useLoader(SlugShapeSetLoader, ...)` or a
    suspense-wrapped `installIconAtlas` — show the R3F-idiomatic path.
  - README per repo example conventions; register both in the examples MPA the same way
    sibling examples are (copy `vite.config.ts`/`package.json` from the `uikit` pair;
    then `pnpm sync:pack examples`).
- On-screen copy states the honest framing: "26 draws → 1" as draw-count/CPU/scalability,
  not GPU-ms.

**(c) Method.** Examples have no unit tests; the red-first discipline here is: write the
README's "what you should see" (1 `InstancedShapeMesh`, N icons) BEFORE the code, then
make the running example match it via vitexec inspection.

**(d) Gates.**
```bash
pnpm sync:pack examples minis            # exits 0
pnpm --filter example-three-uikit-icons dev   # boots; page renders icon grid (vitexec: scene contains exactly 1 InstancedShapeMesh)
pnpm --filter example-react-uikit-icons dev   # same assertions
pnpm --filter example-three-uikit-icons typecheck && pnpm --filter example-react-uikit-icons typecheck  # if sibling examples define typecheck; else root tsc via example tsconfig
```
(vitexec: `[...scene.children flatten].filter(o => o.constructor.name === 'InstancedShapeMesh').length === 1` and `renderer.info.render.drawCalls` logged. Exact package names must match sibling conventions — check `examples/three/uikit/package.json` name field first.)

**(e) DO NOT.** Do not create only one of the pair. Do not import from any package's
`src/` (use built workspace deps; note the worktree dev-server memory: build
slug/uikit/uikit-lucide dists first, clear `.vite`). Do not use `@react-three/fiber`
(must be `/webgpu`). Do not use Web Awesome; devtools/Tweakpane only. Do not fetch icons
from the network. Plus §5.

**(f) Acceptance.** Both examples boot under `pnpm dev`, render the same icon grid, and
demonstrably draw all icons through one `InstancedShapeMesh`; baked `.glb` committed;
READMEs state the honest perf framing.

---

### U8 — Draw-call proof on uikit-bento [VERIFICATION UNIT — orchestrator or dedicated agent; no source changes]

**(a) Context/why.** The motivating measurement must be re-taken, same methodology, to
prove the drop. Two checkpoints: **U8a** right after U1 (runtime shared set alone) and
**U8b** after U6 (baked atlas active in bento is optional — U8b may run with the runtime
shared set; if bento is also switched to `installIconAtlas`, that edit is part of U8b and
touches only `examples/react/uikit-bento/App.tsx`/`main.tsx`).

**(b) Task.** Run `examples/react/uikit-bento` dev server (memory: check port
squatters; build workspace dists into a fresh worktree first). Via vitexec /
chrome-devtools: after UI settles, capture (1) `renderer.info.render.drawCalls`, (2)
count of `InstancedShapeMesh` instances in the scene graph, (3) triangles (sanity: same
scene). Record before/after in the PR description.

**(c) Method.** Measurement protocol from memory
(`project_perf_measurement_workflow.md`): vsync masks GPU cost — but we are counting
draws, not ms, so a single settled-frame reading suffices; take it at the same viewport
and interaction state as the baseline (fresh load, no hover).

**(d) Gates (named numbers).**
- Baseline (already measured, re-confirm on this worktree before U1 merges):
  `drawCalls: 32`, `InstancedShapeMesh: 26`.
- **U8a (after U1): `InstancedShapeMesh ≤ 3` (expected 1); total `drawCalls ≤ 9`.**
- **U8b (after U5/U6, atlas installed): same numbers AND zero `[slug]`-style runtime
  parse work for atlas-resolved icons (verify via a `parseSVG` breakpoint/counter or
  the absence of `DOMParser` usage on the load path — e.g. instrument via vitexec).**
- Triangles within ±5% of baseline 1859 (same geometry, no visual regression).
- Screenshot before/after attached (render-change norm from memory).

**(e) DO NOT.** Do not change library source to make numbers pass — if a band splits
unexpectedly, diagnose `OrderInfo` (`packages/uikit/src/order.ts:129-161`) and report;
the fix belongs in a scoped follow-up unit, not a measurement hack. Do not measure with
devtools overlays adding their own draws without subtracting them (note overlay cost
explicitly). Plus §5.

**(f) Acceptance.** PR description contains the before/after table with methodology; the
26→1 (≤3) claim in docs/examples is backed by this capture.

---

### U9 — Documentation of the contract [PARALLEL — docs only] (deps: U4 landed)

**(a) Context/why.** `packages/slug/CLAUDE.md` documents the font baked↔runtime
equivalence contract and the backend table; the shapes pipeline now has a stronger
(bit-exact) contract and a loader — future agents must find it.

**(b) Task.** Edit `packages/slug/CLAUDE.md`: extend the Architecture section with the
shapes pipeline (a `SlugShapeSet` backends row: runtime `svg/loadSVG.ts` vs baked
`SlugShapeSet.fromBaked` via `SlugShapeSetLoader`; guard:
`svg/svgBaked.equivalence.test.ts`, **bit-exact**, unlike fonts' approximate contract —
state the difference explicitly next to the existing "Baked and runtime are
approximately equivalent" gotcha so nobody generalizes the font caveats to shapes). Add
one line to the Gotchas: atlas meta `viewBox` requirement + the D6 basename-ordering
guarantee. Keep register terse; update `packages/uikit`-side docs only if a
`CLAUDE.md`/README section already describes `Svg` loading (check first; do not create
new doc files beyond CLAUDE.md edits).

**(c) Method.** N/A (docs). Accuracy check: every file path named must exist.

**(d) Gates.** `pnpm vitest --run packages/slug packages/uikit` unchanged;
`grep -n "svgBaked.equivalence" packages/slug/CLAUDE.md` hits.

**(e) DO NOT.** Do not create new standalone `.md` report files. Do not restate API
signatures (terse-TSDoc register applies to docs too). Plus §5.

**(f) Acceptance.** A future agent reading `slug/CLAUDE.md` finds the shapes backend
table, the bit-exact contract, and the guard test path.

---

### U10 — Bake manifest + "what to bake" guidance (uikit-bake) [SERIALIZED — hot file `uikit/src/cli.ts`, after U3] (deps: U3) — **stakeholder ask**

**(a) Context/why.** Stakeholder wants a **declarative manifest** so a project *tells the
baker* which shapes to bake and how — checked into source for deterministic re-bakes —
instead of remembering a long `uikit-bake icons a.svg b.svg …` invocation. Today
`runIcons` (`cli.ts:189-253`) only takes positional files/dirs. This is the "bake config"
analogue of a tsconfig; it composes with U3's viewBox+ordering.

**(b) Task.** In `packages/uikit/src/cli.ts`:
- Define a manifest schema (typed interface + a hand-written runtime validator — **no new
  dependency**): `interface IconBakeManifest { out: string; sources: Array<string | { path: string; name?: string; fillRule?: 'nonzero' | 'evenodd' }>; meta?: Record<string, unknown> }`.
  `path` is a file or dir (reuse `collectSvgFiles`); `name` overrides the basename-derived
  id; `out` is the `.glb` target; `meta` merges into the set meta.
- `runIcons` gains `--manifest <file.json>`: read + parse + validate, resolve sources
  (deterministic basename ordering per D6, honoring explicit `name`, hard-error on
  duplicate resolved names), bake to `out`. `--manifest` and positional args are mutually
  exclusive (clear error if both).
- Update `ICONS_USAGE` (`cli.ts:121-138`) with the manifest form + a short example, and
  add the **"what to bake" guidance** (stakeholder ask): bake a fixed known icon set (get
  batching + zero runtime parse); runtime-parse dynamic/user SVGs (they still join the
  shared set and batch — D1); one shared set is what enables batching; the size/repack
  tradeoff of a large atlas (§8.2). Cross-reference this from U9's `slug/CLAUDE.md` edit
  (one pointer line) so both agent- and user-facing docs carry it.

**(c) Method — TDD red-first.** New `packages/uikit/src/tests/cli-manifest.test.ts`:
write a manifest JSON pointing at 2–3 lucide fixtures (one with a `name` override),
invoke `baker.run(['icons', '--manifest', manifestPath])`, then
`SlugShapeSet.fromBaked(readFileSync(out))` and assert: `meta.icons` names/order/viewBox
match; **byte-identical to the equivalent positional bake**; the both-forms-supplied
error; an invalid-manifest error names the offending field.

**(d) Gates.**
```bash
pnpm vitest --run packages/uikit/src/tests/cli-manifest.test.ts   # ≥ 4 new tests green
pnpm vitest --run packages/slug packages/uikit                    # cumulative, 0 failures
pnpm --filter @three-flatland/uikit typecheck && pnpm --filter @three-flatland/uikit build
node packages/uikit/dist/cli.js icons --manifest <fixture>.json   # exits 0, out .glb parses via fromBaked
```

**(e) DO NOT.** Do not add a schema-validation dependency (hand-validate; clear messages).
Do not bump `SLUG_SHAPES_VERSION`. Do not change `packShapeSet`/`format.ts`/`fromBaked`.
Do not make `--manifest` recurse dirs differently than positional (same `collectSvgFiles`
semantics). Plus §5. **Serialize after U3** (same hot file `cli.ts`).

**(f) Acceptance.** A checked-in manifest deterministically re-bakes the same atlas;
manifest and positional forms produce byte-identical output; the "what to bake" guidance
is discoverable from both `--help` and `slug/CLAUDE.md`.

---

## 7. Sequencing, parallelism, incremental shipping

| Wave | Units | Parallel? | Ships |
| --- | --- | --- | --- |
| 1 | U1, U2, U3 | yes (disjoint: uikit svg seam / slug new files / uikit cli.ts) | **U1+U8a is independently shippable** — `perf(uikit): share one SlugShapeSet across Svg components` with the 26→1 proof. Do not block it on the loader. |
| 2 | U4, U5, U10 | yes (U4: new slug test; U5: uikit svg files; U10: `cli.ts` after U3) | — |
| 3 | U6 | alone (mass regenerate; keep other uikit-lucide edits out of flight) | — |
| 4 | U7, U8b, U9 | yes | full pipeline PR ready |

Serialization hot-spots (one writer at a time): `packages/uikit/src/components/svg.ts`
(U1 → U5), `packages/uikit/src/svg/index.ts` + uikit root barrel (U1 → U5),
`packages/slug/src/index.ts` + `src/svg/index.ts` (U2 only — single writer),
`packages/uikit/src/cli.ts` (U3 → U10, one writer at a time), `packages/uikit-lucide/**` (U6 only, but U4/U7
read `packages/uikit-lucide/icons/*.svg` — reads don't conflict).

Commit shape (Conventional Commits, no AI trailers, changesets are CI-generated):
- U1: `perf(uikit): register all Svg sources into one shared SlugShapeSet`
- U2: `feat(slug): SlugShapeSetLoader and baked icon-atlas lookup`
- U3: `feat(uikit): carry viewBox in icon bake meta, deterministic ordering`
- U4: `test(slug): baked/runtime bit-equivalence guard for SVG shape sets`
- U5: `feat(uikit): icon-atlas installation and Svg icon-name resolution`
- U6: `feat(uikit-lucide): embed icon names for baked-atlas resolution`
- U7: `feat(examples): uikit-icons pair demonstrating the baked icon atlas`
- U9: `docs(slug): document the shapes baked/runtime contract`

## 8. Risks & open questions for the orchestrator

1. **Order-band splits (target-number risk).** If bento icons land in >1
   `[majorIndex,minorIndex,...]` band, U8a reads 2–3 instead of 1. Evidence says 1 (text
   collapses to one band per font across the whole UI), but the gate is set to ≤ 3 for
   this reason. If >3, diagnose `order.ts` zIndex assignment before adjusting any gate.
2. **Shared-set repack churn during load.** 26 sequential `loadSVGShapes` calls dirty
   the shared set 26 times; `_ensurePacked` runs per first-texture-access after each
   registration (`SlugShapeSet.ts:124-137`) — worst case a handful of linear repacks
   during startup. Acceptable (data textures, KB-scale); if profiling shows churn, batch
   via the atlas path (U5) which packs once. Do not add a debounce API speculatively.
3. **Atlas installed after components mounted.** `setSharedShapeSet` clears the cache
   but already-mounted components keep their old set (and old draw groups). Documented
   rule: install at startup before UI construction. If hot-swap becomes a real need,
   that's a follow-up (signal-based set identity), not this plan.
4. **U3/U2 type coordination.** `BakedIconEntry` is defined in slug (U2) and written by
   uikit's CLI (U3), which run in parallel. Contract frozen here:
   `{ handles: number[], fills: {color:{r,g,b,a}, rule:string}[], viewBox: {minX,minY,width,height} }`.
   U4 is the integration gate that catches drift.
5. **uikit-bento remains react-only** (pre-existing pair-rule exception). This plan adds
   the `uikit-icons` pair rather than retrofitting bento a three twin. Flag to
   stakeholder if they want bento paired — out of scope here.
6. **Baked path must not require a DOM.** `iconFromBaked`/`SlugShapeSetLoader` never
   touch `DOMParser`; U5's test enforces it. This is the "no runtime parse" claim — keep
   it testable.
7. **HMR scattering (task #10)** is adjacent (shared sets + HMR re-registration could
   compound). Not owned here; cross-reference task #10 in the U1 PR description so the
   connection isn't lost (iron-law exception: named owned workstream).
