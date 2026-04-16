---
"@three-flatland/presets": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

**Light effects:**
- `DefaultLightEffect`: Forward+ tiled point/spot/directional lighting with SDF shadow support; `shadowStrength`, `shadowSoftness`, `shadowBias` uniforms
- `DirectLightEffect`: directional-only lighting with SDF shadows
- `SimpleLightEffect`: ambient-only fallback with no shadow cost
- `RadianceLightEffect`: experimental radiance cascades GI
- `AutoNormalProvider`: derives tangent-space normals from sprite alpha at runtime via `normalFromSprite` TSL; no baked texture required
- `NormalMapProvider`: samples a pre-baked normal map texture

**Shadow wiring:**
- `DefaultLightEffect` and `DirectLightEffect` replace the `shadow = float(1.0)` stub with real `shadowSDF2D` calls when `sdfTexture` is in the build context; ambient lights skip shadowing
- `sdfTexture`, `worldSizeNode`, `worldOffsetNode` threaded through `LightEffectBuildContext`; non-shadow effects compile out the shadow path with no GPU branch

**Package:**
- Added `./react` subpath export
- `@react-three/fiber` declared as optional peer dependency so `ThreeElements` module augmentation resolves in R3F projects

`@three-flatland/presets` ships the full suite of ready-to-use light effects and normal providers, with real SDF-based soft shadows replacing the previous stub.
