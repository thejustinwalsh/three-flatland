---
"@three-flatland/normals": minor
---

> Branch: preview/tools-combined
> PR: https://github.com/thejustinwalsh/three-flatland/pull/172

## Normal Baker: descriptor schema, atomic save, and reset affordance

- Added `NormalSourceDescriptor` JSON Schema + Ajv validator (`@three-flatland/schemas`) that the Normal Baker GUI validates against before baking; published to `docs/public/schemas/normal-descriptor.v1.json`
- Tightened schema validation to require integer `x`/`y`/`w`/`h` region coordinates, with regression tests covering fractional-value fixtures
- Extracted the bake/write/rename/cleanup flow into a standalone, unit-testable `atomicPublish.ts` — verifies temp files are cleaned up and final output is left untouched on any injected failure
- Added a per-field "reset to inherited" button (bump/direction/pitch/strength/elevation) in the Region Properties panel, restoring the ability to clear an explicit override back to inherited
- Verified the preview lighting formula against the actual runtime `DefaultLightEffect` elevation/NdotL implementation; added a test for "high elevation under low light shades darker"
- Strengthened the save round-trip e2e spec with exact PNG `tEXt` hash equality and an independently-derived pixel check confirming R/G/B channel encoding

Normal Baker now validates descriptors against a published schema, saves atomically with verified rollback on failure, and lets users reset individual region fields back to inherited values.
