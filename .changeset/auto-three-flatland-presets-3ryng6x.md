---
"@three-flatland/presets": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

## DefaultLightEffect

- Shadow traces gated on per-light `castsShadow` flag; fill lights (`castsShadow: false`) pay no shadow-trace cost
- Per-light attenuation check skips shadow trace when contribution is sub-visible (`atten < threshold`)
- Per-category fill quota support: shader selects compensation scale via 4-way TSL select keyed on `row3.a` (bucket index); 3 float selects per fill light, branch-free
- Dropped per-tile `fillScale` shader multiply that caused tile-boundary banding; fill lights contribute at natural intensity when in-slot
- Shadow applied after cel-band quantization (correct ordering)
- `shadowBands` / `shadowBandCurve` uniforms removed (obsoleted by SDF-based soft shadows)
- `shadowStartOffset` uniform threaded through from `@three-flatland/nodes` `shadowSDF2D`

## SimpleLightEffect

- Updated for interleaved instance buffer attribute names
- Per-category fill quota plumbing consistent with `DefaultLightEffect`

## NormalMapProvider

- Updated for interleaved `instanceSystem` attribute layout (flip via `readFlip()` helper)
- Removed `as unknown as` cast that worked around the previous raw attribute read

## Package

- `./react` subpath export added to `package.json`; `@react-three/fiber` declared as optional peer dep so `ThreeElements` augmentation resolves without requiring R3F in non-R3F projects

Presets lighting effects are now production-quality: SDF soft shadows, per-category fill quotas, and correct shadow ordering with no visual banding artifacts.
