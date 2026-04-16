---
"@three-flatland/presets": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

**New lighting preset effects:**
- `DefaultLightEffect`: Forward+ tiled lit effect with ambient, point, spot, and directional light support; real SDF soft shadows replace the previous `float(1.0)` stub; `shadowStrength`, `shadowSoftness`, `shadowBias` controls
- `DirectLightEffect`: direct-only lit effect with the same SDF shadow integration
- `SimpleLightEffect`, `RadianceLightEffect`: additional lighting strategies
- `AutoNormalProvider`: MaterialEffect that derives normals from sprite alpha at runtime
- `NormalMapProvider`: MaterialEffect that binds a pre-baked normal texture

**Shadow wiring:**
- `LightEffectBuildContext` extended with `sdfTexture`, `worldSizeNode`, `worldOffsetNode`; effects bind the SDF texture at shader-build time (reference stable across resize)
- `Flatland.setLighting` eagerly allocates `SDFGenerator` + `OcclusionPass` before calling `buildLightFn` when `needsShadows = true`

**Package:**
- `./react` subpath export added
- `@react-three/fiber` declared as optional peer dependency so the `ThreeElements` module augmentation resolves without requiring R3F in every consumer

`@three-flatland/presets` ships a complete set of production-ready 2D light effects with real SDF-based soft shadows and normal-map support wired end-to-end.
