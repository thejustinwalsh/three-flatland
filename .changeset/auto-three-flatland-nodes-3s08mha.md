---
"@three-flatland/nodes": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

**Lighting shader nodes**

- `shadowSDF2D(surfaceWorldPos, lightWorldPos, sdfTexture, worldSize, worldOffset, opts?)` — sphere-trace soft shadow helper; returns `[0, 1]` shadow factor with Inigo-Quilez penumbra term
  - Options: `steps` (default 32), `softness` (8=soft, 32=sharp), `startOffset` (self-shadow bias), `eps`
  - SDF texture expected from `SDFGenerator` (`.r` channel, UV-space distance)
- `lit`, `normalFromSprite`, `normalFromHeight` TSL lighting node helpers
- `lights` — light-store TSL node bindings for point/directional/ambient/spot lights

**Lighting example**

- `examples/react/lighting` rebuilt with dungeon tilemap, castsShadow walls, wandering point-light enemies, keyboard-controlled hero, and Tweakpane devtools panel
- Shadow soft-edges now wired end-to-end via `shadowSDF2D` in `DefaultLightEffect` / `DirectLightEffect`

`@three-flatland/nodes` now ships a complete set of TSL lighting primitives covering lit surfaces, tangent-space normals, and SDF-based soft shadows.
