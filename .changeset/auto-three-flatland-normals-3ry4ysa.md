---
"@three-flatland/normals": minor
---

> Branch: preview/tools-combined
> PR: https://github.com/thejustinwalsh/three-flatland/pull/172

## Normal descriptor schema + validation

- Added a `NormalSourceDescriptor` JSON Schema and `validateNormalDescriptor()`
  (via `@three-flatland/schemas`) that the Normal Baker GUI validates against
  before baking. The schema conforms to the hand-written `NormalSourceDescriptor`
  type in `@three-flatland/normals`, keeping the browser-safe normals bundle
  free of an `ajv` dependency.
- Published schema at `docs/public/schemas/normal-descriptor.v1.json`, kept in
  sync with the package schema via `pnpm sync:docs:schemas` (a prior drift
  where integer x/y/w/h tightening didn't propagate to the docs copy is now
  covered by fixture tests on both the schemas validator suite and the
  normals type<->schema parity suite).

## Normal Baker editor

- `RegionPropertiesPanel` gained a per-field "reset to inherited" button
  (bump/direction/pitch/strength/elevation), restoring the ability to clear
  an explicit field override now that save-time normalization no longer does
  it implicitly.
- Extracted the bake/write/rename/cleanup logic from `saveNormalDescriptor`
  into a standalone, unit-testable `atomicPublish.ts` — covers the success
  path and injected-failure paths, confirming temp files are cleaned up and
  final files are untouched on error.
- Verified the preview elevation formula matches the runtime lighting
  implementation (`DefaultLightEffect`), and strengthened the e2e
  save-round-trip test with exact descriptor-hash equality and a real
  pixel-level check on baked elevation data.
- Migrated `RegionListPanel`'s reorder buttons to the shared `ToolbarButton`
  design-system component.

Introduces schema-validated normal descriptors for the Normal Baker, plus
editor and save-pipeline hardening (reset affordance, atomic writes, stricter
round-trip verification).
