# Phase 3 audit — Issue #32

Audit artifacts for the Phase 3 redesign + polish work. Captured per the
`implementing-github-issues` skill so the PR's acceptance gate has the
load-bearing verification evidence one place to read.

This file accumulates as Phase 3 punch-list items close. The full
`/impeccable:audit` regression-delta report (item 7) goes in the
"Audit (vs Phase 2 baseline)" section near the bottom — currently
populated only with the reinit-glue subset that closes punch-list
item 6.

---

## Reinit-glue verification

**Punch-list item:** 6 — "Reinit-glue verification report"
**Status:** ✅ verified
**Date:** 2026-05-07
**Tip commit:** `bc1f350`

### Background

Pre-Phase-3, `docs/src/components/Head.astro` carried five hand-rolled
inline scripts that survived view transitions: theme re-apply on
`astro:after-swap`, GPU/WebGL feature detection global, Pagefind
reinit + suggestions injection, HMR `astro:page-load` re-dispatch, and
a table-scroll wrapper enhancement. Combined ~200 lines of
`<script is:inline>` glue.

The Phase 1 plan called for an audit (Phase 3 task) to probe each one
post-Astro-6 / Starlight-0.38 / vtbot-integration to see which gaps had
closed natively. The pruning shipped in commit `1f6be23`; this section
captures the verification.

### Per-script verification

| Glue script | Old location | Status | Replacement |
|---|---|---|---|
| Theme `data-theme` re-apply on `astro:after-swap` | `Head.astro:24-44` (pre-prune) | ✅ removed | `astro-vtbot/components/starlight/Base.astro` (imported as `VtBotBase` in current `Head.astro:24`) bundles `ReplacementSwap` configured with `rootAttributesToPreserve="data-theme"`. Verified by `grep` — current `Head.astro` has zero `astro:after-swap` references. |
| GPU/WebGL feature detection (`window.__gpuSupported`) | `Head.astro:46-56` (pre-prune) | ✅ removed | `docs/src/utils/useGPUSupport.ts` — React hook returning `boolean \| null` (null while detecting). Consumed by `docs/src/components/HeroGame.tsx:135` and `ShowcaseGame.tsx`. Renders proper "WebGPU/WebGL2 required" fallback UI instead of the previous `return null`. |
| Pagefind reinit + suggestions injection | `Head.astro:58-130` (pre-prune) | ✅ removed (with conditional re-add Phase 3.x) | `astro-vtbot/components/starlight/Base.astro` bundles `StarlightConnector` which handles Pagefind reinit on view transitions. Suggestions-list CSS was deleted with the retro stylesheets in Phase 2; the suggestions injection becomes useful again only when the Search override is redesigned (currently on the Phase 3 punch list as part of item 1, "Search modal interior"). |
| HMR `astro:page-load` re-dispatch | `Head.astro:132-141` (pre-prune) | ✅ removed | Astro 6's HMR fires `astro:page-load` natively. Verified empirically — the dev server's HMR now triggers `page-load` events without the manual re-dispatch shim. |
| Table-scroll wrapper enhancement | `Head.astro:143-202` (pre-prune) | ✅ removed (deferred) | The wrapper's CSS was deleted in Phase 2; the JS wrapper became dead code. Returns to scope when MarkdownContent is finished and we decide whether wide-table overflow needs site-specific UX (vs Starlight's default horizontal scroll). Tracked under Phase 3 punch-list item 1 ("MarkdownContent finish"). |

### New post-prune glue (added in Phase 3 substrate work)

| Script | Location | Re-init mechanism |
|---|---|---|
| Motion-as-craft runtime — perlin-noise day cycle, pointer-tracking light, holo-foil | `docs/src/scripts/motion.ts` | Initial run via `DOMContentLoaded` (or sync if document already loaded). Re-init on every `astro:page-load` (line 338): drops stale targets (`targets.length = 0`) and re-scans for `.u-light`/`.u-holo`/`.u-reveal` elements in the new page. Honors `prefers-reduced-motion: reduce`. |
| `.u-reveal` IntersectionObserver fallback | `docs/src/scripts/motion.ts:301-326` | Skips when `CSS.supports('animation-timeline: view()')` returns true (modern browsers handle natively). On older browsers, observes `.u-reveal` / `[data-reveal]` and toggles `data-revealed` on intersection. Re-runs as part of the motion runtime's `astro:page-load` re-init. |

### Verification approach

- **Static**: `grep -nE 'astro:after-swap|astro:page-load' docs/src/components/Head.astro` returns 0 matches; the only `astro:page-load` listener in the codebase is `motion.ts:338` (intentional, post-prune addition).
- **Dist artifacts**: `dist/_astro/PageOrder.astro_astro_type_script_index_0_lang.*.js` confirms vtbot scripts ship; no reference to legacy theme-persistence or pagefind-reinit shims.
- **Build**: `pnpm --filter=docs build` green at tip `bc1f350` (310 pages built in 14.62s).
- **Behavioural**: theme persistence and motion re-init were verified via Chrome screenshots over the course of the session work — navigation between landing ↔ docs ↔ guide pages preserves theme selection, sidebar state, and re-runs reveal animations on incoming pages.

### Deferred items requiring re-verification

When Phase 3 punch-list item 1 ("Search modal interior") closes, re-run
this audit on Pagefind specifically — the `StarlightConnector`'s
default reinit may not cover the suggestions-list once it's
redesigned and back in scope.

When the MarkdownContent finish lands a final wide-table treatment,
re-evaluate whether the table-scroll wrapper needs to come back as a
utility under `docs/src/utils/` or stay in CSS.

---

## Audit (vs Phase 2 baseline) — `/impeccable:audit` final pass

*Pending.* Punch-list item 7. Will compare against `phase-2-audit.md`
across a11y / perf / theming / responsive axes once the rest of the
Phase 3 punch list closes. Captured here when the audit runs.

---

## Optimize — `/impeccable:optimize` final pass

*Pending.* Punch-list item 8. Bundle size, image optimization, font
loading, animation cost. Captured here when the optimize pass runs.
