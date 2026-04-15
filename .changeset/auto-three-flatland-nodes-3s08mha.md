---
"@three-flatland/nodes": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

## New lighting TSL nodes

- `shadowSDF2D(surfaceWorldPos, lightWorldPos, sdfTexture, worldSize, worldOffset, options)` — sphere-trace soft shadow through an SDF texture; returns a `[0, 1]` float node (0 = fully shadowed, 1 = fully lit) with Inigo-Quilez-style penumbra
  - Options: `steps` (default 32), `softness` (penumbra width), `startOffset` (self-shadow bias), `eps`
  - Shipped alongside the existing `shadow2D` / `shadowSoft2D` alpha-raymarch helpers; both algorithms are supported
- `lit(normal, lightDir, lightColor, attenuation)` — Lambertian diffuse helper node
- `normalFromSprite(atlas, uv, strength)` — runtime tangent-space normals derived from sprite alpha gradient
- `normalFromHeight(atlas, uv, strength)` — height-map variant
- `lights` — TSL nodes for Forward+ light store reads

## Lighting example

- New `examples/react/lighting`: dungeon scene with TileMap2D floor, castsShadow walls, 4 wandering knights + 10 slimes as point lights, 2 flickering torches, WASD-controlled hero, Tweakpane panel via `@three-flatland/devtools`

Adds a full suite of 2D lighting TSL shader nodes — including SDF soft shadows, normals-from-sprite, and Forward+ light reads — plus a comprehensive React lighting example.
