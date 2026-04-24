---
"@three-flatland/presets": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

### DefaultLightEffect

- Real SDF shadow tracing via `shadowSDF2D`; `shadow = float(1.0)` stub replaced
- Per-light `castsShadow` gate: shadow trace skipped for lights with `castsShadow: false`, reducing cost to O(casting lights) in dense scenes
- Attenuation gate: shadow trace skipped when `atten <= 0.01` (sub-visible contribution)
- Shadow applied after cel-band quantization; fixes stepped shadow artifact when `bands > 0`; rim lighting inherits the same per-pixel shadow ratio
- `shadowStartOffset` uniform (default 40 world units) for tunable self-shadow escape; split from `shadowBias` (IQ hit epsilon)
- `shadowStartOffsetScale` replaces the scene-wide `shadowStartOffset` uniform — a per-instance multiplier on the sprite's own `shadowRadius`
- `shadowPixelSize`, `bands`, `bandCurve` uniforms for retro/cel look
- Removed `shadowBands` / `shadowBandCurve` (obsoleted by post-quantization shadow path)
- `lightDir.normalize()` dropped from spot cone shader (direction is pre-normalized at every set-site)
- World bounds sourced from `LightEffectBuildContext` for consistency with `DirectLightEffect`

### DirectLightEffect

- `shadowSDF2D` wired via build context `sdfTexture`; ambient lights skip shadow trace

### Provider cleanup

- Removed `AutoNormalProvider`, `NormalMapProvider`, `TileNormalProvider`, `SimpleLightEffect`, `RadianceLightEffect` — superseded by the descriptor-based normal pipeline and consolidated lighting effects
- `@three-flatland/presets` gains a `./react` subpath export; `@react-three/fiber` declared as optional peer dep so `ThreeElements` augmentation resolves in non-R3F packages

`DefaultLightEffect` now produces correct soft shadows with cel-band compatibility and per-light shadow opt-out, at a fraction of the previous uniform cost.
