---
"@three-flatland/nodes": major
---

- Promoted from `packages/core` — all TSL node source files moved to `packages/nodes/src/`
- Now a standalone npm package (`@three-flatland/nodes`) with its own build, versioning, and release lifecycle
- Added per-category subpath exports: `@three-flatland/nodes/alpha`, `/blur`, `/color`, `/display`, `/distortion`, `/retro`, `/sprite`, `/upscale`, `/vfx`, `/analog` — plus individual node subpaths (`/alpha/*`, etc.)
- Added `source` condition in package exports for direct TypeScript source resolution in monorepo dev (no pre-build required)
- Dual ESM + CJS output (`dist/index.js` + `dist/index.cjs`) with bundled `.d.ts` declarations
- Added `LICENSE` (MIT) and `README.md`
- `sideEffects: false` for full tree-shaking support

## BREAKING CHANGES

- Package was previously not independently published; if imported from `packages/core` internals, all imports must now use `@three-flatland/nodes` (or a subpath like `@three-flatland/nodes/color`)
- Subpath export structure is new — previously no per-category subpaths existed; code importing from flat paths must update to the new subpath convention

First stable alpha release of `@three-flatland/nodes` as a standalone package, extracted from the former `packages/core` monorepo-internal package and published independently with full per-category subpath exports and dual ESM/CJS output.
