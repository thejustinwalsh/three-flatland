---
"@three-flatland/atlas": minor
---

> Branch: feat/atlas-vite-plugin
> PR: https://github.com/thejustinwalsh/three-flatland/pull/155

## What's new

- Added `@three-flatland/atlas/vite` — a Vite plugin that bakes sprite atlases at dev/build time, so projects can declare source sprite directories instead of committing baked atlas artifacts
- Each entry bakes to a stable `<out>.json` + `<out>.png` pair at a fixed, known path (never content-hashed), so consumers like `SpriteSheetLoader` can fetch it by URL in both dev and prod
- Dev server serves the baked pair from memory via middleware — no disk writes; source directories are watched, and adding/changing/removing a `.png` triggers a re-bake plus full page reload
- Build mode emits the pair into the bundle via `emitFile`
- Re-bakes are skipped when nothing changed: a SHA-256 digest over source file bytes and bake options is cached under Vite's `cacheDir`, reused when the digest matches
- Source `src` supports a bare directory (all `.png` files inside) or glob pattern(s) with a wildcard in the final path segment (no recursive `**`)
- Entries are validated at plugin setup — missing `src`/`out` or colliding `out` values throw a descriptive error

## Summary

`@three-flatland/atlas` gains a Vite plugin for baking sprite atlases from source directories at dev/build time, with content-hash caching and dev-mode watch/reload support.
