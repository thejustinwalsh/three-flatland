---
"@three-flatland/presets": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

## @three-flatland/presets

### New features

- `DefaultLightEffect` — production-ready Forward+ 2D lighting preset with:
  - SDF sphere-trace soft shadows (`shadowStrength`, `shadowSoftness`, `shadowBias`, `shadowStartOffset`)
  - `shadowFilter` option (`auto|nearest|linear`) — crisp pixel-art or smooth edges, auto-selects based on `shadowPixelSnapEnabled`
  - `shadowPixelSize` world-unit origin snap for retro block-shadow look
  - `bands` cel-shading quantization applied before shadow scalar (smooth shadow edges, stepped direct light)
  - `rimIntensity` — rim lighting, inherits same per-pixel shadow ratio as direct
  - Ambient light contribution pipeline
- `NormalMapProvider` — channel provider that wires a normal map texture into the lighting pipeline; works with `SpriteSheetLoader`/`LDtkLoader` auto-bake
- `Light2D.importance` (default `1.0`) — multiplicative ranking bias; set higher on torches/hero lights to resist eviction by dense fill clusters
- `Light2D.category?: string` — fill lights with the same category share an independent slot quota (djb2-hashed to a 2-bit bucket), preventing cross-type eviction artifacts
- Fill-light quota: max 2 fill lights (`castsShadow: false`) per tile, with per-tile luminance compensation scaling to preserve overall brightness when fills are culled
- Per-category compensation: 4 independent fillScale channels per tile meta texel (one per category bucket), selected per-light in the shader
- `./react` subpath export added to `@three-flatland/presets`
- `@react-three/fiber` declared as optional peer dependency so `ThreeElements` augmentation resolves without requiring R3F in server contexts

### Performance

- Forward+ tile size bumped from 16px to 32px — 4x fewer tiles, proportionally cheaper CPU light assignment at high light counts
- Shadow trace gated on per-light `castsShadow` flag — fill lights pay zero SDF trace cost
- Shadow trace skipped when attenuation ≤ 0.01 (sub-8-bit threshold)
- Redundant `lightDir.normalize()` removed from spot-cone math (direction is normalized at set-site)
- Dead `fillScale` tile-meta compensation pass removed (replaced by per-bucket quota path)
- CPU tile bounds now use same stride formula as the shader (`TILE_SIZE / screenSize * worldSize`) — eliminates tile-boundary mismatch checkerboard in dense fill scenes

### Bug fixes

- Shadows routed through post-process pipeline; SDF generation bugs fixed
- Ambient pipeline fixed
- `shadowStartOffset` default raised to 40 to clear knight-scale sprites before signed SDF made the smaller default safe

### Removed

- `DirectLightEffect`, `SimpleLightEffect`, `RadianceLightEffect` removed (moved to follow-up PR)
- `AutoNormalProvider` removed (was never implemented; references cleaned from error messages, docs, and planning)
- Dead `shadowBands`/`shadowBandCurve` uniforms removed (superseded by post-quantization shadow application)
- Per-tile fillScale shader multiply removed (was causing tile-boundary banding)

Delivers a complete, production-ready `DefaultLightEffect` with SDF shadows, Forward+ culling with hero/fill separation, and per-category light quotas for dense scenes.
