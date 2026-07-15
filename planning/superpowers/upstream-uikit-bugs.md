# Upstream bug report — `pmndrs/uikit`

Three defects found while forking `pmndrs/uikit` into `@three-flatland/uikit`. All three
were surfaced by a stricter ESLint config (`@typescript-eslint/no-for-in-array`,
`no-unused-expressions`), verified by reading the code, and are present at upstream HEAD
**`0d4d887`** (2026-06-18).

None is a vendoring artifact. **Not yet filed — needs stakeholder sign-off, since filing on
a third-party repository is an outward-facing action.**

**Update (2026-07-11):** a fourth issue — layout drift on a non-representable `pointScaleFactor`
grid (§4 below) — has been root-caused, **fixed, and pushed to a vanilla fork**
(`thejustinwalsh/uikit` @ `fix/layout-representable-grid-drift`, commit `a20b065`). PR not yet
opened. Bugs 1–3 remain unfixed reports; §4 is the first fix contributed back.

---

## 1. Conditional properties (`hover`, `dark`, `active`, `focus`, breakpoints) are never applied

**`packages/uikit/src/components/classes.ts:115`**

```ts
for (const conditionalKey in conditionalKeys) {
```

`conditionalKeys` is an **array** (`packages/uikit/src/properties/conditional.ts:104`):

```ts
export const conditionalKeys = ['dark', 'hover', 'active', 'focus', ...breakPointKeys]
```

`for...in` over an array enumerates its **indices as strings** — `'0'`, `'1'`, `'2'`, … — not
its elements. So inside `getStarProperties`, `conditionalKey` is `'0'` rather than `'dark'`,
and the subsequent `properties[conditionalKey]` lookup reads `properties['0']`, which is
always `undefined`.

**Impact:** the `*` (star) property path never picks up _any_ conditional properties. Hover,
dark-mode, active, focus, and every breakpoint variant are silently dropped. Nothing throws.

The consequence is sharper than "styles never apply." Tracing the chain:

1. `getStarProperties` fails to extract `hover: { '*': … }` into a star layer.
2. So `starProperties.usedConditionals.hover` never flips
   (`properties/index.ts:92`, `hasConditional(layers, 'hover')`).
3. And `computedHandlers` attaches the `pointerover` / `pointerout` listeners **only when a
   used-hover conditional exists** — `utils.ts:138-144` passes _both_
   `properties.usedConditionals.hover` and `starProperties.usedConditionals.hover` to
   `addHoverHandlers`.

So a component whose hover styling is expressed **only** through star-nesting never attaches a
hover listener at all. It is not that its hover styles fail to apply — it is that the component
cannot be hovered. `active` mirrors this exactly (`utils.ts:145-151`, `conditional.ts:59`).

This is why the kit components are affected. `uikit-default`'s `Button` declares its variants
under `'*': { … }` (`packages/uikit-default/src/button/index.ts:119`, hover variants at
`:23-60`, `:130`). Its _direct_ `hover: {}` props ride the parallel
`properties.usedConditionals.hover` leg, which never depended on `getStarProperties` — which is
presumably why the bug survived: the common case appears to work.

**Fix:** `for (const conditionalKey of conditionalKeys)`.

---

## 2. `ClassList` iteration yields array indices, not class entries

**`packages/uikit/src/components/classes.ts:16`**

```ts
*[Symbol.iterator]() {
  for (const entry in this.list) {
    if (entry != null) {
      yield entry
    }
  }
}
```

`this.list` is declared `private list: Array<InProperties | string | undefined> = []`
(`classes.ts:9`). Again `for...in` walks indices, so the iterator yields the strings `'0'`,
`'1'`, `'2'`, … instead of the stored class entries.

Two consequences:

- Any consumer doing `for (const c of classList)` receives index strings.
- The `if (entry != null)` guard was evidently intended to skip `undefined` holes in the
  list. It can never fire — an index string is never `null` or `undefined` — so the guard is
  dead and the skip never happens.

**Fix:** `for (const entry of this.list)`. The `!= null` guard then does what it was written
to do.

---

## 3. Disabled buttons never get their disabled subtext colour

**`packages/kits/horizon/core/src/button/label-subtext.ts:41`**

```ts
if (button.properties.value.disabled === true) {
  theme.component.button[button.properties.value.variant ?? 'primary'].subtext.disabled.value
}
```

The disabled colour is computed and then discarded — it is an expression statement, not a
`return`. Control falls through to the default-colour return below.

**Impact:** a disabled Horizon button renders its subtext in the enabled colour.

**Fix:** add the missing `return`.

---

## 4. Layout drift on a non-representable `pointScaleFactor` grid ("UI swimming") — FIXED

**`packages/uikit/src/flex/yoga.ts:4`** (`PointScaleFactor = 100`), plus the JS-side
derivations in **`packages/uikit/src/flex/node.ts`** (`relativeCenter`, committed min-size).

Yoga rounds computed layout onto a `1 / pointScaleFactor` grid. But **`1/100` is not exactly
representable in binary float** (same family as `0.1 + 0.2 !== 0.3`), so every value Yoga
"snaps" lands on a grid whose ticks themselves carry representation error, and each re-truncates
on every JS <-> Yoga (float32 / WASM embind) boundary crossing. Combined with the off-grid JS
`relativeCenter` derivation (`x + w/2 - pw/2`), a static element's matrix position accumulates
sub-pixel error across relayouts — text visibly "swims" / crawls. Most reproducible under
interaction: any control change re-triggers a whole-tree relayout, so the error compounds — an
idle scene barely moves, you have to drive relayouts to see it.

**Impact:** static UI text and elements drift by sub-pixels over time, worse the more the tree
relayouts. Present on a pristine fork of upstream HEAD — not a vendoring artifact.

**Fix (three parts, in order of impact):**

1. `PointScaleFactor = 128` — the nearest power of two >= 100: essentially the same precision
   but exactly representable, so Yoga's grid ticks are exact and a deterministic layout is
   byte-identical across relayouts.
2. Snap `relativeCenter` onto the `1/256` half-grid (a centered box's center is inherently a
   half-cell of the 1/128 edges) — preserves Yoga's exact center byte-stably; snapping to 1/128
   would nudge it up to half a cell off.
3. `ceilQuantize` the committed min-size (`setMinWidth/Height`) to match the measure func's
   existing ceil — never-clip consistency across the two paths.

Verified in this fork with a raw-Yoga determinism harness + unit tests: raw Yoga is byte-stable
at 128, idempotency holds byte-identically over N=150 relayouts, and jitter-fuzz (models the
sub-cell re-measurement noise interaction produces) drifts 0/48.

**Fork-only extra:** three-flatland's `node.ts` also has a measure-request relayout gate (an
optimization upstream lacks — upstream always relayouts). Our fix additionally corrects that
gate to compare the grid-snapped committed size (exact `===` on the `ceilQuantize`d value)
rather than a raw-float compare, so a genuine one-cell change still relayouts while sub-cell
noise does not. **That gate change is fork-only and intentionally NOT in the upstream patch.**

**Status: FIXED and pushed** to `thejustinwalsh/uikit` @ `fix/layout-representable-grid-drift`
(commit `a20b065`) — fix only (no gate, no tests: upstream has no measure gate and no unit-test
runner). **PR not yet opened**, awaiting sign-off. Note: vanilla's fresh-clone `tsc` build has
pre-existing type errors (three types drift in `text/`, `transform.ts`, `utils.ts`) unrelated to
the fix; the three touched files are type-clean.

---

## 5. Per-frame CPU cost — two optimizations (found benchmarking the dense grid) — FIXED in fork

Surfaced 2026-07-14 profiling `examples/react/uikit-perf` `?scene=labelgrid` (a ~7,800-node
grid). The fork ran the dense grid at **~38 fps**; both fixes together took it to **~102 fps**.
One is fork-specific (a fiber-migration regression), one is **shared debt present at upstream
HEAD** and is a genuine upstream candidate.

### 5.1 Per-node matrix/clip recompute runs every frame regardless of change — **UPSTREAM CANDIDATE**

**`packages/uikit/src/context.ts` / `utils.ts`** (`setupMatrixWorldUpdate` fan-out) and
**`packages/uikit/src/clipping.ts`** (`RelativePlane.computeInto`).

Every frame, the root's `onUpdateMatrixWorldSet` fan-out calls `updateWorldMatrix` for **every**
`Content`/`Svg` node (~1,290/frame on the grid), and `RelativePlane.computeInto` recomputes the
clip planes on **every getter read** (~2.3M/s), even when nothing in the subtree moved. This is
pure per-node work proportional to node count, paid on static frames.

**Impact:** the ceiling on any dense uikit scene is O(node-count) per-frame recompute that a
static tree does not need. Present on a pristine fork of upstream HEAD — not a vendoring
artifact; upstream pays the same cost.

**Fix (fork commit `a922d9bb`):** a root-level `matrixVersion`, bumped only when the root's
world→global matrix actually changes (compared via `Matrix4.equals`), plus each node's
`globalPanelMatrix` signal ref, gate the recompute. A **childless** `Content` skips the
recompute when unchanged; a `Content` wrapping embedded content is conservatively excluded
(always recomputes) so animated children never freeze. `RelativePlane.computeInto` is memoized
on the same version. Grid 72→~102 fps; wobble/orbit stay pixel-correct (moving nodes still
recompute — verified ~99% frame-diff). **This is the one worth a PR** — it helps every uikit
consumer, WebGL or WebGPU.

### 5.2 One rAF job registered per component instead of per root — **FORK-ONLY (fiber-10 migration note)**

**`packages/uikit/src/react/build.tsx`** (`useSetup`).

The fork's `useSetup()` called `useFrame(...)` **unconditionally for every component**, so R3F's
scheduler ticked **one job per node** (~7,800 on the grid) and ~99.99% no-op'd — only the root's
`Component.update()` does real work (it pumps the whole subtree). **Upstream does NOT have this
bug:** it gates the *registration* behind a signals `effect()` that early-returns before
subscribing, riding `@react-three/fiber` **9**'s `internal.subscribe`. The fork lost that gating
when it migrated to fiber **10**, where `internal.subscribe` was removed and was replaced with an
ungated `useFrame`.

**Fix (fork commit `ea33424b`):** drive a signals `effect()` keyed on `component.root`; only while
`component.root.value.component === component` register a job via fiber 10's
`scheduler.register` (the primitive `useFrame` itself uses), unregister when root-ness flips. Job
count 7,831 → 10 (flat = root count). Grid 38→72 fps.

**Not an upstream bug today** — but a **migration note**: when upstream moves to fiber 10 it will
lose `internal.subscribe` too and needs exactly this `scheduler.register`-based gating to keep the
root-only pump. Record so the pattern isn't rediscovered the hard way. (Cross-ref: §4's fork-only
measure-request relayout gate is adjacent per-frame-cost territory.)

---

## Suggested filing

One issue per bug, or a single issue with three sections. Bugs 1 and 2 share a root cause
(`for...in` over an array) and a one-line fix each; they would be a natural single PR
alongside enabling `@typescript-eslint/no-for-in-array`, which is what caught them.

Bug 1 is the consequential one: it means conditional styling has never worked through the
star-property path, and it fails silently.
