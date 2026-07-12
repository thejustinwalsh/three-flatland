# uikit a11y — Phase 4: immersive XR (Mode 4) — adapters, backends, DOM Overlay, emulated-XR harness

> ## STATUS: DEFERRED to a separate follow-up (decided 2026-07-12)
>
> The a11y epic **ships at Phase 3** (PRs #182–#185). Phase 4 is deliberately **not** part of it.
>
> **Why (architectural finding, verified against the shipped API):** XR does not need a different a11y
> vocabulary. XAUR maps onto the **same semantic props** we already ship — `role`, `ariaLabel`,
> `ariaDescription`, value, plus the spatial props `a11yOrder` / `a11yGroup` / `a11ySpatialLabel` /
> `a11yPositionDescription` (schema.ts:256). What immersive XR needs is a different **delivery** of
> that same semantics: **input** adapters (controller-ray / gaze → focus) and **output** backends
> (earcon / haptic / caption / speech). Both ride the **public** API with zero core changes:
> - input → `getA11yFocusManager().setFocus / focusDirectional / activateFocused` + the public
>   pointer-events stream;
> - output → `registerAnnouncementBackend({ announce })` (the `Announcement` already carries
>   `source: Component` for spatial-audio panning and `kind: 'activation'|'focus'|'status'`);
> - the one XR-aware behavior (skip the DOM mirror in-session) is already the public
>   `A11yFocusManager` option `isXRSession: () => boolean`.
>
> Therefore XR a11y for uikit **can and should live outside the core** — a separate
> `@three-flatland/uikit-xr` package (or app-land), which also proves the P3 API is complete +
> externally extensible. The core library stays XR-dependency-free.
>
> **Dependency groundwork already scouted (so the follow-up need not re-derive it):**
> - `@react-three/xr@^6.6.30` peers `@react-three/fiber >=8` (loose) — coexists with the examples'
>   `@react-three/fiber@10.0.0-alpha.2` under pnpm's non-strict peers **plus** a root
>   `package.json` `pnpm.peerDependencyRules.allowedVersions: { "@react-three/fiber": "10" }`.
> - `@pmndrs/xr@^6.6.30` (framework-agnostic core; peers `three *`); `@pmndrs/pointer-events@^6.6.30`
>   already catalogued. `iwer@^2.x` (pure-JS WebXR emulator) for a headless Playwright harness — do
>   NOT add `@iwer/devui` (its `three ^0.184` peer conflicts with the repo's `three ^0.183.1`).
> - **First blocker to solve before even an input demo renders:** WebGPU + WebXR *presentation* —
>   all examples render via `WebGPURenderer` (WebGL2 fallback), and WebXR historically binds a WebGL
>   `XRWebGLLayer`; WebGPU-backed XR layers are nascent, so the XR example likely needs forcing onto
>   the WebGL2 backend, plus a render-loop rewrite to `renderer.setAnimationLoop((t, frame) => …)`.
>
> The task breakdown below is retained as the **spec for that future package**.



**Spec:** `uikit-native-a11y.md` §5, §6 (remaining backends), §10 (XAUR compliance), §11 rows 11–15
**Depends on:** Phase 3 (focus manager is the substrate).
**Foundation fact (verified 2026-07-12):** `@pmndrs/xr` core ships **zero a11y** (input/setup only: controllers, hands, pointers, teleport, hit-test, emulate, store) and is built on the `@pmndrs/pointer-events` uikit already consumes. This phase INTEGRATES with it as the XR input plumbing and supplies the missing AT layer. uikit has zero XR binding today — T4.0 establishes the dogfood binding.
**Parallelism:** backends (T4.2a–d) are file-disjoint → fan out. Adapters: controller-ray (hard: pointer-events stream discrimination + session lifecycle) serialized with the manager owner; gaze + spatial-metadata are parallelizable after T4.1.

## Tasks

### T4.0 — XR dogfood binding + emulated-XR test harness

- Wire the wall-panel example pair for XR: `@react-three/xr` (`<XR>` store + `createXRStore`) in `examples/react/uikit`, `@pmndrs/xr` in `examples/three/uikit` — dev/example dependencies only; the uikit package gains no XR dependency. This is the first uikit XR binding — controllers/hands become pointer-events rays that hit the panels with no uikit change (that's the integration claim; this task proves it).
- Harness: `@pmndrs/xr`'s `emulate` (IWER-based) as the emulation runtime, driven from a Playwright project under the existing `test:e2e` setup: boots the wall-panel example, enters an emulated `immersive-vr` session, scripts controller pose/select.
- **Accept:** emulated session starts (CI posture: assert local, log in CI); a scripted controller select on a panel produces a uikit pointer `'click'` → `onActivate` with `source:'pointer'` TODAY (pre-adapter baseline proving the @pmndrs/xr → pointer-events → uikit path end-to-end).

### T4.1 — XR session awareness + `adapters/controller-ray.ts`

- Session tracking: `watchXRSession(renderer)` — defaults to three's `renderer.xr` `sessionstart`/`sessionend` events (zero-dep); duck-typed reader for a @pmndrs/xr `store` when the app passes one (richer input-source state). Signal consumed by the focus manager (DOM mirror off in-session, spec §5.1) and the announcer (backend preference shift).
- Controller-ray adapter per spec §5.2: listens to uikit's own pointer-event stream (XR pointers arrive tagged) — ray dwell (debounced) → `setFocus`; `select`/`squeeze` → `activateFocused({source:'xr-controller', handedness})` with REAL intersection passed through; thumbstick via @pmndrs/xr store input-sources or raw `XRInputSource.gamepad` polling → `focusDirectional`. No parallel raycasting — pointer-events is the single ray truth.
- **Accept (emulated XR):** scripted ray-hover ≥ debounce sets manager focus (visual `focus` conditional lights — pixel probe); scripted select fires `onActivate` with `source:'xr-controller'` and real intersection; DOM `document.activeElement` does NOT change in-session. Matrix #11 machine half.

### T4.2 — announcement backends (fan-out, one file each)

- **a `backends/caption.ts`** — camera-anchored uikit caption panel (dogfoods uikit `Container`+`Text`); prefs: enabled/size/anchor; auto-registers when a session starts and captions pref on. Accept: unit + IWER — activation renders message text in-scene (getA11yTree probe), respects pref off.
- **b `backends/earcon.ts`** — WebAudio focus tick / activate blip / toggle up-down; `source` pans via PannerNode from component world position; `monoAudio` pref collapses pan. Accept: unit with mocked AudioContext — node graph shape, pan set from position, mono pref bypasses panner.
- **c `backends/haptic.ts`** — pulse `hapticActuators` on focus (weak) / activate (strong); no-op outside session. Accept: unit with stub XRInputSource — pulse called with expected intensity/duration; matrix #14 (with a+b).
- **d `backends/speech.ts`** — opt-in `speechSynthesis`; never auto-registers; documented SR-conflict caveat. Accept: unit — speaks only when explicitly registered + pref on.

### T4.3 — `adapters/gaze.ts`

- Head-pose reticle fallback (viewer-space ray) + eye-gaze where exposed; dwell → focus; extended dwell or select → `activate({source:'gaze'})`; dwell time configurable via prefs; progress callback for apps to render a ring.
- **Accept (IWER):** scripted head pose over a panel for dwell-time focuses then activates with `source:'gaze'`; matrix #12 machine half.

### T4.4 — spatial metadata + queries

- `getA11yTree(root)`, `describeSurroundings(manager)` per spec §5.4 (octant phrases from camera-relative transform; `a11ySpatialLabel`/`a11yPositionDescription` override computed text).
- **Accept:** unit — tree snapshot matches scene fixture; describeSurroundings output contains labels ordered by distance and direction words match hand-computed octants.

### T4.5 — DOM Overlay integration (spec §5.5)

- When a session grants `dom-overlay`, re-parent the per-root a11y container + live region + caption element into `session.domOverlayState`'s root; restore on session end. Feature-detected; zero behavior change without it.
- **Accept (IWER supports dom-overlay emulation; else guarded smoke):** container re-parents in and restores out; matrix #15 smoke half.

### T4.6 — XAUR compliance sweep + manual checklist

- Walk XAUR user needs against the shipped system; produce `planning/superpowers/specs/uikit-a11y-xaur-checklist.md` mapping each need → mechanism or explicit stakeholder-authorized deferral (acceptance-criteria gate rule: no silent drops).
- Manual headset checklist (Quest browser): rows 11, 12, 14, 15 manual halves.

## What cannot be machine-probed (stated plainly)

Real headset screen-reader behavior, actual haptic feel, spatial-audio localization quality, visionOS system-AT interplay, and AR DOM Overlay on-device AT — these need the manual checklist on hardware. IWER covers session/input/pose scripting only. The loop's stop condition treats these as sign-off rows, not green-able gates.

## Phase gate

Unit + typecheck + lint + all prior probe regressions + IWER smokes (T4.1/T4.3/T4.5), orchestrator-run. Cross-vendor adversarial review on the XR focus/input model (finding #3 was the original miss — this is where the reviewer aims). Release requires the XAUR checklist complete (met or authorized-deferred).
