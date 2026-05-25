---
"@three-flatland/presets": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

- `DefaultLightEffect`: full 2D shadow pipeline via sphere-traced signed SDF — replaces `shadow = 1.0` stub; wires `shadowSDF2D` from `@three-flatland/nodes`
- `shadowFilter` option (`auto|nearest|linear`): auto picks nearest when `shadowPixelSnapEnabled`, linear otherwise; controls SDF + blur RT sampling (JFA stays nearest)
- `shadowBias` and `shadowStartOffset` now independently control the IQ hit-epsilon and the self-shadow escape offset; `shadowStartOffset` superseded by per-sprite `shadowRadius` in `three-flatland`
- `shadowStartOffsetScale` multiplier replaces the old scene-wide `shadowStartOffset` uniform; scales each sprite's auto-derived radius
- Shadow quantization: cel-band `bands` quantizes unshadowed direct light; shadow ratio applied after quantization so shadow edges stay smooth
- Per-light `castsShadow` gate: shadow trace skipped for lights with `castsShadow: false` — shadow cost is O(casting lights), not O(total lights)
- Attenuation gate: shadow trace skipped when `atten <= 0.01`; `lightDir.normalize()` dropped from spot-cone math (unit-length invariant maintained at set-site)
- Fill-light quota + `importance`: hero lights (`castsShadow=true`) bypass quota; fill lights capped at 2 per tile with luminance-preserving per-tile `fillScale` compensation
- Per-category fill quotas: `Light2D.category` hashed via djb2 to one of 4 buckets; each category has independent quota and `fillScale` — prevents mixed fill types from cross-contaminating compensation
- Dead per-tile `fillScale` shader multiply removed after being superseded by per-bucket group-max quota; CPU-side tracking retained for devtools and future temporal path
- `./react` subpath export added; `@react-three/fiber` declared as optional peer dep

**BREAKING CHANGES**
- `DirectLightEffect`, `RadianceLightEffect`, `SimpleLightEffect`, `AutoNormalProvider`, and `TileNormalProvider` removed; use `DefaultLightEffect` + `NormalMapProvider` (the removed presets will reappear in a follow-up PR)
- `shadowBands` and `shadowBandCurve` uniforms removed (obsoleted by post-quantization shadow)

`@three-flatland/presets` now ships a production-ready shadow pipeline with per-category fill-light management and a streamlined `DefaultLightEffect` + `NormalMapProvider` preset pair.

