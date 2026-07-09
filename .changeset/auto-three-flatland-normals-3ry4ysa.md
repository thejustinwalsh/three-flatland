---
"@three-flatland/normals": minor
---

> Branch: preview/tools-combined
> PR: https://github.com/thejustinwalsh/three-flatland/pull/172

## Normal Baker: schema, validation, atomic publish

- Add `NormalSourceDescriptor` JSON Schema + ajv validator (`@three-flatland/schemas/normal-descriptor`), mirroring the atlas schema's conventions; published to `docs/public/schemas/normal-descriptor.v1.json` via `sync:docs:schemas`
- Tighten schema so region `x`/`y`/`w`/`h` must be integers; add invalid-fixture tests (fractional values) to both the schema validator suite and the normals type<->schema parity suite
- Extract bake/write/rename/cleanup orchestration out of `saveNormalDescriptor` into a new pure `atomicPublish.ts` (dependency-injected, unit-testable) — verified temp files are cleaned up and final paths are untouched on error across three distinct failure paths
- Add a per-field "reset to inherited" affordance (bump/direction/pitch/strength/elevation) in `RegionPropertiesPanel`, since normalize-on-save removed the only prior way a field could revert to inherited
- Verify the preview's elevation lighting formula against the actual `DefaultLightEffect` runtime implementation (not just docs), add regression coverage for high-elevation/low-light shading
- Strengthen the e2e save-round-trip spec: exact hash equality on the PNG's descriptor stamp, plus an independently-derived pixel check confirming R/G/B channel encoding on a real fixture region

Adds a validated JSON schema for the Normal Baker's source descriptor format and hardens its save pipeline with atomic publish semantics, stricter integer field validation, and expanded test coverage.
