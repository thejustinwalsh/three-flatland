# SDF Shadow Plumbing — Phase 1 (baseline inline sphere-trace)

**Scope:** This is the tactical plan for Phase 1 — connecting `SDFGenerator` to `LightEffect` so the `shadow = float(1.0)` stub in `DefaultLightEffect.ts:155` and `DirectLightEffect.ts:141` can be replaced with an inline per-fragment SDF sphere-trace (the `shadowSDF2D` helper in `@three-flatland/nodes/lighting`). The eight touchpoints here go from "classes exist but nothing runs" to "shadow texture bound at shader time, refreshed each frame, per-pixel trace working."

Algorithm references live in `Unified-2D-Lighting-Architecture.md` and `Hybrid-SDF-Shadow-System.md`. Research evaluation lives in `planning/superpowers/specs/stochastic-tiled-lighting-evaluation.md`.

## Phase 2 is required, not optional

Phase 2 is the **quad-resolution decoupled shadow atlas** (HypeHype-style — see `SDF-Shadow-Atlas.md` for its spec). It is **not** a speculative optimization. It is the committed next phase after Phase 1 validates the baseline, and it must ship before the lighting system is considered complete.

Phase 1 exists first because:
- Phase 2's atlas consumes the inline trace produced by `shadowSDF2D`. Phase 1 builds the primitive; Phase 2 decouples and batches it.
- We need baseline perf numbers to evaluate Phase 2's win. Without the baseline we can't say "this saved us X ms at N lights."
- The inline path lets us validate shadow correctness (look, feel, edge artifacts, self-shadow) before adding atlas-allocator complexity.

Phase 1 → Phase 2 transition gate:
- Phase 1 lands end-to-end (T1-T8)
- Visual verification in `examples/react/lighting` passes (shadows track movers, soft edges look right, no self-shadow artifacts)
- Measured frame time at 1080p with 16 lights + 8 shadow casters on the target hardware
- Phase 2 spec signed off against those measurements

## Current gaps

| Piece | State |
|---|---|
| `SDFGenerator` class | ✅ Implemented (JFA, 10-12 fragment passes) |
| `Flatland._sdfGenerator` field | Declared, **never instantiated** |
| Occlusion RT | **Does not exist** |
| Per-sprite `castsShadow` trait | **Does not exist** |
| `LightingContext.sdfGenerator` wiring | Passed through, always `null` |
| `LightEffectBuildContext.sdfTexture` | **Does not exist** — shader can't bind it |
| TSL `shadowSDF2D` helper | **Does not exist** — `shadows.ts` has `shadow2D` (direct occluder raymarch, unused) |
| Replacement of `shadow = float(1.0)` stub | Blocked on all of the above |

## Target sequence per frame

Inside `Flatland.render()`, before the main scene render:

```
1. if (effect.needsShadows && _sdfGenerator) {
2.   renderOcclusionPass(renderer, occlusionRT)    // NEW — pre-pass
3.   _sdfGenerator.generate(renderer, occlusionRT) // NEW call site
4. }
5. renderer.render(scene, camera)                  // existing lit render
```

The lit material's fragment shader reads from `sdfGenerator.sdfTexture` during
the Forward+ light loop to sphere-trace from shaded pixel → light.

## The 8 touchpoints

### T1 — `Sprite2D` gains a `castsShadow` flag

`packages/three-flatland/src/sprites/Sprite2D.ts`

Add a boolean field (default `false`) and an option to the constructor.
Mirrors `enabled` on `Light2D`. No shader effect; consumed by T2's query.

Tests: unit test that the flag round-trips through the constructor options and
via direct set.

### T2 — Occlusion trait + scene traversal

`packages/three-flatland/src/lights/OcclusionPass.ts` (new)

Responsibilities:
- Own a `RenderTarget` (alpha-only is sufficient — RGB can be anything).
- Own an `OcclusionMaterial` (a `MeshBasicNodeMaterial` whose `colorNode`
  outputs `vec4(0, 0, 0, spriteAlpha)` so the occlusion silhouette equals the
  sprite's alpha).
- `render(renderer, scene, camera, shadowCasters)` — render only the subset
  into the owned RT. Must preserve and restore the renderer's render target
  exactly like `SDFGenerator.generate()` does.

Resolution is matched to the shadow-resolution preset. Default: half the main
render target resolution (so a 1920×1080 main render uses a 960×540 occlusion
RT → 960×540 SDF). Exposed via a constructor option.

Shadow-caster collection lives on `Flatland` and is updated by the same
path that tracks `_lights` — a `castsShadow` flag on `Sprite2D` flips
membership.

### T3 — `Flatland` instantiates the pipeline on attach

`packages/three-flatland/src/Flatland.ts`

In `setLighting(lightEffect)`:

```ts
const ctor = lightEffect.constructor as typeof LightEffect
if (ctor.needsShadows && !this._sdfGenerator) {
  this._sdfGenerator = new SDFGenerator()
  this._occlusionPass = new OcclusionPass()
  // Init to current render size; _ensureShadowSize() below tracks resizes.
}
```

On `dispose` / detach: dispose + null out.

### T4 — Per-frame SDF generation

`Flatland.render()` gains a pre-pass step:

```ts
if (this._sdfGenerator && this._occlusionPass) {
  this._ensureShadowSize(renderer)
  this._occlusionPass.render(renderer, this.scene, this._camera, this._shadowCasters)
  this._sdfGenerator.generate(renderer, this._occlusionPass.renderTarget)
}
```

Placement: after `_syncGlobals` and the ECS schedule (so ECS has a chance to
flip shadow-caster bits), before the main `renderer.render`.

Resize handling: `_ensureShadowSize` compares current renderer size against
last-known shadow-RT size and calls `SDFGenerator.resize` + `OcclusionPass.resize`
on change, keeping the half-resolution ratio.

### T5 — Thread `sdfTexture` into `LightEffectBuildContext`

`packages/three-flatland/src/lights/LightEffect.ts`

Extend the build context with a stable-reference `sdfTexture` and world
bounds uniform nodes pre-built by `SDFGenerator`/`Flatland`:

```ts
export interface LightEffectBuildContext<…> {
  uniforms: …
  constants: …
  lightStore: LightStore
  // NEW:
  sdfTexture: Texture | null
  worldSize: Node<'vec2'>
  worldOffset: Node<'vec2'>
}
```

`sdfTexture` is `null` only when the effect's class declares
`needsShadows = false`; this lets effects that want shadows assert non-null
at build time. `Flatland._buildLightFn` fills these from
`_sdfGenerator.sdfTexture` and already-existing `ForwardPlusLighting` uniform
nodes (or new ones if the effect doesn't use Forward+).

### T6 — `shadowSDF2D` TSL helper

`packages/nodes/src/lighting/shadows.ts`

Add a new helper using sphere tracing through the SDF. Contract:

```ts
export function shadowSDF2D(
  surfaceWorldPos: Node<'vec2'>,
  lightWorldPos: Node<'vec2'>,
  sdfTexture: Texture,
  worldSize: Node<'vec2'>,
  worldOffset: Node<'vec2'>,
  options?: { steps?: number; softness?: FloatInput }
): Node<'float'> // 0 = fully shadowed, 1 = fully lit
```

Implementation:
- Walk from surface toward light in world space.
- At each step, read SDF at current world position (via `worldToUV` from
  `coordUtils`), which gives "distance to nearest occluder in UV units."
- Convert UV-space distance to world-space by multiplying by a scene scale
  (average of `worldSize.x + worldSize.y) / 2`).
- Step forward by the SDF value, clamped to a minimum `eps` so we don't stall.
- If the traced distance ever collapses below eps → hit occluder → return
  shadowed.
- If we reach the light → return lit.
- Soft shadow: per Inigo Quilez's technique, track `min(k * distance / step)`
  across the walk for a penumbra term.

Compile-time loop unroll with a JS `for` (fixed `steps`, default 32).
`softness` uniform controls penumbra width.

Tests: there's no easy unit test for a TSL shader without a renderer. Keep
the helper small and validate via the example scene.

### T7 — Replace the `shadow = float(1.0)` stub

`packages/presets/src/lighting/DefaultLightEffect.ts:155`
`packages/presets/src/lighting/DirectLightEffect.ts:141`

Import `shadowSDF2D`, call it with the surface world position, light world
position (already extracted from `LightStore`), and the `sdfTexture` +
`worldSize`/`worldOffset` from the new build-context fields. Multiply into
`totalLight` as the existing stub location already does.

Gate behind the `shadowStrength` uniform so users can fade shadows without
shader rebuild.

### T8 — Example + visual verification

`examples/react/lighting` and `examples/vanilla/lighting`

Enable a few lit sprites + a few shadow-caster sprites (walls, pillars). Drop
in a debug overlay that visualizes the SDF directly (sample
`sdfGenerator.sdfTexture.r` into a full-screen quad). Confirm:

- Without shadow casters → scene renders identically to no-shadow baseline
- With a shadow caster between a light and a lit surface → a visible shadow
- Moving the shadow caster → shadow follows in real time
- Toggling `shadowStrength = 0` via Tweakpane → shadows disappear cleanly

## Non-goals for this slice

- Decoupled half-res shadow pass (later optimization)
- Shadow atlas / per-light shadow RTs
- Static-geometry baked-SDF merging
- Shadow caster culling (just render everything with `castsShadow` for now)
- Soft-shadow radius per-light (global `softness` uniform is enough to start)

## Risks & open questions

1. **Half-res occlusion RT** — using half the main resolution may produce
   aliased shadow edges at sprite silhouettes. If this is ugly, bump to full
   resolution and measure the cost. Not committing to half-res before
   measuring.
2. **Sprite alpha vs. solid silhouette** — partial-alpha sprites (leaves,
   smoke) will produce gradient shadows. This is probably fine but should be
   verified visually before users complain.
3. **TSL step count** — 32 steps at fragment is the default. On mobile
   targets that may be too many; expose `shadowSteps` as a schema constant
   (compile-time) on `DefaultLightEffect` so downstream users can tune.
4. **Worldspace scale conversion** — using `(worldSize.x + worldSize.y)/2`
   is an approximation; non-square aspects will show slight asymmetry.
   Revisit if any example shows it.

## Test plan

- Unit: T1 flag round-trip, T2 `OcclusionPass` render target creation/resize,
  T3/T4 integration (SDFGenerator gets instantiated when a shadow-needing
  effect is attached; disposed on detach), T5 build context surface.
- Visual: T8 example smoke test.
- Performance: after T7 lands, measure frame time in `examples/react/lighting`
  at 1080p with 16 lights + 8 shadow casters on an M1 Mac.

## Commit sequence

- C1: T1 + T2 (`castsShadow` + `OcclusionPass`)
- C2: T3 + T4 (Flatland instantiation + per-frame generate)
- C3: T5 + T6 (build-context + `shadowSDF2D`)
- C4: T7 (wire the stub)
- C5: T8 (example + visual verification)

Each commit green on `pnpm test` and `pnpm typecheck`. Skip commits only if
the underlying work is trivially additive.
