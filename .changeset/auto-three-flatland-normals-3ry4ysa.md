---
"@three-flatland/normals": minor
---

> Branch: preview/tools-combined
> PR: https://github.com/thejustinwalsh/three-flatland/pull/172

## Normal Baker schema validation

- Added `NormalSourceDescriptor` JSON Schema plus an ajv-backed `validateNormalDescriptor()`, used by the VSCode Normal Baker GUI before baking. Schema lives in `@three-flatland/schemas` (not `@three-flatland/normals`) and is published to `docs/public/schemas/`; the hand-written `NormalSourceDescriptor` type in `packages/normals` remains authoritative, so the browser-safe normals bundle never pulls in ajv

## Fixes

- Synced the published docs schema (`docs/public/schemas/normal-descriptor.v1.json`) so the integer `x`/`y`/`w`/`h` tightening actually reaches consumers; added invalid-fixture (fractional coordinate) tests to the schema validator and normals type/schema parity suites
- Added a "reset to inherited" affordance in the Region Properties panel (per-field reset for bump/direction/pitch/strength/elevation), restoring the ability to clear an explicit override back to inherited after normalize-on-save was reversed
- Extracted the bake/write/rename/cleanup orchestration out of `sidecar.ts` into a pure, unit-testable `atomicPublish.ts`, covering the success path and three distinct injected-failure paths to confirm temp files are cleaned up and final paths are never touched on error
- Verified the preview elevation formula against the actual `DefaultLightEffect` lighting implementation (not just doc comments); added a test for "high elevation under low light shades darker"
- Strengthened the e2e save round-trip spec with exact PNG `tEXt` stamp hash equality and an independently-derived pixel check confirming R/G/B channel encoding matches the baked region

Adds JSON Schema validation for the Normal Baker's source descriptor format and closes out remaining reliability gaps (atomic writes, reset-to-inherited, exact-hash round-trip verification) in the Normal Baker tooling.
