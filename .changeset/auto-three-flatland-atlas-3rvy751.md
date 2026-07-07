---
"@three-flatland/atlas": minor
---

> Branch: feat/atlas-vite-plugin
> PR: https://github.com/thejustinwalsh/three-flatland/pull/155

## What's new

- Add a new `@three-flatland/atlas/vite` entry point exposing `flatlandAtlas`, a Vite plugin that wraps `bakeAtlas` for dev/build-time atlas generation — no more committing baked atlas artifacts.
- Declare source sprite directories/globs per entry (`entries[].src`) and a stable output basename (`entries[].out`); each entry bakes to a `<out>.json` + `<out>.png` pair, never content-hashed, so consumers (e.g. `SpriteSheetLoader`) can fetch it by a fixed URL in both dev and prod.
- **Dev**: entries bake once at server boot (or reuse a warm cache), are served from memory via a dev-only middleware at `/<out>.json` and `/<out>.png`, and source directories are watched — adding/changing/removing a `.png` re-bakes that entry and triggers a full reload.
- **Build**: entries bake at `buildStart` and are emitted into the bundle via `this.emitFile` at the exact `<out>.json`/`<out>.png` filenames.
- Add a caching layer (`staleness.ts`): a SHA-256 digest over source file bytes plus bake options is stored under Vite's `cacheDir` (`node_modules/.vite/flatland-atlas/` by default) so unchanged entries skip re-baking.
- `entries[].src` supports bare directories (all `.png` files inside) or single-level wildcard glob patterns (no recursive `**`); arrays of patterns union into one atlas. Validates missing/empty `src`/`out` and colliding `out` values with descriptive errors.
- `vite` is now an optional peer dependency of `@three-flatland/atlas`; `pngjs`/`@types/pngjs` versions moved to the workspace catalog.

## Summary

`@three-flatland/atlas` gains a Vite plugin (`@three-flatland/atlas/vite`) that bakes sprite sheets from source directories at dev/build time, with content-hash caching and dev-server hot reload, removing the need to commit pre-baked atlas files.
