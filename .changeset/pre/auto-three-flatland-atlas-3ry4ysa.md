---
"@three-flatland/atlas": patch
---

> Branch: feat-vscode-tools
> PR: https://github.com/thejustinwalsh/three-flatland/pull/117

## Fixes

- `polygonizeAlpha` now traces every connected component (not just the first blob) — multi-region sprites no longer have their envelope clipped by a single-blob hull
- Fully-opaque fast path now matches `earClip`'s winding so baked geometry keeps CCW front faces after the y-flip
- Materials with more than 16 effect floats safely fall back to synth-quad instead of exceeding WebGPU's 8-binding pipeline budget
- Mesh registration merges conservatively on re-registration; a meshless sheet degrading over a meshed texture now falls back to the hull instead of clipping content
- Late atlas registration (loader finishing after sprites are already batched) now correctly triggers a re-batch with matching geometry
- Rotated TexturePacker frames reject the polygon mesh and fall back to the quad, since the quad path doesn't yet rotate sampling

Hardens the tight-mesh/polygon envelope pipeline against edge cases found in adversarial review — all six findings ship with regression tests.
