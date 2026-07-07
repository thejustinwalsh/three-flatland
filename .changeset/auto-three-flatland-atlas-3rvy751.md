---
"@three-flatland/atlas": minor
---

> Branch: feat/atlas-vite-plugin
> PR: https://github.com/thejustinwalsh/three-flatland/pull/155

## New: `@three-flatland/atlas/vite` plugin

- Adds `flatlandAtlas()`, a Vite plugin that bakes sprite atlases from source directories at dev/build time — no more committing baked `.json`/`.png` artifacts
- Declare `entries: [{ src, out, bake? }]`; `src` accepts a bare directory (all `.png` files inside) or a glob with a wildcard in the final path segment
- Each entry produces a stable `<out>.json` + `<out>.png` pair at a fixed, predictable URL/filename (never content-hashed), so loaders like `SpriteSheetLoader` can fetch it consistently in dev and prod
- Dev server: pair is served from memory via middleware, source directories are watched, and any `.png` add/change/remove triggers a re-bake + full page reload
- Build: pair is emitted into the bundle via `emitFile`
- Re-baking is skipped when nothing changed — a SHA-256 hash over source file bytes + bake options is cached under Vite's `cacheDir` (`flatland-atlas/`)
- Validates entries up front: throws on missing `src`/`out` or colliding `out` paths across entries
- Ships with unit and integration test coverage, plus updated README usage docs

Lets projects treat sprite atlases as a build step instead of a checked-in asset, keeping source sprites and generated atlases in sync automatically.
