---
"@three-flatland/normals": minor
---

> Branch: preview/tools-combined
> PR: https://github.com/thejustinwalsh/three-flatland/pull/172

## Normal Baker schema & validation

- New `NormalSourceDescriptor` JSON Schema + `validateNormalDescriptor()` (in `@three-flatland/schemas`), used by the FL Normal Baker GUI before baking; published to `docs/public/schemas/normal-descriptor.v1.json`
- Schema conforms to the hand-written `NormalSourceDescriptor` type in `packages/normals` — the browser-safe normals bundle never depends on ajv
- Added invalid-fixture tests (fractional x/y/w/h) covering the integer coordinate tightening, closing a gap where the published docs schema had drifted from the type

## Normal Baker editor (VSCode tool)

- Added a per-field "reset to inherited" affordance (bump/direction/pitch/strength/elevation) in the Region Properties panel, restoring a way back to inherited values after explicit-field-fidelity normalization removed it
- Region list reorder controls now use the shared `ToolbarButton` design-system primitive instead of raw `<button>`s
- Extracted the bake/write/rename/cleanup sequence out of the sidecar save path into a standalone, unit-testable `atomicPublish` function, covering the success path and three injected-failure paths (confirms temp files are cleaned up and final paths untouched on error)
- Verified the live preview's elevation formula against the actual `DefaultLightEffect` runtime implementation and documented the one intentional divergence; added a "high elevation under low light shades darker" test
- Strengthened the save round-trip e2e spec with exact descriptor-hash equality on the PNG's stamp and an independently derived pixel check confirming encoded R/G/B values match the source region

Adds schema-backed validation and a save/publish pipeline for the Normal Baker, plus editor UX and reliability fixes (reset affordance, atomic publish, elevation-preview accuracy).
