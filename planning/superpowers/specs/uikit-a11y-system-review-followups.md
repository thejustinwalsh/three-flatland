# uikit a11y — Codex system-review follow-ups (tracked hardening)

A cross-module Codex review (2026-07-12) of the shipped a11y system found 14 items. The
highest-impact correctness bugs were fixed on `feat/uikit-a11y-p3-diegetic`:

- ✅ **#1 (CRITICAL)** `Input` a11y registration follows root reparenting — `79828b10`
- ✅ **#2 (HIGH)** `Input` tabIndex reads the focus-skip signal — `79828b10`
- ✅ **#3 (HIGH)** `setFocus` refuses `behind-camera`/`too-small` targets — `79828b10`
- ✅ **#4 (HIGH)** announcer DOM live-region is additive (+ snapshot/error-isolation) — `79828b10`
- ✅ (bonus) duplicate-module state fork — `c6bc9f02`; world-space camera override — `08252ae2`

The remaining items are **real but narrow-scenario** hardening — each needs a specific config to
trigger and none blocks the common paths (proven by 290 unit + 13 e2e tests). Tracked here so they
aren't lost.

## Still open

- **#5 (HIGH) — `a11yVisibilityOverride: 'visible'` + unprojectable panel.** The override skips the
  geometry classify, so projection gets `visible` even when `computeA11yScreenRect` returns `null`
  (behind camera / straddling the plane): it removes `aria-hidden` + clears focus-skip but then
  `applyRect(null)` still `visibility:hidden`s it, while the focus manager independently treats it as
  fully visible. **Fix:** make the override bypass the *policy filter*, not *projectability* — keep
  `behind-camera` when there's no valid rect, or define an explicit fallback rect/focus behavior.

- **#6 (HIGH) — `minPerceivableSize` divergence.** Projection accepts a custom threshold; the focus
  manager always classifies with the default 8px. A 25px panel under a 30px projection threshold is
  `aria-hidden` by projection yet navigable + "visible" to the manager. Occlusion probe + viewport can
  diverge the same way. **Fix:** one per-root visibility-policy/view object (camera, live viewport,
  probe, size threshold) shared by projection AND the manager — the single source of truth both read.

- **#7 (HIGH) — no focus reconciliation when a focused panel becomes imperceivable.** If the focused
  panel goes hidden/behind/too-small, projection hides it but the manager has no `focusout`
  reconciliation and can retain a stale `focused` component (or DOM `activeElement` sticks on a pruned
  element). **Fix:** a per-frame reconciliation seam — an imperceivable focused target is cleared,
  revealed, or moved per policy, with DOM + manager state updated atomically. (Naturally folds into the
  shared view object from #6.)

- **#8 (MED) — focus-skip leaks across root reparenting.** The projection's `touched` set owns
  focus-skip by component; moving an offscreen role-driven component from root A to root B leaves A's
  still-active projection owning it, so the fresh element under B reads the stale `true`. **Fix:** track
  skip ownership by projection/root, or clear A's ownership when membership moves.

- **#9 (MED, partially fixed) — announcer coalescing.** Snapshot iteration + per-backend error
  isolation are done (`79828b10`). Still open: same-politeness announcements within ~100ms in the DOM
  live-region backend cancel each other rather than queueing, so a status/activation message can be
  lost. **Fix:** define + test an explicit per-politeness coalescing/queue policy in
  `announce/backends/dom-live-region.ts`.

- **#10 (MED) — occlusion probe never prunes.** `createRaycastOcclusionProbe` strongly retains every
  registered component forever, no unregister/dispose. Long-lived scenes accumulate stale raycast work.
  **Fix:** return an unregister handle / add `dispose()`, and prune aborted/reparented components in the
  frame pass.

- **#11–#14 (MED–LOW) — additional coverage.** Occlusion lifecycle + rendering-equivalence cases, ARIA
  state/property cleanup (slider min/max/step not cleared on null), activation announcement selection,
  and a browser switch-scan test. Some are now covered by `e2e/a11y-uikit.spec.ts`; the rest are
  incremental unit coverage.

## Recommended shape

#6 + #7 are the same underlying idea — **one shared per-root visibility "view/policy" object** that
projection, the focus manager, and any reconciliation read from. Doing that unit first makes #5, #7,
and the manager/projection agreement fall out together, and is the cleanest next focused change. #8,
#9, #10 are independent small fixes.
