---
"@three-flatland/presets": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

**New lighting preset effects and providers for the 2D pipeline**

- `DefaultLightEffect`: full Forward+ tiled lighting with per-sprite normals and SDF soft shadows
- `DirectLightEffect`: simpler direct lighting without tiling, supports SDF shadows
- `SimpleLightEffect`: ambient + single directional light, no shadows
- `RadianceLightEffect`: radiance cascades GI strategy (WIP)
- `AutoNormalProvider`: `MaterialEffect` that derives tangent-space normals from sprite alpha at runtime via `normalFromSprite`
- `NormalMapProvider`: `MaterialEffect` that reads normals from a pre-baked `.normal.png` via `NormalMapLoader`
- `DefaultLightEffect` and `DirectLightEffect` replace `shadow = float(1.0)` stub with real `shadowSDF2D` sphere-trace; `shadowStrength`, `shadowSoftness`, `shadowBias` controls; ambient lights skip shadows
- `LightEffectBuildContext` now carries `sdfTexture`, `worldSizeNode`, `worldOffsetNode` — effects bind SDF and world-bounds uniforms at shader build time, stable across resize
- Added `./react` subpath export for R3F consumers (`ThreeElements` augmentation resolves correctly)
- `@react-three/fiber` declared as optional peer dep

Provides ready-to-use lighting effect presets that compose with Flatland's ECS pipeline, from simple ambient-only to full tiled Forward+ with SDF soft shadows.
