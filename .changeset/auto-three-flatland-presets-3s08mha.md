---
"@three-flatland/presets": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

**New package: `@three-flatland/presets`**

- `DefaultLightEffect` — Forward+ tiled lighting with SDF soft shadows; replaces `shadow = float(1.0)` stub with real `shadowSDF2D` sphere-trace, controlled by `shadowStrength`, `shadowSoftness`, `shadowBias`
- `DirectLightEffect` — same shadow wiring as Default, without the Forward+ tile pass (direct per-light loop)
- `SimpleLightEffect` — unlit/minimal lighting preset
- `RadianceLightEffect` — Radiance Cascades GI preset (WIP)
- `AutoNormalProvider` — material effect that provides the `normal` channel from sprite alpha at runtime
- `NormalMapProvider` — material effect that provides the `normal` channel from a `NormalMapLoader`-loaded baked texture
- `./react` subpath export for R3F component and hook access
- `@react-three/fiber` declared as optional peer dependency so the `ThreeElements` augmentation resolves without requiring R3F in non-React projects

**SDF shadow wiring (T5/T7)**

- `LightEffectBuildContext` carries `sdfTexture`, `worldSizeNode`, `worldOffsetNode` — effects bind these at shader-build time for stable TSL texture node references across resize
- Effects that do not declare `needsShadows` compile out the shadow path entirely (no GPU branch, no wasted uniform slot)
- `shadowStrength`, `shadowSoftness`, `shadowBias` uniform properties on `DefaultLightEffect` and `DirectLightEffect`

This package ships ready-to-use lighting effects for the Flatland 2D lighting pipeline; pair with `@three-flatland/nodes` for custom effect authoring.
