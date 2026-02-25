---
"@three-flatland/nodes": major
---

Initial alpha release of `@three-flatland/nodes` — a full library of composable TSL shader nodes extracted from the monorepo core.

**Node categories (all available as deep subpath imports):**
- `@three-flatland/nodes/sprite` — UV transform (flip, offset, rotate, scale), pixelate, outline, sprite sampling
- `@three-flatland/nodes/color` — tint, brightness, contrast, saturation, hue shift, color remap
- `@three-flatland/nodes/alpha` — alpha mask, alpha test, dissolve, fade edge
- `@three-flatland/nodes/retro` — Bayer dither, palettize, posterize, quantize, color replace, console palettes
- `@three-flatland/nodes/distortion` — distort, noise distortion, wave
- `@three-flatland/nodes/vfx` — afterimage, flash, pulse, shimmer, sparkle, trail
- `@three-flatland/nodes/blur` — box, Gaussian, Kawase, motion, radial blur, bloom
- `@three-flatland/nodes/display` — scanlines, phosphor mask, LCD, CRT effects
- `@three-flatland/nodes/analog` — chromatic aberration, video artifacts
- `@three-flatland/nodes/upscale` — Scale2x, Eagle, HQ2x
- Wildcard deep imports supported (`@three-flatland/nodes/color/*`)

**Package / build:**
- `source` export condition added to all subpaths for monorepo dev without building
- Build switched from `treeshake: true` to `bundle: false` (unbundled ESM/CJS output)
- README and LICENSE added

## BREAKING CHANGES

- Package was previously a stub with only a `VERSION` export; all prior imports will need to be updated to the new per-category subpaths

This is the initial alpha release, extracting TSL shader nodes from the internal `packages/core` into a standalone, tree-shakeable package.
