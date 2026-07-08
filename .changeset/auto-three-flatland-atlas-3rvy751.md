---
"@three-flatland/atlas": minor
---

> Branch: feat/atlas-vite-plugin
> PR: https://github.com/thejustinwalsh/three-flatland/pull/155

## Changes

- Add new `@three-flatland/atlas/vite` subpath export — a Vite plugin that bakes sprite atlases at dev/build time instead of requiring pre-baked artifacts to be committed
- Declare atlas entries with `src` (a directory or glob pattern(s) of `.png` files) and `out` (a project-root-relative basename); each entry bakes to a stable `<out>.json` + `<out>.png` pair
  - **dev**: pair is served from memory via middleware at `/<out>.json` and `/<out>.png`, nothing written to disk; source directories are watched and changes trigger a re-bake + full page reload
  - **build**: pair is emitted into the bundle via `emitFile` at the exact `out` path (not content-hashed), so consumers like `SpriteSheetLoader` can fetch it by a known URL in both dev and prod
- Add SHA-256 content-hash staleness cache under Vite's `cacheDir` (`staleness.ts`) — skips re-baking when source file bytes and bake options are unchanged from the last run
- Validate entries up front: throws descriptive errors for missing/empty `src` or `out`, and for colliding `out` values across entries
- Add integration and unit tests for the plugin and staleness cache
- Update `packages/atlas/README.md` with usage docs for the new Vite plugin

## Summary

`@three-flatland/atlas` now ships a Vite plugin that bakes sprite atlases on the fly from source directories, with content-hash caching to avoid redundant rebakes, removing the need to commit baked atlas artifacts to the repo.
