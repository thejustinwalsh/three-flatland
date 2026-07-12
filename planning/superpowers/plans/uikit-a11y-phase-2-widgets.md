# uikit a11y — Phase 2: kit widget bindings + virtualized listbox + bento

**Spec:** `uikit-native-a11y.md` §7, §8; dogfood §12
**Depends on:** Phase 0 (activation API) merged; Phase 1 for the live probes.
**Parallelism:** per-widget tasks are file-disjoint → fan out wide. T2.L (listbox) touches `packages/uikit/src/a11y/hidden-element.ts` → assign to the core owner or serialize after fan-out.

## Fan-out tasks (each: one widget dir in `packages/uikit-default/src/`, one unit test, one commit)

Common contract for every widget task:
- Move behavior from `onClick` to `onActivate` in `defaultOverrides` (same closure body; activation now covers pointer + keyboard + AT + future XR).
- Add `role` + aria-state `computed(...)` bindings per the spec §7 table.
- Unit test (happy-dom): construct widget, assert hidden element tag/role/attrs; drive `element.click()` → state toggles through existing controlled/uncontrolled path; flip state signal → aria attribute updates.
- Do NOT touch `packages/uikit/src/*` — if the core API is insufficient, STOP and report; do not work around.

| Task | Widget | Specifics |
|---|---|---|
| T2.1 | `checkbox/` | `role:'checkbox'`, `ariaChecked: computed(() => this.currentSignal.value ?? false)` |
| T2.2 | `switch/` | `role:'switch'`, `ariaChecked` |
| T2.3 | `radio-group/` | `RadioGroupItem`: `role:'radio'`, `ariaChecked` via `searchFor(this, RadioGroup, …)` compare |
| T2.4 | `tabs/` | `TabsTrigger`: `role:'tab'`, `ariaSelected` (reuse its `active` computed) |
| T2.5 | `accordion/` | trigger: `role:'button'`, `ariaExpanded` from item open state |
| T2.6 | `slider/` | `role:'slider'`, `ariaValueNow/Min/Max/Step` (defaults 0/100/1 from existing props), `onA11yValueChange` → the same clamp/step/set path the pointer drag uses |
| T2.7 | `toggle/` + `toggle-group/` | `role:'togglebutton'`, `ariaPressed` |
| T2.8 | `input/` + `textarea/` kit wrappers | verify inherited `ariaLabel` reaches the hidden input (no new code expected; test only) |

Out of scope (explicitly deferred, spec §7): `pagination`, `menubar`, `dialog`, `alert-dialog`, `tooltip`.

## T2.L — listbox role (`packages/uikit/src/a11y/hidden-element.ts`)

- Implement role `'listbox'` per spec §8: focusable wrapper + single managed `role="option"` child (`aria-posinset/aria-setsize/aria-selected`, textContent = `ariaActiveLabel`), `aria-activedescendant` wiring, keydown grammar → `onA11yActiveIndexChange({ move })` / `onA11yActivate(index)`.
- **Accept:** unit — keydown sequences produce the right `move` values; posinset/setsize/label sync from signals; Enter/Space call `onA11yActivate` with current index; the wrapper is the ONLY tab stop.

## T2.G — icon-grid dogfood (`packages/uikit-lucide/example/App.tsx`)

- Scroll `Container` gains `role:'listbox'`, `ariaLabel`, `ariaItemCount={filtered.length}`, `ariaActiveIndex`/`ariaActiveLabel` from new `activeIdx` state; `onA11yActiveIndexChange` maps `move` using live `columns`, clamps, scrolls via `scrollPosition` signal to keep the row in view, sets a visual highlight on the active chip (border pulse using existing selected styling); `onA11yActivate` → `toggle(name)` + `announce(...)`.
- **Accept — live probe:** one tab stop for the grid; ArrowRight ×3 updates `aria-activedescendant` target's posinset and scrolls when crossing rows; Enter toggles selection (selected count text mutates) and the live region announces; grid still 60fps-scrolls (no per-arrow React storm — active index state only).
- Matrix row #6.

## T2.B — bento examples (`examples/react/uikit/App.tsx` + `examples/three/uikit/`)

- Labels on every interactive control (Tabs, Sliders, Switch, Checkbox, RadioGroup, Buttons, Input) in BOTH paired examples (repo rule: pairs or neither). Vanilla example also demonstrates `setupA11yProjection(root, { camera, renderer })` explicitly — it is the vanilla-wiring documentation.
- **Accept — live probe on the react bento:** every `[data-uikit-a11y] :is(button,input,a)` has an accessible name (zero anonymous); Tab traverses ≥ 10 controls; arrow keys on the slider's range input change the rendered slider fill (probe `ariaValueNow` + a pixel sample); checkbox Space-toggles.
- Matrix rows #1(machine half), #2.

## Phase gate

Full unit suite + typecheck + lint + BOTH live probes (toolbar probe from Phase 1 re-run as regression, grid probe, bento probe). Cross-vendor adversarial review focused on **ARIA semantic correctness** (right role, right state attr, no aria-checked on plain buttons, listbox grammar vs WAI-ARIA APG) — wrong semantics that "pass tests" are this phase's failure mode. Manual VoiceOver pass over bento recorded in the matrix.
