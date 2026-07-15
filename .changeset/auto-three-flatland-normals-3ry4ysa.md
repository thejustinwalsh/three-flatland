---
"@three-flatland/normals": minor
---

> Branch: preview/tools-combined
> PR: https://github.com/thejustinwalsh/three-flatland/pull/172

## Normal Baker schema

- New `NormalSourceDescriptor` JSON Schema + `validateNormalDescriptor()` (in `@three-flatland/schemas/normal-descriptor`), following the atlas schema's conventions: hand-authored `packages/normals/src/descriptor.ts` type stays authoritative, schema conforms to it, and the schema is published to `docs/public/schemas/normal-descriptor.v1.json` via `pnpm sync:docs:schemas` — kept out of `gen:types` so the browser-safe normals bundle never pulls in Ajv
- Tightened integer constraints (x/y/w/h) and synced the published docs schema copy, with new invalid-fixture tests (fractional x/y/w/h) in both the schemas validator suite and the normals type<->schema parity suite

## Normal Baker editor (VSCode)

- Added a per-field "reset to inherited" affordance (bump/direction/pitch/strength/elevation) in `RegionPropertiesPanel`, restoring the ability to clear an explicit field override that was lost when normalize-on-save was reversed
- Extracted the bake/write/rename/cleanup sequence out of `sidecar.ts` into a pure, unit-testable `atomicPublish.ts`; covers the success path plus three injected-failure paths, confirming temp files are cleaned up and final files are never touched on error
- Verified the elevation preview formula against the runtime lighting implementation (`DefaultLightEffect.ts`); confirmed exact match and documented the one known divergence (positional vs. orbit-direction XY)
- Strengthened the e2e save-round-trip spec with exact PNG tEXt-stamp hash equality and an independently-derived pixel check against a real fixture region
- `RegionListPanel`'s raw reorder buttons converted to `ToolbarButton` for design-system compliance

## Summary

Adds a JSON Schema + validator for the Normal Baker's descriptor format (mirroring the atlas schema pattern) and hardens the Normal Baker editor: a reset-to-inherited affordance, an atomically-tested bake/write/rename pipeline, verified elevation math, and stricter round-trip test coverage.
