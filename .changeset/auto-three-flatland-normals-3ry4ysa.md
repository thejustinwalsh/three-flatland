---
"@three-flatland/normals": minor
---

> Branch: preview/tools-combined
> PR: https://github.com/thejustinwalsh/three-flatland/pull/172

## Normal Baker (VSCode Tool)

- Add `NormalSourceDescriptor` JSON Schema + `validateNormalDescriptor()` for the Normal Baker GUI, mirroring the atlas schema's conventions (schema owned by `@three-flatland/schemas`, published to `docs/public/schemas/`)
- Tighten schema to require integer `x`/`y`/`w`/`h` (fractional values now rejected), with matching invalid-fixture tests
- Add a "reset to inherited" affordance for per-field overrides (bump/direction/pitch/strength/elevation) in `RegionPropertiesPanel`, backed by new `isFieldOverridden`/`clearRegionField` helpers
- Extract bake/write/rename/cleanup orchestration into a standalone, unit-testable `atomicPublish.ts` (covers success path plus three injected-failure paths, confirming temp files are cleaned up and final paths are untouched on error)
- Verify the elevation lighting formula in `preview.ts` against the runtime implementation in `DefaultLightEffect.ts`, documenting the one known divergence (positional vs. orbit-direction XY)
- Strengthen the save round-trip test: exact hash equality on the PNG's `tEXt` stamp plus an independently-derived pixel check confirming encoded R/G/B channels match the source region

This release adds JSON Schema validation for normal-map descriptors, hardens the Normal Baker's save pipeline with atomic writes and better error recovery, and gives editor users a way to reset overridden per-field properties back to inherited values.
