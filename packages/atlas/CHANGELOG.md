# @three-flatland/atlas

## 0.1.0-alpha.1

### Patch Changes

- 2f94520: > Branch: feat/overdraw-tight-mesh

  > PR: https://github.com/thejustinwalsh/three-flatland/pull/142

  ## Atlas baker fixes
  - CLI flag parsing now rejects missing or non-finite values with a usage error instead of passing `NaN`/`undefined` through to the baker.
  - `earClip` triangulation returns an empty result (instead of a partial, invalid-looking index list) when it stalls on a degenerate or non-simple outline, so affected frames degrade to meshless/full-quad rendering rather than producing a clipped mesh.
  - Internal relative imports now include `.js` extensions so the published ESM `dist` build resolves correctly under Node — fixes `ERR_MODULE_NOT_FOUND` when running the `flatland-atlas` CLI bin.
  - `polygonizeAlpha` traces every connected component of a sprite's alpha silhouette instead of only the first, falling back to the convex hull of all contours for disconnected shapes — prevents a second detached blob from being clipped out of the baked envelope.
  - The fully-opaque fast path now matches `earClip`'s winding order so baked meshes have consistent CCW front faces after the atlas baker's y-flip.
  - Rotated TexturePacker frames are rejected from mesh baking and fall back to the quad, since rotated sampling isn't supported yet and would sample the wrong texels.

  Files: packages/atlas/src/bake.ts, packages/atlas/src/cli.ts, packages/atlas/src/index.ts, packages/atlas/src/polygon.ts, packages/atlas/src/polygon.test.ts

  Summary: Hardens the atlas baker's CLI validation and polygon-mesh generation (multi-blob tracing, winding consistency, rotated-frame handling) and fixes an ESM resolution bug in the published CLI bin.

- 415d722: > Branch: feat-vscode-tools

  > PR: https://github.com/thejustinwalsh/three-flatland/pull/117

  ## Fixes
  - `polygonizeAlpha` now traces every connected component (not just the first blob) — multi-region sprites no longer have their envelope clipped by a single-blob hull
  - Fully-opaque fast path now matches `earClip`'s winding so baked geometry keeps CCW front faces after the y-flip
  - Materials with more than 16 effect floats safely fall back to synth-quad instead of exceeding WebGPU's 8-binding pipeline budget
  - Mesh registration merges conservatively on re-registration; a meshless sheet degrading over a meshed texture now falls back to the hull instead of clipping content
  - Late atlas registration (loader finishing after sprites are already batched) now correctly triggers a re-batch with matching geometry
  - Rotated TexturePacker frames reject the polygon mesh and fall back to the quad, since the quad path doesn't yet rotate sampling

  Hardens the tight-mesh/polygon envelope pipeline against edge cases found in adversarial review — all six findings ship with regression tests.
