# Per-Light `castsShadow` Flag Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-light opt-out from SDF shadow tracing so scenes with many cosmetic lights skip the 32-tap trace for lights that don't need shadows.

**Architecture:** Add a boolean `castsShadow` field to `Light2D` (default `true`). Pack the value into the free `row3.b` column of the lights DataTexture in `LightStore.sync()`. Extend the `shouldTrace` gate in `DefaultLightEffect` to also require `row3.b > 0.5`. Update the lighting demo to mark per-slime glow lights as `castsShadow={false}`.

**Tech Stack:** TypeScript, Three.js (DataTexture), TSL (three/tsl), Vitest, React Three Fiber (webgpu).

**Spec:** `planning/superpowers/specs/2026-04-23-per-light-casts-shadow-design.md`

---

## File Structure

- **Modify:** `packages/three-flatland/src/lights/Light2D.ts` — add `castsShadow` option, field, `getUniforms`/`clone` wiring.
- **Modify:** `packages/three-flatland/src/lights/Light2D.test.ts` — cover default, custom, `getUniforms`, `clone`.
- **Modify:** `packages/three-flatland/src/lights/LightStore.ts` — write `castsShadow` into `row3.b`.
- **Modify:** `packages/three-flatland/src/lights/LightStore.test.ts` — cover the new packing.
- **Modify:** `packages/presets/src/lighting/DefaultLightEffect.ts` — add shader-side `row3.b > 0.5` gate on `shouldTrace`.
- **Modify:** `examples/react/lighting/App.tsx` — pass `castsShadow={false}` to slime `<light2D>`.

No new files. No layout changes to the DataTexture (uses a free column).

---

## Task 1: Add `castsShadow` to Light2D (tests first)

**Files:**
- Modify: `packages/three-flatland/src/lights/Light2D.ts`
- Modify: `packages/three-flatland/src/lights/Light2D.test.ts`

- [ ] **Step 1: Add failing test for default `castsShadow`**

In `packages/three-flatland/src/lights/Light2D.test.ts`, extend the existing "should construct with default options" test (around line 6-17) to add a line checking the default. Add after the existing assertions:

```ts
  it('should construct with default options', () => {
    const light = new Light2D()
    expect(light.lightType).toBe('point')
    expect(light.intensity).toBe(1)
    expect(light.distance).toBe(0)
    expect(light.angle).toBe(Math.PI / 4)
    expect(light.penumbra).toBe(0)
    expect(light.decay).toBe(2)
    expect(light.enabled).toBe(true)
    expect(light.castsShadow).toBe(true)
    expect(light.color).toBeInstanceOf(Color)
    expect(light.direction).toBeInstanceOf(Vector2)
  })
```

- [ ] **Step 2: Add failing test for custom `castsShadow: false`**

In the same file, add a new test right after "should construct with custom options":

```ts
  it('should accept castsShadow: false in options', () => {
    const light = new Light2D({ castsShadow: false })
    expect(light.castsShadow).toBe(false)
  })

  it('should accept castsShadow: true in options (explicit)', () => {
    const light = new Light2D({ castsShadow: true })
    expect(light.castsShadow).toBe(true)
  })
```

- [ ] **Step 3: Add failing test for `getUniforms` including `castsShadow`**

In `Light2D.test.ts`, extend the existing "should get uniforms" test (around line 118-132). Replace it with:

```ts
  it('should get uniforms', () => {
    const light = new Light2D({
      type: 'directional',
      color: 0xffffff,
      intensity: 0.8,
      direction: [1, -1],
      castsShadow: false,
    })

    const u = light.getUniforms()
    expect(u.type).toBe('directional')
    expect(u.intensity).toBe(0.8)
    expect(u.position).toBeInstanceOf(Vector2)
    expect(u.direction).toBeInstanceOf(Vector2)
    expect(u.color).toBeInstanceOf(Color)
    expect(u.castsShadow).toBe(false)
  })
```

- [ ] **Step 4: Add failing test for `clone` preserving `castsShadow`**

Extend the existing "should clone with all properties" test (around line 134-160) to toggle and assert `castsShadow`. Replace the test body with:

```ts
  it('should clone with all properties', () => {
    const light = new Light2D({
      type: 'spot',
      color: 0x00ff00,
      intensity: 3,
      position: [10, 20],
      direction: [0, 1],
      distance: 150,
      angle: Math.PI / 3,
      penumbra: 0.5,
      decay: 1.5,
      castsShadow: false,
    })
    light.enabled = false

    const cloned = light.clone()

    expect(cloned).not.toBe(light)
    expect(cloned.lightType).toBe('spot')
    expect(cloned.intensity).toBe(3)
    expect(cloned.position.x).toBe(10)
    expect(cloned.position.y).toBe(20)
    expect(cloned.distance).toBe(150)
    expect(cloned.angle).toBe(Math.PI / 3)
    expect(cloned.penumbra).toBe(0.5)
    expect(cloned.decay).toBe(1.5)
    expect(cloned.enabled).toBe(false)
    expect(cloned.castsShadow).toBe(false)
  })
```

- [ ] **Step 5: Run tests, confirm they fail**

Run: `pnpm --filter=three-flatland test -- --run src/lights/Light2D.test.ts`

Expected: the modified/added tests fail with "expected undefined to be true" / "expected undefined to be false" (the field doesn't exist yet).

- [ ] **Step 6: Implement `castsShadow` in `Light2D.ts`**

In `packages/three-flatland/src/lights/Light2D.ts`:

**6a.** Add to `Light2DOptions` (after `decay` at line 29):
```ts
  /** Whether this light casts shadows (default: true) */
  castsShadow?: boolean
```

**6b.** Add to `Light2DUniforms` (after `decay: number` at line 44):
```ts
  castsShadow: boolean
```

**6c.** Add field declaration on the class (after `enabled` at line 135):
```ts
  /**
   * Whether this light casts shadows. When false, the shader skips the
   * SDF shadow trace for this light — useful for cosmetic/atmospheric
   * lights (slime glows, ambient fills) that don't need occlusion.
   */
  castsShadow: boolean = true
```

**6d.** Assign in constructor (after `this.decay = options.decay ?? 2` at line 168):
```ts
    this.castsShadow = options.castsShadow ?? true
```

**6e.** Include in `getUniforms()` (inside the returned object, after `decay: this.decay,` at line 239):
```ts
      castsShadow: this.castsShadow,
```

**6f.** Preserve in `clone()` (after `light.enabled = this.enabled` at line 258, before `return light as this`):
```ts
    light.castsShadow = this.castsShadow
```

Note: `LightStore.sync()` reads `light.castsShadow` directly, not via `getUniforms()` — the interface update is for public API consistency. LightStore wiring is handled in Task 2.

- [ ] **Step 7: Run tests, confirm they pass**

Run: `pnpm --filter=three-flatland test -- --run src/lights/Light2D.test.ts`

Expected: all tests pass (19+ tests, 0 failures).

- [ ] **Step 8: Typecheck**

Run: `pnpm --filter=three-flatland typecheck`

Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add packages/three-flatland/src/lights/Light2D.ts packages/three-flatland/src/lights/Light2D.test.ts
git commit -m "feat(lighting): add castsShadow field to Light2D

Adds a per-light opt-out for shadow-casting. Defaults to true for
back-compat. Preserved across clone(). Used by LightStore to pack
the flag into the lights DataTexture for shader consumption.

Part of per-light castsShadow optimization — see
planning/superpowers/specs/2026-04-23-per-light-casts-shadow-design.md"
```

---

## Task 2: Pack `castsShadow` into `LightStore` row3.b

**Files:**
- Modify: `packages/three-flatland/src/lights/LightStore.ts`
- Modify: `packages/three-flatland/src/lights/LightStore.test.ts`

- [ ] **Step 1: Add failing test for castsShadow=true packing**

In `packages/three-flatland/src/lights/LightStore.test.ts`, add a new test after the "should handle disabled lights" test (around line 150):

```ts
  it('should pack castsShadow=true into row3.b as 1.0', () => {
    const store = new LightStore({ maxLights: 4 })
    const light = new Light2D({ type: 'point', intensity: 1, castsShadow: true })

    store.sync([light])

    const data = store.lightsTexture.image.data as Float32Array
    const lineSize = store.maxLights * 4

    // Row 3, column B (offset +2) = castsShadow flag
    expect(data[3 * lineSize + 2]).toBe(1)
  })

  it('should pack castsShadow=false into row3.b as 0.0', () => {
    const store = new LightStore({ maxLights: 4 })
    const light = new Light2D({ type: 'point', intensity: 1, castsShadow: false })

    store.sync([light])

    const data = store.lightsTexture.image.data as Float32Array
    const lineSize = store.maxLights * 4

    expect(data[3 * lineSize + 2]).toBe(0)
  })

  it('should default castsShadow packing to 1.0 when option omitted', () => {
    const store = new LightStore({ maxLights: 4 })
    const light = new Light2D({ type: 'point', intensity: 1 })

    store.sync([light])

    const data = store.lightsTexture.image.data as Float32Array
    const lineSize = store.maxLights * 4

    expect(data[3 * lineSize + 2]).toBe(1)
  })

  it('should preserve enabled column G when writing castsShadow column B', () => {
    const store = new LightStore({ maxLights: 4 })
    const light = new Light2D({ type: 'point', intensity: 1, castsShadow: false })

    store.sync([light])

    const data = store.lightsTexture.image.data as Float32Array
    const lineSize = store.maxLights * 4

    // Regression guard: column G (enabled) unaffected by the new column B write.
    expect(data[3 * lineSize + 1]).toBe(1)
    expect(data[3 * lineSize + 2]).toBe(0)
  })
```

- [ ] **Step 2: Run tests, confirm they fail**

Run: `pnpm --filter=three-flatland test -- --run src/lights/LightStore.test.ts`

Expected: the 4 new tests fail — `row3.b` is currently hardcoded to `0`, so castsShadow=true/default tests fail. The castsShadow=false test passes by accident (expected 0, got 0), but that's fine; after impl it will still pass.

- [ ] **Step 3: Update LightStore.sync to pack castsShadow**

In `packages/three-flatland/src/lights/LightStore.ts` at line 163-166, change the row 3 write block from:

```ts
      data[3 * lineSize + offset + 0] = lightType
      data[3 * lineSize + offset + 1] = light.enabled ? 1 : 0
      data[3 * lineSize + offset + 2] = 0
      data[3 * lineSize + offset + 3] = 0
```

to:

```ts
      data[3 * lineSize + offset + 0] = lightType
      data[3 * lineSize + offset + 1] = light.enabled ? 1 : 0
      data[3 * lineSize + offset + 2] = light.castsShadow ? 1 : 0
      data[3 * lineSize + offset + 3] = 0
```

Also update the row 3 layout comment in the class docstring at lines 41-47. Replace the existing table with:

```
 * DataTexture layout:
 * | Row | R      | G         | B             | A        |
 * |-----|--------|-----------|---------------|----------|
 * | 0   | posX   | posY      | colorR        | colorG   |
 * | 1   | colorB | intensity | distance      | decay    |
 * | 2   | dirX   | dirY      | angle         | penumbra |
 * | 3   | type   | enabled   | castsShadow   | 0        |
```

- [ ] **Step 4: Run tests, confirm they pass**

Run: `pnpm --filter=three-flatland test -- --run src/lights/LightStore.test.ts`

Expected: all tests pass (17+ tests, 0 failures).

- [ ] **Step 5: Run full test suite**

Run: `pnpm --filter=three-flatland test -- --run`

Expected: all 627+ tests pass. No regressions in Light2D, ForwardPlusLighting, LightEffect, or other lights tests.

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter=three-flatland typecheck`

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/three-flatland/src/lights/LightStore.ts packages/three-flatland/src/lights/LightStore.test.ts
git commit -m "feat(lighting): pack castsShadow into LightStore row3.b

Writes the Light2D.castsShadow flag into the previously-unused column
B of row 3 in the lights DataTexture. DefaultLightEffect will read
row3.b in the next commit to gate the SDF shadow trace.

Layout unchanged (free column, no bit packing). enabled semantics
preserved — castsShadow is an independent gate that only affects
shadow tracing, not light contribution."
```

---

## Task 3: Gate shader shadow trace on `castsShadow`

**Files:**
- Modify: `packages/presets/src/lighting/DefaultLightEffect.ts`

No unit test — TSL fragment code is not unit-testable. Verification via typecheck, full test run, and (manual) dev-server smoke test in Task 5.

- [ ] **Step 1: Add the `castsShadow` read and gate**

In `packages/presets/src/lighting/DefaultLightEffect.ts` at line 137, locate the row3 unpacking:

```ts
          const lightType = row3.r
          const lightEnabled = row3.g
```

Add after that line:

```ts
          const lightCastsShadow = row3.b
```

Then in the `shouldTrace` gate (currently lines 199-201 after the atten-gate change):

```ts
            const shouldTrace = isAmbient.not()
              .and(NdotL.greaterThan(float(0)))
              .and(atten.greaterThan(float(0.01)))
```

Extend to:

```ts
            const shouldTrace = isAmbient.not()
              .and(NdotL.greaterThan(float(0)))
              .and(atten.greaterThan(float(0.01)))
              .and(lightCastsShadow.greaterThan(float(0.5)))
```

Update the surrounding comment (currently at lines 191-198) to mention the new gate. Replace the comment block with:

```ts
          // Shadow. Gated so the 32-tap SDF trace only runs when the
          // fragment actually needs it — ambient lights ignore shadow,
          // fragments with `N·L ≤ 0` are already dark, fragments where
          // `atten × diffuse` is sub-visible can't receive a visible
          // shadow either, and lights marked `castsShadow: false` opt
          // out entirely. All four are runtime GPU gates (not JS), so
          // the trace is physically skipped on those fragments/lights.
          // The `0.01` atten threshold sits below 8-bit channel
          // quantization — a trace we'd skip here couldn't have
          // produced a visible pixel delta. The `0.5` threshold on
          // `lightCastsShadow` is a safe midpoint for the 0/1 float
          // flag packed by LightStore.
```

- [ ] **Step 2: Typecheck presets**

Run: `pnpm --filter=@three-flatland/presets typecheck`

Expected: no errors.

- [ ] **Step 3: Run full test suite**

Run: `pnpm --filter=three-flatland test -- --run`

Expected: all 627+ tests pass. This catches accidental regressions in any Light2D/LightStore test that could have been broken by the upstream changes.

- [ ] **Step 4: Commit**

```bash
git add packages/presets/src/lighting/DefaultLightEffect.ts
git commit -m "perf(lighting): gate shadow trace on per-light castsShadow flag

Reads row3.b from the lights DataTexture and adds a fourth runtime
gate to shouldTrace so the 32-tap SDF trace is skipped for lights
marked castsShadow: false. Complements the ambient, N·L, and atten
gates. For scenes with many cosmetic lights (slime glows, atmospheric
fills), shadow cost collapses to O(casting lights) instead of
O(total lights)."
```

---

## Task 4: Wire `castsShadow={false}` on slime lights in lighting demo

**Files:**
- Modify: `examples/react/lighting/App.tsx`

- [ ] **Step 1: Set `castsShadow={false}` on the per-slime `<light2D>`**

In `examples/react/lighting/App.tsx`, locate the slime light JSX (around lines 923-933):

```tsx
        {slimesRef.current.map((s, i) => (
          <light2D
            key={`slime-light-${i}`}
            ref={(el) => { s.light = el }}
            lightType="point"
            color={0x33ff66}
            intensity={0.25}
            distance={40}
            decay={2}
          />
        ))}
```

Add `castsShadow={false}` as a new prop:

```tsx
        {slimesRef.current.map((s, i) => (
          <light2D
            key={`slime-light-${i}`}
            ref={(el) => { s.light = el }}
            lightType="point"
            color={0x33ff66}
            intensity={0.25}
            distance={40}
            decay={2}
            castsShadow={false}
          />
        ))}
```

Torches (both `fixedLightPositions` and `switchPositions` `<light2D>` blocks above) keep the default `castsShadow=true`. The ambient `<light2D lightType="ambient" ...>` is unaffected by castsShadow — its shadow trace is already gated off by `isAmbient.not()` in the shader.

- [ ] **Step 2: Typecheck the example**

Run: `pnpm --filter=example-react-lighting typecheck`

Expected: no errors. If the package doesn't define a typecheck script, skip to Step 3.

- [ ] **Step 3: Start the dev server**

Run: `pnpm --filter=example-react-lighting dev`

Expected: Vite starts cleanly on its port. If you don't have the example wired up locally, use `pnpm dev` from the repo root to launch the full MPA at http://localhost:5173.

- [ ] **Step 4: Manual smoke test**

In the browser:
1. Navigate to the lighting demo.
2. Open the devtools pane. Set `Slimes.count` to `200`.
3. Confirm: scene renders; slime glows look like soft color bleed on walls but do NOT cast hard shadows of nearby props when slimes move. Torches still cast crisp SDF shadows.
4. Toggle `Slimes.lights` off → slime glows disappear entirely (existing `enabled` behavior still works).
5. Set `Slimes.count` back to 5. Check no visual regression for low-count scenes.

If any visual looks wrong, stop and investigate — a bad row3.b packing would make ALL lights non-shadow-casting (blank shadows everywhere) or ALL casting (no speedup). The most likely failure mode is a sign/threshold error in the shader gate.

- [ ] **Step 5: Run full test suite one more time**

Run: `pnpm --filter=three-flatland test -- --run`

Expected: all 627+ tests pass.

- [ ] **Step 6: Commit**

```bash
git add examples/react/lighting/App.tsx
git commit -m "feat(example-lighting): mark slime glows as non-shadow-casting

Slime lights are cosmetic ambient-atmosphere fills, not scene lights
— they shouldn't realistically cast shadows of nearby props. Setting
castsShadow={false} lets the shader skip the 32-tap SDF trace for
every slime light, which is the dominant cost once count scales past
~100. Torches keep the default (castsShadow: true)."
```

---

## Task 5: Final verification

**Files:** none — verification-only task.

- [ ] **Step 1: Full test suite**

Run: `pnpm --filter=three-flatland test -- --run`

Expected: 627+ tests passing.

- [ ] **Step 2: Typecheck everything touched**

Run these in sequence:

```bash
pnpm --filter=three-flatland typecheck
pnpm --filter=@three-flatland/presets typecheck
```

Expected: both clean.

- [ ] **Step 3: Branch status**

Run: `git log --oneline main..HEAD`

Expected: a chain of commits ending with the three new ones (Light2D field, LightStore packing, shader gate, demo wiring). Confirm commit messages read well as a PR description.

- [ ] **Step 4: Report to user**

Summarize: spec implemented in 4 commits on top of the atten-gate commit. Ready for review / merge.
