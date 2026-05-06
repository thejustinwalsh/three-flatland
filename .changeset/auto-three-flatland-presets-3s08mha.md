---
"@three-flatland/presets": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

**New lighting effect presets:**
- `DefaultLightEffect`: Forward+ tiled lighting with SDF sphere-traced soft shadows
- `DirectLightEffect`: direct-only lighting with SDF soft shadows
- `SimpleLightEffect`: ambient-only, no shadow computation
- `RadianceLightEffect`: radiance cascades GI (experimental)
- `AutoNormalProvider`: material effect that derives normals from sprite alpha at runtime
- `NormalMapProvider`: material effect that binds a pre-baked normal map texture
- All presets exported from both `@three-flatland/presets` and `@three-flatland/presets/react`

**SDF shadow integration (T5 + T7):**
- `LightEffectBuildContext` gains `sdfTexture`, `worldSizeNode`, `worldOffsetNode` for build-time shader capture
- `DefaultLightEffect` and `DirectLightEffect` now call `shadowSDF2D` — the `shadow = float(1.0)` stub is removed
- Shadow strength, softness, and bias are configurable per effect instance
- `sdfTexture` is `null` for non-shadow effects; shader compiles out the shadow branch via a JS-level guard

**Package changes:**
- Added `./react` subpath export
- `@react-three/fiber` declared as optional peer dependency so `ThreeElements` augmentation resolves without a hard R3F dep

Adds ready-to-use lighting presets (`DefaultLightEffect`, `DirectLightEffect`, `SimpleLightEffect`) and normal providers with SDF soft shadow integration now active in the two primary presets.
