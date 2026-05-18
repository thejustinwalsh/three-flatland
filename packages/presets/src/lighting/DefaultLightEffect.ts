import { Vector2 } from 'three'
import { vec2, vec3, vec4, float, int, Fn, Loop, If, Break } from 'three/tsl'
import type Node from 'three/src/nodes/core/Node.js'
import {
  createLightEffect,
  ForwardPlusLighting,
  MAX_LIGHTS_PER_TILE,
  TILE_SIZE,
  readCastShadowFlag,
  readShadowRadius,
} from 'three-flatland'
import type { Light2D } from 'three-flatland'
import { shadowSDF2D } from '@three-flatland/nodes/lighting'

/**
 * Default lighting with Forward+ tiling: per-tile light culling gives
 * O(lights_per_tile) per fragment instead of O(total_lights).
 *
 * Full feature set:
 * - Point, spot, directional, and ambient light types
 * - Configurable attenuation (distance, decay)
 * - Normal-based directional diffuse shading (when normal channel is provided)
 * - Optional discrete banding (cel-shading)
 * - Optional pixel-snapping for retro aesthetics
 * - Optional glow (broad secondary falloff)
 * - Optional rim lighting (edge highlights from light direction)
 * - SDF-traced soft shadows
 *
 * @example
 * ```typescript
 * import { DefaultLightEffect } from '@three-flatland/presets'
 *
 * const lighting = new DefaultLightEffect()
 * flatland.setLighting(lighting)
 * lighting.bands = 4 // cel-shading
 * ```
 */
const _DefaultLightEffect = createLightEffect({
  name: 'defaultLight',
  schema: {
    // Uniforms (runtime-settable, TSL nodes)
    shadowStrength: 0.6,
    // Hit epsilon (world units) — SDF sample values below this count as
    // an occluder strike, terminating the trace.
    shadowBias: 0.5,
    // Multiplier on each sprite's per-instance `shadowRadius`
    // (auto-resolved to `max(scale.x, scale.y)` or user-overridden)
    // when the sphere-trace origin sits inside that sprite's
    // silhouette. The per-instance radius already sizes the escape to
    // the caster, so 1.0 is correct for the common case; nudge above
    // 1.0 if you see residual self-shadow (e.g., elongated sprites
    // where worst-case diagonal exit exceeds max-side), or below 1.0
    // if the default over-pushes past nearby occluders.
    shadowStartOffsetScale: 1,
    // Max world-space distance a shadow is allowed to extend from the
    // receiver before fading to lit. 0 disables falloff (binary shadow at
    // any distance). Typical values: 100-300 world units — enough to keep
    // near-caster shadows solid while hiding cone-fan artifacts far away
    // from the caster.
    shadowMaxDistance: 0,
    // Snap the shadow trace's surface position to a world-unit block grid.
    // 0 = off (per-fragment trace). 1/2/4/8 = blocky shadow silhouettes
    // where every fragment in that many world-unit block traces from the
    // same origin and therefore receives the same shadow. Independent of
    // the `pixelSize` uniform, which snaps everything — this only
    // chunkifies shadows. Purely aesthetic; does NOT reduce GPU cost.
    shadowPixelSize: 0,
    bands: 8,
    pixelSize: 0,
    glowRadius: 0,
    glowIntensity: 0,
    lightHeight: 0.75,
    rimIntensity: 0,
    // ── Scene-style compile-time constants ──────────────────────────
    // These gate optional shader code paths via JS-time `if`s in the
    // build function. Setting them re-emits the lighting shader, so
    // toggling at runtime is fine for dev tuning but hitchy. The
    // payoff is real: the dead branches never reach the GPU, so a
    // scene that doesn't use glow/rim/snap pays zero ops for them.
    /**
     * Enable broad-falloff "glow" added to point/spot attenuation.
     * Off by default — saves ~9 ops per light per fragment when off
     * (no `useGlow.select`, no broad-atten chain). When on, the
     * `glowRadius` and `glowIntensity` uniforms tune the look.
     */
    glowEnabled: () => false,
    /**
     * Enable rim-lighting accumulator. Off by default — saves ~6 ops
     * per light per fragment plus drops the `pow(1-NdotL, 2)` from
     * the inner loop. When on, `rimIntensity` tunes the strength.
     * Rim power is fixed at 2 (a single multiply); the prior
     * `rimPower` uniform was removed because no realistic project
     * needs to slide it at runtime.
     */
    rimEnabled: () => false,
    /**
     * Enable surface-position snapping for the lighting math (cel-
     * style chunky cells). Off by default — saves ~4 ops per
     * fragment when off. When on, the `pixelSize` uniform sets the
     * cell width.
     */
    pixelSnapEnabled: () => false,
    /**
     * Enable surface-position snapping for the shadow trace origin.
     * Off by default — saves ~4 ops per shadow trace when off. When
     * on, the `shadowPixelSize` uniform sets the cell width.
     */
    shadowPixelSnapEnabled: () => false,
    /**
     * Enable cel-band quantization of the direct-light contribution.
     * On by default (matches typical Flatland aesthetic). Saves ~5
     * ops per fragment when off. When on, the `bands` uniform sets
     * the count.
     *
     * **Brightness perception note**: the cel formula
     * `floor(x*N + 0.5)/N` is mean-preserving over `[0,1]` but
     * specifically rounds mid-tones up to the next quantization step.
     * That boost is *visible* (mid-tones popping) while the
     * compensating darkenings happen at very low values where they
     * read as "still black." Net perceptual effect: cel mode looks
     * BRIGHTER than smooth mode for the same physical scene values.
     * Disabling cel reveals the actual physical math, which can read
     * as "dimmer" — that's the calibration you implicitly built up
     * with cel on. If you want intensity parity across the toggle,
     * raise scene intensities (torches, slime fills, ambient) to
     * compensate; the smooth branch is doing nothing wrong, the cel
     * branch was just inflating mid-tones.
     */
    bandsEnabled: () => true,
    // Constants (per-instance, read-only reference, mutable internals)
    forwardPlus: () => new ForwardPlusLighting(),
  } as const,
  needsShadows: true,
  requires: ['normal', 'elevation'] as const,
  light: ({ uniforms, constants, lightStore, sdfTexture, worldSizeNode, worldOffsetNode }) => {
    const shadowStrength = uniforms.shadowStrength
    const shadowBias = uniforms.shadowBias
    const shadowStartOffsetScale = uniforms.shadowStartOffsetScale
    const shadowMaxDistance = uniforms.shadowMaxDistance
    const shadowPixelSize = uniforms.shadowPixelSize
    const bands = uniforms.bands
    const pixelSize = uniforms.pixelSize
    const glowRadius = uniforms.glowRadius
    const glowIntensity = uniforms.glowIntensity
    const lightHeight = uniforms.lightHeight
    const rimIntensity = uniforms.rimIntensity

    // Compile-time toggles — bind once here so the build function's
    // JS branches read the same values throughout.
    const glowEnabled = constants.glowEnabled
    const rimEnabled = constants.rimEnabled
    const pixelSnapEnabled = constants.pixelSnapEnabled
    const shadowPixelSnapEnabled = constants.shadowPixelSnapEnabled
    const bandsEnabled = constants.bandsEnabled

    const fp = constants.forwardPlus
    const tileLookup = fp.createTileLookup()
    // The shader currently ignores `tileMetaLookup` (per-tile fill
    // compensation). Per-tile fillScale produced visible tile-aligned
    // brightness steps at fill-quota saturation boundaries — fixing
    // it cleanly needs temporal accumulation (history RT) we don't
    // have yet. ForwardPlusLighting still computes the values CPU-
    // side and writes them into the tile meta texel for devtools
    // inspection + future hookup of a smooth (e.g., bilinear or
    // temporally-filtered) compensation path.

    return (ctx) => {
      return Fn(() => {
        const rawPos = ctx.worldPosition
        // JS-time gate. When `pixelSnapEnabled` is false, the snap
        // math doesn't reach the shader at all — a scene without
        // pixel-snapped lighting pays zero ops here.
        //
        // `pixelSize.max(1)` guards against a transitional frame
        // where the slider has hit 0 (driving the JS gate to false)
        // but the old pipeline (still gated true) is still bound on
        // the GPU. Without the guard, `div(0)` produces NaN for the
        // few frames before WebGPU finishes compiling the new
        // pipeline, and NaN on dynamically-buffered meshes (sprites)
        // sticks bind state black even after the new pipeline lands.
        // Same pattern below for `shadowPixelSize`, `bands`, and
        // `glowRadius` — all divisors that the slider can drive to
        // zero exactly when the gate flips.
        const surfacePos = pixelSnapEnabled
          ? vec2(rawPos).div(pixelSize.max(float(1))).floor().mul(pixelSize)
          : vec2(rawPos)
        // Two direct-light accumulators. `totalLightLit` ignores shadow
        // (so `bands` quantization below can stair-step the direct
        // gradient without stepping the shadow edge); `totalLightShaded`
        // includes per-light shadow. The ratio recovers a per-pixel
        // shadow scalar that is applied AFTER cel-band quantization.
        const totalLightLit = vec3(0, 0, 0).toVar('totalLightLit')
        const totalLightShaded = vec3(0, 0, 0).toVar('totalLightShaded')
        // Rim accumulator is only needed when rim is enabled at build
        // time. Skipping the var when off avoids both the per-light
        // accumulation and the final `useRim.select` mix.
        const totalRim = rimEnabled ? vec3(0, 0, 0).toVar('totalRim') : null

        // Compute tile index from world position
        const screenPos = surfacePos
          .sub(fp.worldOffsetNode)
          .div(fp.worldSizeNode)
          .mul(fp.screenSizeNode)
        const tileX = int(screenPos.x.div(float(TILE_SIZE)).floor())
        const tileY = int(screenPos.y.div(float(TILE_SIZE)).floor())
        const tileIndex = tileY.mul(fp.tileCountXNode).add(tileX)

        Loop(MAX_LIGHTS_PER_TILE, ({ i }: { i: Node<'int'> }) => {
          const lightId = tileLookup(tileIndex, i)
          If(lightId.equal(int(0)), () => {
            Break()
          })

          const idx = float(lightId.sub(int(1)))
          const { row0, row1, row2, row3 } = lightStore.readLightData(idx)

          const lightPos = vec2(row0.r, row0.g)
          const lightColor = vec3(row0.b, row0.a, row1.r)
          const lightIntensityVal = row1.g
          const lightDistance = row1.b
          const lightDecay = row1.a
          const lightDir = vec2(row2.r, row2.g)
          const lightAngle = row2.b
          const lightPenumbra = row2.a
          const lightType = row3.r
          const lightEnabled = row3.g
          const lightCastsShadow = row3.b

          const contribution = lightColor.mul(lightIntensityVal).mul(lightEnabled)

          // Point light attenuation
          const effectiveDistance = lightDistance.greaterThan(float(0)).select(lightDistance, float(1e6))
          const toLight = lightPos.sub(vec2(surfacePos))
          const dist = toLight.length()
          const normalizedDist = dist.div(effectiveDistance).clamp(0, 1)
          const sharpAtten = float(1).sub(normalizedDist.pow(lightDecay)).clamp(0, 1)

          // Broad glow — JS-time gate. When disabled, the entire
          // broad-falloff chain (div, sub, clamps, the select) is
          // dropped from the shader — biggest single per-light win
          // when off because it's ~9 ops × N lights × every fragment.
          // `glowRadius.max(1e-3)` keeps the divisor non-zero across
          // the transitional frame where the slider has hit 0 but
          // the old pipeline (with glowEnabled=true baked in) is
          // still bound. See the pixelSnap comment above for full
          // context on the NaN-window failure mode.
          let pointAtten: typeof sharpAtten
          if (glowEnabled) {
            const safeGlowRadius = glowRadius.max(float(1e-3))
            const glowDist = dist.div(effectiveDistance.mul(safeGlowRadius)).clamp(0, 1)
            const broadAtten = float(1).sub(glowDist).clamp(0, 1)
            pointAtten = sharpAtten.add(broadAtten.mul(glowIntensity)).clamp(0, 1)
          } else {
            pointAtten = sharpAtten
          }

          // Spot light cone. `lightDir` is already normalized at the
          // JS layer (Light2D `_direction` is normalized on every set,
          // and RGBA32F upload preserves the unit-length invariant),
          // so we skip a redundant per-fragment per-light normalize.
          const toSurfaceNorm = vec2(surfacePos).sub(lightPos).normalize()
          const spotCos = toSurfaceNorm.dot(lightDir)
          const innerCos = lightAngle.cos()
          const outerCos = lightAngle.add(lightPenumbra).cos()
          const coneAtten = spotCos.sub(outerCos).div(innerCos.sub(outerCos)).clamp(0, 1)

          // Select attenuation by type
          const isPoint = lightType.lessThan(float(0.5))
          const isSpot = lightType.greaterThan(float(0.5)).and(lightType.lessThan(float(1.5)))
          const atten = isPoint.select(pointAtten, isSpot.select(pointAtten.mul(coneAtten), float(1)))

          // Normal-based directional diffuse shading. Ambient lights skip
          // the N·L gate entirely.
          //
          // Per-fragment elevation lowers `L.z` by the fragment's height
          // above the ground plane — a torch at `lightHeight = 0.75`
          // targeting a wall cap at `elevation = 1.0` sees L.z = -0.25,
          // so N·L with `N = (0, 0, 1)` goes negative → clamped to 0 →
          // cap receives no direct light (only ambient).
          //
          // `dist.max(0.0001)` guards fragment-at-light coincidence. Using
          // `toLight / dist` avoids the redundant 2D normalize we'd
          // otherwise do before building the 3D direction.
          const safeDist = dist.max(float(0.0001))
          const toLightN = toLight.div(safeDist)
          const lightDir3D = vec3(
            toLightN,
            lightHeight.sub(ctx.elevation)
          ).normalize()
          const isAmbient = lightType.greaterThan(float(2.5))
          const NdotL = ctx.normal.dot(lightDir3D).clamp(0, 1)
          const diffuse = isAmbient.select(float(1), NdotL)

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
          const shadow = float(1).toVar('shadow')
          if (sdfTexture) {
            const shouldTrace = isAmbient.not()
              .and(NdotL.greaterThan(float(0)))
              .and(atten.greaterThan(float(0.01)))
              .and(lightCastsShadow.greaterThan(float(0.5)))
            If(shouldTrace, () => {
              // Optional block-snap on the shadow trace origin —
              // JS-time gate, see `shadowPixelSnapEnabled` schema doc.
              // `.max(1)` divisor guard, same NaN-window rationale
              // as `pixelSnapEnabled` above.
              const shadowSurfacePos = shadowPixelSnapEnabled
                ? vec2(surfacePos)
                    .div(shadowPixelSize.max(float(1)))
                    .floor()
                    .mul(shadowPixelSize)
                : vec2(surfacePos)
              const trace = shadowSDF2D(
                shadowSurfacePos,
                lightPos,
                sdfTexture,
                worldSizeNode,
                worldOffsetNode,
                {
                  eps: shadowBias,
                  // Per-instance occluder radius × effect-level
                  // multiplier. The radius auto-tracks each sprite's
                  // scale (so the knight uses ~64 and the slime uses
                  // ~32 without manual tuning); the multiplier is a
                  // scene-wide fine-tune.
                  startOffset: readShadowRadius().mul(shadowStartOffsetScale),
                  fragmentCastsShadow: readCastShadowFlag(),
                  maxShadowDistance: shadowMaxDistance,
                }
              )
              // Attenuate by shadowStrength (lerp lit → trace).
              shadow.assign(float(1).sub(float(1).sub(trace).mul(shadowStrength)))
            })
          }

          const baseContribution = contribution.mul(atten).mul(diffuse)
          // Fill-quota dedup may cull some `castsShadow: false` lights
          // when a tile saturates its per-category bucket; the CPU
          // tracks per-tile/per-category in-range vs kept counts and
          // writes a `fillScale` to the tile meta texel for future
          // temporal compensation. Not consumed here — applying a
          // per-tile scale produces visible tile-aligned brightness
          // steps at quota boundaries without history-buffer
          // accumulation to smooth them. Kept lights contribute their
          // natural amount; culled lights are absent. Net effect: a
          // small, smooth dimming in dense fill clusters rather than a
          // checkerboard.
          totalLightLit.addAssign(baseContribution)
          totalLightShaded.addAssign(baseContribution.mul(shadow))

          // Rim lighting — JS-time gate. When disabled, the entire
          // rim accumulator + the `pow` (SFU instruction) drops out
          // of the shader. When enabled, `rimPower` is hardcoded to 2
          // — a single multiply instead of `pow(x, 2)` — because no
          // realistic project sliders this at runtime. If you need a
          // different curve, fork the effect.
          if (rimEnabled && totalRim) {
            const oneMinusNdotL = float(1).sub(NdotL)
            const rimFactor = isAmbient.select(
              float(0),
              oneMinusNdotL.mul(oneMinusNdotL),
            )
            totalRim.addAssign(contribution.mul(atten).mul(rimFactor))
          }
        })

        // Build the unshadowed direct contribution (lit + rim). This
        // is what `bands` quantizes against — so cel-banding steps the
        // direct-light gradient, and the shadow edge is applied
        // separately below after quantization.
        //
        // Note: because the per-pixel shadow scalar is recovered from
        // the lit/shaded ratio (see below) and applied to the full
        // bundle, rim lighting now inherits the same shadow as direct.
        // Previously rim was unshadowed. Rim is opt-in (default
        // `rimIntensity = 0`), so this change is only visible in
        // scenes that explicitly enable it.
        // JS-time gate on rim — when disabled, no rim accumulator
        // exists so the mix collapses to a passthrough.
        const directLit = rimEnabled && totalRim
          ? vec3(totalLightLit).add(vec3(totalRim).mul(rimIntensity))
          : vec3(totalLightLit)

        // Quantize the unshadowed direct to discrete bands. Ambient
        // is added AFTER quantization so it acts as a continuous
        // floor; shadow is applied AFTER quantization so the shadow
        // gradient stays smooth even with `bands > 0`. JS-time gate —
        // off-builds skip the entire mul/add/floor/div chain.
        // `bands.max(1)` divisor guard, same NaN-window rationale
        // as `pixelSnapEnabled` above.
        const shapedDirect = bandsEnabled
          ? directLit.mul(bands).add(float(0.5)).floor().div(bands.max(float(1)))
          : directLit

        // Per-pixel shadow scalar, recovered as the ratio of shadowed
        // to unshadowed per-light direct light. Weighted by each
        // light's contribution, so a brighter light dominates the
        // ratio. Clamped to [0, 1] because shadow is strictly
        // attenuating; `max(epsilon)` guards the divide-by-zero on
        // fragments with no direct contribution.
        const shadowRatio = vec3(totalLightShaded)
          .div(vec3(totalLightLit).max(vec3(1e-6)))
          .clamp(0, 1)
        const shadedDirect = shapedDirect.mul(shadowRatio)

        const litColor = shadedDirect.add(fp.ambientNode).mul(ctx.color.rgb)
        return vec4(litColor, ctx.color.a)
      })() as Node<'vec4'>
    }
  },
  init(ctx) {
    const size = ctx.renderer.getSize(new Vector2())
    this.forwardPlus.init(size.x, size.y)
  },
  update(ctx) {
    this.forwardPlus.setWorldBounds(ctx.worldSize, ctx.worldOffset)
    this.forwardPlus.update(ctx.lights as Light2D[], ctx.lightStore.maxLights)
  },
  resize(w, h) {
    this.forwardPlus.resize(w, h)
  },
  dispose() {
    this.forwardPlus.dispose()
  },
})

/**
 * Per-instance backing for the `categoryQuotas` accessor below. Held
 * off-instance via `WeakMap` so we don't trample the schema-driven
 * property layout the factory installs on the prototype.
 */
const _categoryQuotas = new WeakMap<object, Record<string, number>>()

/**
 * Declarative per-category fill-light quota. Property accessor on
 * every `DefaultLightEffect` instance — assigning a record proxies
 * each `[category, quota]` pair through to
 * `forwardPlus.setFillQuota(category, quota)`. Lets JSX consumers
 * write
 *
 * ```tsx
 * <defaultLightEffect categoryQuotas={{ slime: 4 }} />
 * ```
 *
 * instead of grabbing a ref and reaching into `forwardPlus`.
 *
 * Each set RESETS all buckets to default first, then applies the
 * record. Without this, removing a key between renders (e.g.
 * `{ slime: 4 }` → `{}`) would leave the previous quota stuck — the
 * surprise is way worse than the cost of one extra `Uint8Array.fill`.
 */
Object.defineProperty(_DefaultLightEffect.prototype, 'categoryQuotas', {
  get(this: object): Record<string, number> {
    return _categoryQuotas.get(this) ?? {}
  },
  set(
    this: { forwardPlus: ForwardPlusLighting },
    value: Record<string, number> | undefined,
  ): void {
    const next = value ?? {}
    _categoryQuotas.set(this as unknown as object, next)
    this.forwardPlus.resetFillQuotas()
    for (const k of Object.keys(next)) {
      this.forwardPlus.setFillQuota(k, next[k]!)
    }
  },
  enumerable: true,
  configurable: true,
})

/**
 * Public class type — augments the factory-generated class with the
 * `categoryQuotas` instance field so JSX (`LightEffectElement<...>`)
 * sees it as a settable prop and TypeScript users get a typed setter.
 *
 * Only the constructor return type needs to carry the addition;
 * `InstanceType<typeof DefaultLightEffect>` is what R3F's
 * `ThreeElement<T>` reads to surface props in JSX. The `prototype`
 * field on `LightEffectClass<S>` is implicit `any` (the factory
 * doesn't declare it), so intersecting it would leave us with
 * `any & { categoryQuotas }` — the lint rule rightfully flags that
 * as redundant. Augmenting only the construct signature avoids it.
 */
type DefaultLightEffectClass = typeof _DefaultLightEffect & {
  new (): InstanceType<typeof _DefaultLightEffect> & { categoryQuotas: Record<string, number> }
}
export const DefaultLightEffect = _DefaultLightEffect as DefaultLightEffectClass
