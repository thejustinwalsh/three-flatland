---
"@three-flatland/presets": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

**New lighting effect presets**

- `SimpleLightEffect` — ambient + diffuse lighting with no shadows
- `DefaultLightEffect` — Forward+ tiled point/directional lights with SDF soft shadows; replaces the `shadow = 1.0` stub with a real `shadowSDF2D` sphere-trace
- `DirectLightEffect` — single-direction lit effect; also wires `shadowSDF2D` for SDF shadows
- `RadianceLightEffect` — experimental Radiance Cascades GI effect (WIP)
- `AutoNormalProvider` — MaterialEffect that generates tangent-space normals from sprite alpha at runtime via `normalFromSprite`
- `NormalMapProvider` — MaterialEffect that provides a pre-baked normal map texture

**API**

- `./react` subpath export added; `@react-three/fiber` declared as an optional peer dependency so the `ThreeElements` augmentation resolves without requiring R3F in non-React projects
- Shadow parameters exposed on `DefaultLightEffect` / `DirectLightEffect`: `shadowStrength`, `shadowSoftness`, `shadowBias`
- World-bound uniforms (`worldSizeNode`, `worldOffsetNode`) sourced from `LightEffectBuildContext` — no longer per-effect constants

This release ships production-ready lighting presets with SDF-based soft shadows wired end-to-end.
