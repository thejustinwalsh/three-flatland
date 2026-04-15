---
"@three-flatland/presets": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

## New lighting effects

- `DefaultLightEffect` — Forward+ tiled point lights with SDF soft shadows; `needsShadows = true`
- `DirectLightEffect` — directional light with SDF soft shadows; `needsShadows = true`
- `SimpleLightEffect` — ambient + flat diffuse shading, no shadows
- `RadianceLightEffect` — radiance cascades GI (WIP)
- `AutoNormalProvider` — MaterialEffect that derives per-sprite normals from alpha at runtime via `normalFromSprite` TSL node
- `NormalMapProvider` — MaterialEffect that sources normals from a baked `.normal.png` texture

## `./react` subpath

- All effects exported as R3F JSX-compatible components from `@three-flatland/presets/react`
- `@react-three/fiber` declared as optional peer dependency so `ThreeElements` augmentation resolves

## SDF shadow wiring

- `sdfTexture`, `worldSizeNode`, and `worldOffsetNode` threaded through `LightEffectBuildContext`; effects bind them at shader-build time for stable TSL texture node references across resizes
- `DefaultLightEffect` and `DirectLightEffect` replace the `shadow = float(1.0)` stub with a real `shadowSDF2D` call; controlled by `shadowStrength`, `shadowSoftness`, and `shadowBias` uniforms
- Ambient lights skip shadow sampling (preserved semantics)

Adds production-ready preset lighting effects with real SDF soft shadows, a `./react` subpath for R3F, and normal-map MaterialEffect providers.
