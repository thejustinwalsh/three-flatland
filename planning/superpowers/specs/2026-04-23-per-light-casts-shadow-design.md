# Per-Light `castsShadow` Flag

**Date:** 2026-04-23
**Scope:** Add a per-light opt-out from shadow-tracing in the Forward+ direct-lighting path. Lets scenes with many cosmetic lights (slime glows, atmospheric fills) skip the 32-tap SDF trace for lights that don't semantically need shadows, while keeping shadowing on for lights that do (torches, hero-held sources).

## 1. Motivation

The `DefaultLightEffect` fragment loop runs up to `MAX_LIGHTS_PER_TILE = 16` iterations, and each qualifying iteration can fire a 32-tap SDF trace. At 1000 saturating lights the shadow path becomes the dominant cost — on the order of 10⁹ SDF reads/frame at 1080p × 60 fps. Most lights in a dense scene (slime glows, atmospheric fills) are visually "soft" ambient contributions where a physically-correct shadow would add little and cost a lot.

A recently-shipped atten gate (`atten > 0.01`) already skips near-miss contributions. This spec adds the complementary per-light opt-out: mark individual lights as non-shadow-casting and the shader skips their shadow trace unconditionally, regardless of attenuation.

Estimated impact at 1000 non-casting slimes + ~15 casting torches: ~98% of shadow traces eliminated. The scene's shadow cost becomes O(casting lights), not O(total lights).

## 2. Design

### 2.1 API (`Light2D`)

Add `castsShadow: boolean` to `Light2DOptions` and the class. Default `true` for back-compat — existing code that constructs a Light2D without the option keeps its current shadow-casting behavior.

```ts
// packages/three-flatland/src/lights/Light2D.ts
interface Light2DOptions {
  // ...existing fields
  /** Whether this light casts shadows (default: true) */
  castsShadow?: boolean
}

class Light2D extends Object3D {
  // ...existing fields
  castsShadow: boolean = true

  constructor(options: Light2DOptions = {}) {
    // ...existing assignments
    this.castsShadow = options.castsShadow ?? true
  }
}
```

Wire through:
- `Light2DUniforms` interface (add `castsShadow: boolean`)
- `getUniforms()` (include it)
- `clone()` (preserve it)

### 2.2 Storage (`LightStore`)

Row 3 of the lights DataTexture currently has two unused columns:

| Row | R    | G       | B | A |
|-----|------|---------|---|---|
| 3   | type | enabled | 0 | 0 |

Pack `castsShadow` into column B:

| Row | R    | G       | B           | A |
|-----|------|---------|-------------|---|
| 3   | type | enabled | castsShadow | 0 |

Values: `1.0` for casting, `0.0` for not. Stored as float, read by the shader via `row3.b`.

Update `sync()` at `packages/three-flatland/src/lights/LightStore.ts:163`:

```ts
data[3 * lineSize + offset + 0] = lightType
data[3 * lineSize + offset + 1] = light.enabled ? 1 : 0
data[3 * lineSize + offset + 2] = light.castsShadow ? 1 : 0   // NEW
data[3 * lineSize + offset + 3] = 0
```

The zeroing loop for unused slots leaves column B at its prior value, but since `enabled = 0` gates contribution to zero anyway, the castsShadow bit for inactive slots is don't-care. No change needed there.

No change to the DataTexture layout, dimensions, or `readLightData()` signature — consumers already receive `row3` and pick their columns.

### 2.3 Shader gate (`DefaultLightEffect`)

Extend `shouldTrace` in `packages/presets/src/lighting/DefaultLightEffect.ts` (post-atten-gate, currently lines 197-201):

```ts
const lightCastsShadow = row3.b
const shouldTrace = isAmbient.not()
  .and(NdotL.greaterThan(float(0)))
  .and(atten.greaterThan(float(0.01)))
  .and(lightCastsShadow.greaterThan(float(0.5)))   // NEW
```

Threshold `0.5` is standard for float-as-bool comparison — the stored value is exactly 0 or 1, so the midpoint is safe. GPU gate, physically skipped on the shader.

`DirectLightEffect` also runs `shadowSDF2D` but is left unchanged in this spec: propagating the flag there is a straightforward follow-up (read `row3.b`, chain the same `.and()`), but out of scope for the initial landing. `SimpleLightEffect` and `RadianceLightEffect` don't run an SDF trace and need no update.

### 2.4 Demo wiring (`examples/react/lighting/App.tsx`)

Set `castsShadow={false}` on the per-slime `<light2D>` at line ~924. Torches and the ambient light keep the default (casting and ambient-ignored-anyway, respectively).

```tsx
<light2D
  key={`slime-light-${i}`}
  // ...existing props
  castsShadow={false}   // NEW — slime glows are cosmetic fills
/>
```

## 3. Testing

### 3.1 `Light2D.test.ts`

Add cases:
- Default `castsShadow` is `true`.
- Custom `castsShadow: false` round-trips through constructor → property.
- `clone()` preserves `castsShadow`.
- `getUniforms()` returns the current `castsShadow`.

### 3.2 `LightStore.test.ts`

Add cases:
- After `sync()` with a `castsShadow: true` light, the DataTexture's row3 column B equals `1.0` at that light's index.
- After `sync()` with a `castsShadow: false` light, the DataTexture's row3 column B equals `0.0`.
- Sync preserves existing `enabled` column G behavior (regression guard on the row3 packing).

### 3.3 Shader-level verification

Not unit-testable (TSL fragment code). Visual verification via the lighting example: toggle slime lights with/without the flag and confirm:
- With `castsShadow={true}` (old default) + 200 slimes: frame time high, shadows visible on slime-lit walls.
- With `castsShadow={false}` (new default for slimes) + 200 slimes: frame time lower, slime glows remain visually distinct but their near-light shadows disappear.

## 4. Non-goals

- No DataTexture layout rework — row3 has free columns, no need for bit-packing.
- No change to `enabled` semantics — it still fully gates the light's contribution; `castsShadow` only gates the trace.
- No generalization to `DirectLightEffect`. It runs the SDF trace and would benefit from the same gate, but wiring it is deferred to a follow-up. `RadianceLightEffect` and `SimpleLightEffect` don't run an SDF trace and are unaffected.
- No runtime reactivity beyond what the existing sync loop provides — `castsShadow` is a JS field written through to the texture on each `sync()` call, same as every other Light2D property.

## 5. Order of operations

1. `Light2D` — option, field, `getUniforms`, `clone`.
2. `Light2D.test.ts` — cover the new field.
3. `LightStore` — wire `row3.b` in `sync()`.
4. `LightStore.test.ts` — cover the new packing.
5. `DefaultLightEffect` — add the shader gate.
6. `examples/react/lighting/App.tsx` — set `castsShadow={false}` on slime lights.
7. Verify: full test run, visual sanity check in the dev server.

## 6. Open questions

None after brainstorming. Defaults confirmed (`castsShadow: true`), packing confirmed (row3.b), demo policy confirmed (slimes off, torches on).
