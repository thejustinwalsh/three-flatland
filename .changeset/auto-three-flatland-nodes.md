---
"@three-flatland/nodes": major
---

✗ View nodes index.ts
  $ cat /home/runner/work/three-flatland/three-flatland/packages/nodes/src/index.ts 2>/dev/null |
  head -80
  Permission denied and could not request permission from user

✗ View nodes package.json
  $ cat /home/runner/work/three-flatland/three-flatland/packages/nodes/package.json 2>/dev/null
  Permission denied and could not request permission from user

● Read packages/nodes/src/index.ts
  └ 38 lines read

● Read packages/nodes/package.json
  └ 146 lines read

- Migrated all TSL shader node source from `packages/core/src/nodes/` to `packages/nodes/src/` — nodes now live in their own standalone package
- Added per-category subpath exports: `@three-flatland/nodes/alpha`, `/blur`, `/color`, `/display`, `/distortion`, `/analog`, `/retro`, `/sprite`, `/upscale`, `/vfx`, plus per-file wildcards
- Added `source` condition to all export entries for monorepo dev without requiring a build step
- Added `LICENSE` and `README.md` to the package
- Dual ESM + CJS build output with full `.d.ts` types

## BREAKING CHANGES

- Package previously did not exist as a standalone — nodes were internal to `packages/core`. Any import from `@three-flatland/core` (or the old internal path) must be updated to `@three-flatland/nodes` or the appropriate subpath (e.g. `@three-flatland/nodes/color`)
- The `packages/core` and `packages/react` packages have been deleted and replaced by `packages/three-flatland` (core library) and `packages/nodes` (shader nodes); update all imports accordingly

Initial alpha release of `@three-flatland/nodes` as a standalone npm package, extracted from the now-deleted `packages/core`. All TSL shader nodes (color, alpha, blur, retro, VFX, distortion, display, analog, sprite, upscale) are now importable via granular per-category subpaths.
