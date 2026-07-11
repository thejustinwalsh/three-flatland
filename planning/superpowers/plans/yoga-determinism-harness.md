# Yoga layout determinism harness — plan

> A **library** correctness feature for `@three-flatland/uikit`: catch layout
> non-determinism, keep it from regressing, and **mechanically attribute** each failure
> to a uikit bug vs. an ill-posed layout the consumer wrote. Fixes the "Heads up" crawl
> (task #11). **Not bento-specific** — exercises the layout engine with synthetic trees;
> bento is only a live smoke-confirm, never a test dependency.

## The bug this is born from

Measured live (uikit-bento, retina): the `AlertTitle` container matrix Y is flat, but the
"Heads up" **text** drifts `-0.104616 → -0.104679`, changing in **38/90 frames and not
converging**. Every full-tree relayout (still ~40/sec from live counters) re-settles the
`flexDirection:'row'`, no-explicit-height row a hair differently, and the centered text
rides it down. drift's `flex/node.ts` gate reduced *frequency* but the layout itself is
**non-deterministic** — a gate cannot fix that. The engine must be a pure function of its
inputs; today it isn't.

## Core principle

**Layout is a pure, idempotent function of its inputs.** Everything below tests deviations
from that, in priority order.

### Invariant A — Idempotency (the library-bug detector; UNAMBIGUOUS)

Run `calculateLayout()` **twice on the same, unchanged tree**; every node's computed
`{left, top, width, height}` must be **byte-identical**. If it drifts, it is **always a
library bug** — nothing changed between the two calls, so no consuming app can be blamed.
This single invariant cleanly isolates the uikit defect from UI misuse, and it *is* the
"Heads up" bug. This is the crawl's permanent regression guard.

### Invariant B — Gate equivalence (guards drift's optimization)

After **any** property mutation, the gated/incremental path (`updateMeasureFunction`'s
skip) must produce the **same** geometry as a forced full relayout. Catches the
"should-change-but-doesn't" over-correction — the correctness class flagged during the
commit review. (`gated_layout(after mutation) === forced_relayout_layout`.)

## Separating a library bug from bad UI programming (the attribution)

When a tree does **not** reach a stable fixed point, classify with a **raw-Yoga control**:

1. Iterate `calculateLayout()` up to K passes. `converged@N` (transient mount-settle,
   assert N ≤ bound) is fine; `non-convergent` (still moving at K) needs attribution.
2. Rebuild the **equivalent node geometry in raw Yoga** — no uikit measure/matrix/relayout
   layer — and run the same idempotency/convergence check:

   | uikit | raw Yoga | Verdict |
   |---|---|---|
   | drifts | **stable** | **LIBRARY BUG** — uikit's measure/text-positioning/relayout adds the feedback. Fix in uikit. |
   | drifts | also drifts | **Ill-posed layout / Yoga limitation** — attribute to the consumer's style combination (bad-UI-side); document the constraint, do **not** file it as a uikit bug. |
   | stable | stable | Fine. |

This is the mechanical "is it us or is it them" the harness exists to answer. "Heads up"
is expected to land in row 1 (raw Yoga stable for the row+measured-text pattern → uikit
bug), which is what justifies fixing it in the library.

## The harness (lives in `packages/uikit/src/tests/`, builds on `flex.test.ts`)

`flex.test.ts` already drives real `loadYoga` + `calculateLayout` + `setMeasureFunc` —
extend that, don't reinvent.

- **`layout-determinism.ts`** (helpers):
  - `buildTree(spec)` — synthetic uikit-component / FlexNode trees from a declarative
    style spec. **Not bento.** Ships a **stress corpus**: `row + measured-text + no height`
    (the AlertTitle / "Heads up" shape), wrapping text at fixed width, nested flex,
    `alignItems` variants, percentage cross-sizes, measure-func children, deep nesting.
  - `snapshot(root)` → stable `{path → {left,top,width,height}}` for equality.
  - `assertIdempotent(tree, n=20)` — layout to steady state, then `n` no-op relayouts, all
    snapshots equal (Invariant A).
  - `assertGatedEqualsForced(tree, mutations)` — per mutation, gated vs forced snapshot
    (Invariant B).
  - `classifyConvergence(tree, k)` + `attributeVsRawYoga(tree)` — the verdict table above.
- **`layout-determinism.test.ts`** — the corpus under A + B, plus the two known fixtures
  that anchor attribution: one **known library-bug** shape (row+measured-text) and one
  **known ill-posed** shape (e.g. percentage cross-size feeding an auto-measured parent).
- **A fuzzer** (later unit) — random style combos × random mutation sequences asserting A
  and B, shrinking on failure. Finds the long-tail patterns hand tests miss; the
  attribution runs on every failure so it self-labels library vs UI.

## Fixing the crawl with the harness

1. **Reproduce** "Heads up" as a corpus fixture (`row`, no height, measured-text child).
   Confirm `assertIdempotent` **fails** and `attributeVsRawYoga` returns **LIBRARY** (raw
   Yoga stable). This proves it's a uikit defect, not bento misuse — before touching code.
2. **Root-cause** the non-idempotency: the text measure/baseline (or the per-element
   global matrix / text vertical placement) reading back the *previous* resolved box.
   Likely in `flex/node.ts` `updateMeasureFunction`/`customLayouting`, the text measure
   func, or `layout/baseline.ts`. Instrument to find the value that feeds forward.
3. **Fix at the source** — make the measure a pure function of intrinsic inputs (font
   metrics, available width), never the resolved cross-size.
4. **Guard**: the `assertIdempotent` fixture for the row+text shape goes green and stays.
   **Live confirm** on bento: AlertTitle text `globalTextMatrix.elements[13]` = 0 changed
   frames over 90 (the earlier probe, now the acceptance check).

## Units (for the horde, after the SVG-bake wave)

| # | Unit | Tag |
|---|---|---|
| Y1 | Harness core (`buildTree`/`snapshot`/`assertIdempotent`/`assertGatedEqualsForced`) + stress-corpus seed tests | new files — parallel |
| Y2 | `attributeVsRawYoga` + `classifyConvergence` + the two anchor fixtures (known library-bug, known ill-posed) | depends Y1 |
| Y3 | **The crawl fix**, guarded by Y1's idempotency test + the live bento confirm | serialized on the layout/text source |
| Y4 | Determinism fuzzer (random trees × mutations, shrink + auto-attribute on failure) | depends Y1/Y2 |

## Gates

- `assertIdempotent` green for the whole stress corpus (0 drift over n=20).
- "Heads up" shape: 0 drift (was drifting) — the crawl guard.
- `attributeVsRawYoga` correctly labels the known-library vs known-ill-posed fixtures.
- Live bento: AlertTitle text `ty` stable over 90 frames.
- `pnpm --filter @three-flatland/uikit typecheck` + full uikit/slug suite green.

## Explicitly NOT this

- **Not bento-specific.** The corpus is synthetic library stress shapes; bento is a live
  smoke-confirm only.
- **Not a perf harness.** Correctness/determinism only (perf work is separate).
- **Not a Yoga fork.** When raw Yoga also drifts, the verdict is "UI wrote an ill-posed
  layout" — documented, not patched.
