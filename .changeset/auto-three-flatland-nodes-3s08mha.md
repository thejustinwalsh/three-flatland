---
"@three-flatland/nodes": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

**New TSL lighting node library for 2D sprite rendering**

- `lit` node: per-fragment Phong/diffuse accumulation over the Forward+ light list
- `normalFromSprite` node: derives tangent-space normals from sprite alpha gradient (4-neighbor)
- `normalFromHeight` node: derives normals from a grayscale heightmap texture
- `shadow2D` / `shadowSoft2D` nodes: raymarch occluder alpha for soft and hard shadows
- `shadowSDF2D(surfacePos, lightPos, sdfTexture, worldSize, worldOffset, opts)`: sphere-trace soft shadow through a pre-built SDF; Inigo-Quilez penumbra term; default 32 steps; compile-time option bag (`steps`, `softness`, `startOffset`, `eps`)
- React lighting example (`examples/react/lighting`): dungeon floor via `TileMap2D`, shadow-casting wall sprites, wandering point-light enemies, keyboard-controlled hero, flickering torches, Tweakpane debug panel

TSL shadow nodes cover two complementary algorithms: direct alpha raymarching (`shadow2D`/`shadowSoft2D`) and SDF sphere-tracing (`shadowSDF2D`) — both ship in `@three-flatland/nodes/lighting`.
