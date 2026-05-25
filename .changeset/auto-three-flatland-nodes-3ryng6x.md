---
"@three-flatland/nodes": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

- `shadowSDF2D` TSL helper: sphere-trace soft shadows through an SDF texture; configurable `steps`, `softness`, `startOffset`, `eps`; IQ-style running-min penumbra term
- Signed SDF support in `shadowSDF2D`: self-shadow detection uses `sdf < 0` instead of `sdf < eps` approximation
- `shadowFilter` option (`auto|nearest|linear`): nearest for crisp pixel-art shadows, linear for smoother edges; `auto` follows `shadowPixelSnapEnabled`
- `shadowStartOffset` tunable uniform replaces hardcoded 40-unit escape offset; default 1.5 world units with caster-scale guidance
- Default `shadowStartOffset` raised to 40 to match demo caster scale (knight body 64 world units), preventing self-shadow and edge ringing
- Fixed: off-screen lights no longer produce false edge shadows — `worldToSDFUV` clamping removed; out-of-field samples treated as unoccluded
- Fixed: SDF not regenerating on `OrthographicCamera.zoom` change (zoom added to `cameraChanged` check)
- Fixed: penumbra math in shadow trace
- `shadow2D` / `shadowSoft2D` raymarching helpers retained alongside `shadowSDF2D`
- `LightEffect` system with traits, registry, and R3F `attach` helpers
- TSL lighting shader nodes: `lit`, `normalFromHeight`, `normalFromSprite`, shadow helpers

Comprehensive TSL lighting shader node library for 2D scenes; `shadowSDF2D` delivers soft shadow tracing through a signed SDF texture with camera zoom and off-screen light fixes.
