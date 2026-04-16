---
"@three-flatland/presets": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

**New lighting effect presets**

- `DefaultLightEffect`: Forward+ tiled point lights with JFA-based SDF soft shadows and ambient support
- `DirectLightEffect`: single directional light with SDF soft shadows
- `SimpleLightEffect`: flat ambient-only, no shadow cost
- `RadianceLightEffect`: experimental radiance cascades GI preset (WIP)
- `AutoNormalProvider`: MaterialEffect that computes per-sprite normals at runtime via `normalFromSprite` TSL
- `NormalMapProvider`: MaterialEffect that loads pre-baked `.normal.png` via `NormalMapLoader` with runtime fallback

**SDF shadow wiring (T7)**
- `shadow = float(1.0)` stub replaced with real `shadowSDF2D` call in `DefaultLightEffect` and `DirectLightEffect`
- `shadowStrength` (0–1), `shadowSoftness` (penumbra width), `shadowBias` (self-shadow start offset) are configurable
- Ambient light contributions skip shadow computation, preserving ambient semantics

**Package**
- `./react` subpath export added
- `@react-three/fiber` declared as optional peer dependency so `ThreeElements` augmentation resolves without requiring R3F

`@three-flatland/presets` provides ready-to-use lighting effects covering the full range from simple ambient to SDF soft shadows, all wired into the Flatland ECS pipeline.
