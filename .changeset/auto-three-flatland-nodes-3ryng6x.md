---
"@three-flatland/nodes": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

- `shadowSDF2D`: new TSL helper — sphere-traces a signed SDF toward a light, returns `[0,1]` shadow value with Inigo-Quilez-style running-min penumbra; options: `steps`, `softness`, `startOffset`, `eps`, `shadowFilter`
- Signed SDF via dual JFA chains: `SDFGenerator` now runs JFA twice (outside + inside seed passes) and combines as `signedDist = distOutside - distInside`; fragments inside casters see negative distance, enabling cleaner self-shadow detection (`sdf < 0` instead of `sdf < eps`)
- `shadowFilter` option (`auto|nearest|linear`) on `shadowSDF2D` — `auto` picks nearest when pixel-snap is enabled, linear otherwise
- Fixed: SDF not regenerated on `OrthographicCamera.zoom` change — zoom now included in the occluder-dirty gate
- Fixed: off-screen lights no longer cast false edge shadows — `worldToSDFUV` no longer clamps UVs; out-of-field samples advance by the eps floor (treated as unoccluded)
- `shadowStartOffset` option added to `shadowSDF2D`; default raised to 40 world units to match typical sprite casters, then superseded by per-sprite `shadowRadius`
- Corrected `shadowSDF2D` docstring to reflect selectable `shadowFilter` (was documented as always nearest)
- Penumbra math corrected
- Debug buffer names changed: `sdf.jfaPing/Pong` split into `sdf.jfaPing/PongOutside` and `sdf.jfaPing/PongInside`
- `LightEffect` system, trait registry, and React attach helpers added for wiring light effects to the ECS pipeline
- Initial 2D lighting system: JFA-based SDF, Forward+ tiled culling, `shadowDrop`/`shadowDropSoft`/`shadow2D`/`shadowSoft2D` TSL nodes

The `@three-flatland/nodes` lighting module now ships a production-ready sphere-traced soft-shadow helper backed by a signed dual-JFA SDF.
