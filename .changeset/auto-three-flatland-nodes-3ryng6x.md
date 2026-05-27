---
"@three-flatland/nodes": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

- New `shadowSDF2D` TSL helper: sphere-traces soft shadows through an SDF texture with Inigo-Quilez penumbra term; configurable steps, softness, startOffset, and eps
- Signed SDF via dual JFA chains: occluder and empty texels each run JFA independently, combined as `distOutside - distInside`; self-shadow detection uses clean `sdf < 0` instead of an epsilon approximation
- `shadowStartOffset` promoted to a tunable `FloatInput` option; default raised to 40 to clear typical sprite radii without self-shadowing artifacts
- Off-screen lights no longer cast false edge shadows: `worldToSDFUV` no longer clamps sample UVs; out-of-field samples advance by the eps floor
- SDF now regenerated on `OrthographicCamera.zoom` changes (was frozen despite occluder movement when zoom scaled the projection)
- `shadowFilter` option (`auto|nearest|linear`) on shadow sampling; `auto` picks nearest for pixel-art snap mode, linear otherwise
- `shadowBias` semantics split: `shadowBias` is the IQ hit epsilon; `shadowStartOffset` handles self-shadow escape
- Penumbra math corrected
- Removed unused lighting providers and loaders from the index barrel

## BREAKING CHANGES

- `shadowBias` no longer doubles as a self-shadow escape; migrate start-offset tuning to `shadowStartOffset`
- JFA debug buffer names changed: `sdf.jfaPing/Pong` split into `sdf.jfaPing/PongOutside` and `sdf.jfaPing/PongInside`

Completes the TSL shadow node suite with signed SDF, sphere-trace soft shadows, and per-light shadow control.
