# DDA source-energy regression fixture

Deterministic scene:

- example: `three/radiance-dungeon`
- seed: `1337`
- slimes: `100`
- paused: `true`
- resolved lighting pixel: `2`
- HDDA level: `2`
- local GI filter: disabled

The captures isolate raw RC transport from the optional local GI filter:

- `trace-2-filter-off.png` — 2 px DDA trace cells
- `trace-4-filter-off.png` — 4 px DDA trace cells
- `trace-8-filter-off.png` — 8 px DDA trace cells

## Judgment

Rejected as resolution-invariant output. The 8 px capture loses most torch
radiance and substantially darkens the room even with the GI filter removed.
This proves the bleed threshold and local filter are not the primary cause.

The DDA preset currently sets `shadowCaptureResolutionScale` to
`1 / ddaPixelSize`, so emissive and occlusion sprites are rasterized directly
at the coarse trace resolution. Small emissive texels and thin occluders can
disappear before traversal. The correction must preserve an authored-resolution
source capture, conservatively reduce occupancy, and energy-preserve emissive
radiance when constructing the coarser trace grid.
