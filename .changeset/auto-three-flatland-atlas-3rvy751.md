---
"@three-flatland/atlas": minor
---

> Branch: feat/atlas-vite-plugin
> PR: https://github.com/thejustinwalsh/three-flatland/pull/155

## What's new

- New `@three-flatland/atlas/vite` plugin — declare source sprite directories in `vite.config` instead of committing pre-baked atlas artifacts
- Each entry bakes to a stable `<out>.json` + `<out>.png` pair at a fixed path (never content-hashed), so loaders like `SpriteSheetLoader` can fetch it by a known URL in both dev and prod
- Dev mode serves the baked pair from memory via middleware (no disk writes); source directories are watched, and adding/removing/changing a `.png` triggers a re-bake plus full page reload
- Build mode emits the pair into the bundle via `emitFile`
- Bake results are cached under Vite's `cacheDir` (`<cacheDir>/flatland-atlas/`), keyed by a SHA-256 digest of source file bytes + bake options — unchanged inputs skip re-baking entirely
- `src` accepts a bare directory (all `.png` files inside) or glob pattern(s) with a wildcard in the final path segment; entries validate for missing `src`/`out` and colliding `out` paths

## Summary

Adds a Vite plugin to `@three-flatland/atlas` that bakes sprite atlases at dev/build time with content-hash caching, removing the need to commit baked atlas artifacts to the repo.
