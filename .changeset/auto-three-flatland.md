---
"three-flatland": major
---

- Merged `packages/core` and `packages/react` into single `packages/three-flatland` package
- TSL shader nodes migrated from `packages/core` to `packages/nodes`
- React/R3F integration now at `three-flatland/react` subpath (previously a separate `packages/react` package)
- React subpaths reorganized into category subdirectories (`react/animation`, `react/loaders`, `react/materials`, `react/pipeline`, `react/sprites`, `react/tilemap`)
- Removed `resource.ts` from React subpath
- Added `source` export condition to all packages for monorepo dev without build step
- Added README and LICENSE to all packages
- Added CI workflows: changeset automation, bundle size checks (`.size-limit.json`)
- Fixed production environment detection in `measure.ts`
- Cleaned up tsconfig files across packages and examples

## BREAKING CHANGES

- `packages/core` and `packages/react` no longer exist; all imports must migrate to `three-flatland` and `three-flatland/react`
- React resource utilities (`resource.ts`) removed from the `three-flatland/react` subpath
- React subpath structure reorganized — category-specific imports (e.g., `three-flatland/react/sprites`) now resolve to subdirectory index files

Major alpha release consolidating the two core packages (`core`, `react`) into a single unified `three-flatland` package, with shader nodes promoted to their own standalone `@three-flatland/nodes` package.
