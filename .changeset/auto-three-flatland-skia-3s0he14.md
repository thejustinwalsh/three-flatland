---
"@three-flatland/skia": patch
---

> Branch: feat-examples-tweakplane
> PR: https://github.com/thejustinwalsh/three-flatland/pull/22

## Changes

### Bug fixes

- `useSkiaContext`: moved `useThree` call before any early returns to comply with rules-of-hooks — previously the hook conditionally called `useThree` only in the "no init started" branch, which React Strict Mode could detect as a hook ordering violation
- `wireSceneStats` cleanup: restore the original `onAfterRender` reference rather than a bound copy — stacked `wireSceneStats` calls and test assertions now correctly verify reference identity on teardown

### Tests

- Added `hooks.test.tsx` covering `useSkiaContext` behaviour across all four resolution paths (React context, global singleton, pending init, no init)
- Vitest workspace configured for the `@three-flatland/skia` package

### Documentation

- JSDoc examples in `SkiaCanvas`, `SkiaFontLoader`, and the three subpath index relabelled from "Vanilla" to "Three.js" for consistency with the broader repo rename

Patch release fixes hook-ordering in `useSkiaContext` and a reference-identity bug in `wireSceneStats` teardown; no public API changes.
