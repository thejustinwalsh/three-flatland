---
"@three-flatland/presets": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

**Lighting effect presets**

- `SimpleLightEffect`, `DefaultLightEffect`, `DirectLightEffect`, `RadianceLightEffect` — ready-to-use 2D lighting strategies exported from `@three-flatland/presets/lighting`
- `AutoNormalProvider` — MaterialEffect that automatically derives normals from sprite alpha at runtime; `NormalMapProvider` — loads baked `.normal.png` textures
- React subpath: `@three-flatland/presets/react` exports JSX-compatible lighting components
- `@react-three/fiber` declared as an optional peer dep so the `ThreeElements` augmentation resolves without requiring R3F in vanilla projects

**SDF shadow integration**

- `DefaultLightEffect` and `DirectLightEffect` now call `shadowSDF2D` for real soft shadows; the `shadow = float(1.0)` stub is replaced
- Shadow strength, softness, and bias are configurable per-effect via `LightEffectBuildContext`
- World-bound uniforms (`worldSizeNode`, `worldOffsetNode`) threaded through the build context; effects no longer need to compute their own world↔UV mapping

`@three-flatland/presets` provides drop-in lighting effects with SDF soft shadows, normal providers, and full React integration out of the box.
