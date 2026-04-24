---
"@three-flatland/presets": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

**Lighting effects (new)**
- `DefaultLightEffect` — full tiled-forward+ lighting with SDF soft shadows, cel-banding, rim lighting, ambient, and per-light `castsShadow` gating
- `DirectLightEffect` — directional lighting with SDF shadow trace
- `./react` subpath export added; `@react-three/fiber` declared as optional peer dep so `ThreeElements` augmentation resolves without hard dependency

**Shadow pipeline**
- `shadowSDF2D` wired into `DefaultLightEffect` and `DirectLightEffect`; the `shadow = float(1.0)` stub is replaced with a real trace gated by `sdfTexture` availability
- `shadowStartOffset` uniform: tunable self-shadow escape (replaces hardcoded 40); subsequently replaced by per-sprite `shadowRadius` (see below)
- `shadowStartOffsetScale` (default 1.0): per-effect multiplier on the per-instance `shadowRadius`
- Shadow trace gated on attenuation (`atten <= 0.01` skipped), per-light `castsShadow` flag, ambient type, and N·L — O(casting lights) cost in dense scenes
- Shadow applied after cel-band quantization so stair-steps land on the direct gradient, not the shadow edge; rim lighting inherits the same per-pixel shadow ratio

**Performance**
- Redundant `lightDir.normalize()` removed from spot cone math — direction is normalized at every set-site
- `shadowBands` / `shadowBandCurve` uniforms removed (obsoleted by post-quantization shadow approach)

**Removed / cleaned up**
- `AutoNormalProvider`, `NormalMapProvider`, `TileNormalProvider` removed (superseded by `@three-flatland/normals`)
- Unused imports and providers pruned across `DefaultLightEffect`, `DirectLightEffect`, and `index.ts`

**Instance attribute helpers**
- `NormalMapProvider.channelNode` migrated off raw `attribute(...)` reads to `readFlip()` typed helper

`@three-flatland/presets` now ships fully wired lighting effects with SDF soft shadows, per-light shadow gating, and correct cel-band / shadow interaction out of the box.
