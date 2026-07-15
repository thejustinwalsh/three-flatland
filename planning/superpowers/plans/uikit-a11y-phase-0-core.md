# uikit a11y — Phase 0: screen-space core (Mode 1 semantics + activation + announcer)

**Spec:** `planning/superpowers/specs/uikit-native-a11y.md` §1, §2, §6 (DOM backend only)
**Packages touched:** `packages/uikit` only. **Serialized foundation — implemented by the orchestrator personally (see horde-execution §1); everything else depends on these files.**
**Ships as:** one PR, conventional commits per task (`feat(uikit): …`), committed by the orchestrator.

## Hot files (this phase owns them; no other agent edits them concurrently)

- `packages/uikit/src/properties/schema.ts`
- `packages/uikit/src/components/component.ts`
- `packages/uikit/src/events.ts`
- `packages/uikit/src/components/input.ts`, `packages/uikit/src/components/textarea.ts`
- `packages/uikit/src/text/input/hidden-input.ts`
- `packages/uikit/src/index.ts`
- new: `packages/uikit/src/a11y/*`

## Tasks

### T0.1 — schema: `a11yPropertyShape`

- File: `packages/uikit/src/properties/schema.ts`
- Add `a11yPropertyShape` exactly as spec §1.3 (semantics group + spatial group + handlers), spread into `baseOutPropertyShape` after `eventHandlerShape`. Add `onActivate` to `eventHandlerShape` is WRONG — it goes in `a11yPropertyShape`; but `events.ts` gains the `activate` entry in `Object3DEventMap` and `EventHandlersProperties.onActivate` so `computedHandlers`/`keyToEventName` route it (`'activate'` is already the lowercased slice of `onActivate`).
- Hoist from `packages/uikit/src/components/input.ts`: remove `tabIndex`/`onFocusChange` from `inputOutPropertiesSchema` + `InputOutProperties` (now inherited); keep `inputDefaults.tabIndex = 0`.
- **Accept:** `pnpm --filter @three-flatland/uikit typecheck` green; existing `schema.test.ts` green; new test: `ContainerPropertiesSchema.parse({ role: 'button', ariaLabel: 'x', focus: { backgroundColor: 'red' } })` passes, unknown key still throws (strict).

### T0.2 — `a11y/focus.ts` (move) + `a11y/activation.ts`

- Move `setupUpdateHasFocus` from `text/input/hidden-input.ts` → `a11y/focus.ts`; `hidden-input.ts` re-imports. No behavior change.
- `a11y/activation.ts`: `A11yActivationSource`, `A11yActivationEvent` (spec §2), and `dispatchActivation(component, event)` helper implementing steps 1–4 of §2 (disabled guard → dispatch `'activate'` → compat synthetic `'click'` marked `{ synthetic: true, source }`, skipped for `source:'pointer'` → announce activation/deactivation message).
- `events.ts`: `Object3DEventMap` gains `activate: A11yActivationEvent`; `EventHandlersProperties` gains `onActivate`.
- **Accept:** unit test — component with `onActivate` + `onClick` props: `activate({source:'keyboard'})` fires both, click event has `synthetic: true`; `activate({source:'pointer'})` fires `onActivate` only (no shim); disabled component fires neither.

### T0.3 — `Component` wiring

- File: `packages/uikit/src/components/component.ts`
- `readonly hasFocus: Signal<boolean> = config?.hasFocus ?? signal(false)` (assign before `createConditionals`; pass it in place of `config?.hasFocus`).
- `activate(event?: Partial<A11yActivationEvent>): void` → `dispatchActivation(this, { source: 'keyboard', ...event })`.
- Internal pointer delegation: constructor registers a `'click'` listener that, when `!event.synthetic`, calls `this.activate({ source: 'pointer', intersection: event, nativeEvent: event.nativeEvent })`.
- Config gains `ownsHiddenA11yElement?: boolean`; constructor tail: `if (!config?.ownsHiddenA11yElement) setupComponentA11y(this, this.abortSignal)`.
- `focus()` / `blur()` on base (focus/blur hidden element if present; no-op otherwise).
- `Input`/`Textarea`: pass `ownsHiddenA11yElement: true`; `Input` drops its own `hasFocus` field (inherits); add `setupAriaAttributes(this.properties, this.element, this.abortSignal)` beside the existing `setupHtmlInputElement` call (fixes the nameless hidden input).
- **Accept:** clone/copy tests still green (`clone.test.ts`); Input focus/selection tests unaffected; new test: `hasFocus.value = true` on a Container with `focus:{backgroundColor}` flips the resolved property.

### T0.4 — `a11y/hidden-element.ts`

- Implement `createHtmlA11yElement`, `setupComponentA11y`, `setupAriaAttributes` per spec §1.2. Roles in this phase: `button`, `togglebutton`, `link`, `checkbox`, `switch`, `radio`, `tab`, `slider`, `image`, `content` (`listbox` + `landmark` land in Phase 2/3 — the enum ships complete now, unimplemented roles warn once and fall back to `content` semantics).
- Element style: `position:absolute; opacity:0; pointer-events:none; margin:0; border:0; padding:0` — **no** `left:-1000vw` here; positioning is Phase 1's job. Until a projection is registered for the root, the per-root container itself sits off-screen (`left:-1000vw`) — the documented fallback lives at container level, elements are always rect-positioned relative to it.
- Per-root container WeakMap + refCount per spec §1.2.
- Element `'click'` → `component.activate({ source: 'screen-reader', nativeEvent })`; slider `'input'` → `onA11yValueChange(valueAsNumber)`.
- Dev-mode one-shot warn: interactive role with no `ariaLabel`.
- **Accept:** unit tests (happy-dom `Window`, pattern from `svg-shared-set.test.ts`): role→tag/attrs table; role null→set→null lifecycle leaves zero elements; abort cleanup; double construct+dispose (StrictMode shape) leaves zero elements/containers; aria sync flips on signal writes; disabled sets `disabled`/`aria-disabled` + tabIndex −1; activation routes through T0.2 chain.

### T0.5 — `a11y/announce/` (registry + DOM backend)

- `announcer.ts`: `Announcement`, `AnnouncementBackend`, `registerAnnouncementBackend`, `announce` per spec §6. `setA11yPreferences` store (signal-backed plain module) with `captions/earcons/haptics/speech/monoAudio/reducedMotion` — only `reducedMotion` consumed this phase (stored for later).
- `backends/dom-live-region.ts`: default backend, lazy singleton, clip-rect styles, clear-then-set 100 ms.
- **Accept:** unit — two `announce('x')` calls re-announce (spy on textContent mutations); custom backend registered receives announcements; unregister stops it; no-DOM env no-ops.

### T0.6 — exports + docs stub

- `packages/uikit/src/a11y/index.ts` re-exports; add to `packages/uikit/src/index.ts`.
- TSDoc per repo style (terse, WHAT-first).
- **Accept:** `pnpm --filter @three-flatland/uikit build` green (note: if the tsup DTS-worker OOM from the tsdown-migration workstream hits, that failure is owned there — cross-reference, don't chase; typecheck is the gate).

## Phase gate (orchestrator re-runs personally)

```
pnpm --filter @three-flatland/uikit typecheck
pnpm lint
pnpm test -- packages/uikit/src/tests
```

Plus: adversarial review pass (cross-vendor) on the activation model (§2) and the schema surface — API-shape mistakes here are the most expensive in the epic. Acceptance-matrix rows targeted: #5, #17 (unit-level).
