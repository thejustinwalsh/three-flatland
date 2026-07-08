---
"@three-flatland/atlas": minor
---

> Branch: feat/atlas-vite-plugin
> PR: https://github.com/thejustinwalsh/three-flatland/pull/155

## What's new

- Add `@three-flatland/atlas/vite` plugin for dev/build-time atlas baking — declare source sprite directories instead of committing baked atlas artifacts
- Each configured entry bakes to a stable `<out>.json` + `<out>.png` pair at a fixed path (never content-hashed), so consumers like `SpriteSheetLoader` can fetch it by a known URL in both dev and prod
- Dev server serves baked atlases from memory via middleware, watches source directories, and triggers a full reload on add/change/remove of a `.png`
- Build emits the baked pair into the bundle via `emitFile`
- Re-baking is skipped when nothing changed, via a SHA-256 content-hash cache (source bytes + bake options) stored under Vite's `cacheDir`
- `src` accepts a bare directory (all `.png` files inside) or glob pattern(s) with wildcards in the final path segment; validates entries for missing `src`/`out` and colliding `out` paths

## Summary

Adds a Vite plugin to `@three-flatland/atlas` that automates atlas baking during dev and build, eliminating the need to commit pre-baked atlas artifacts.
