---
"@three-flatland/normals": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

**New package: `@three-flatland/normals`** — offline normal-map baker and runtime loader for sprite normal maps.

### Offline baker

- `flatland-bake normal <input.png>` — Node-side port of the `normalFromSprite` TSL helper: reads RGBA PNG, computes 4-neighbor alpha gradient, writes a sibling `.normal.png`
- Optional `--strength` multiplier and explicit output path: `flatland-bake normal sprite.png sprite.normal.png --strength 2`
- Registered via the `flatland.bakers` manifest, so installing the package makes the subcommand available with no extra wiring
- Region-aware baker for sprite sheets: `bakeRegions` computes normals per atlas frame
- `descriptor.ts` for reading/writing `.normal.json` atlas descriptors alongside baked PNGs

### Runtime loader

- `NormalMapLoader` implements the canonical try-baked-then-runtime pattern:
  - Silent HEAD probe; 404 falls through to the runtime TSL `normalFromSprite` path
  - `forceRuntime` option bypasses baked lookup
  - Dev-time warnings fire at most once per URL outside `NODE_ENV=production`
- Instance API: extends `three.Loader`, compatible with R3F `useLoader`
- Static API: `NormalMapLoader.load(url, { forceRuntime? })` with shared URL-keyed cache
- `resolveNormalMap` utility for deriving the baked URL from a sprite URL

Eliminates per-fragment alpha gradient cost when baked normals are available; runtime path remains fully functional as fallback.
