# DDA transport / resolve separation

## Fixture

- Date: 2026-09-01
- Branch: `feat/radiance-transport-resolve`
- Starting commit: `cd0ce4cc`
- URL: `http://127.0.0.1:5184/three/radiance-dungeon/?slimes=5&seed=1337&pause=1`
- Stress fixture: the same URL with `slimes=100`
- Authored canvas: 640 × 360
- Renderer: Three.js WebGPU in the in-app Chromium browser on macOS
- Shared settings: ambient 0.28, bands 0, torch emission 8.0, slime emission 0.5

## Change

The DDA transport grid and resolved lighting grid are independent:

- Production candidate: 4px trace cells (160 × 90 visible transport) reconstructed onto a 2px lighting grid (320 × 180 visible resolve).
- Comparison oracle: 2px trace cells and a 2px lighting grid (320 × 180 for both).
- The cascade atlas dimensions and DDA ray count depend only on the trace-cell size. Changing the lighting-pixel size resizes only the final irradiance/filter targets.

## Visual judgment

The user approved continuing with the 4px trace default. Across the full deterministic page capture, the 4px candidate preserves total luminance within +0.0043% of the 2px transport oracle. The luma RMSE is 4.93/255 and 0.846% of pixels change by more than 2/255. This is expected reconstruction/coarsening, not an exposure shift.

Artifacts:

- `baseline-2x-transport-2x-resolve-full.jpg`
- `candidate-4x-transport-2x-resolve-full.jpg`

## GPU baseline

Combined render + compute timestamps on the paused 100-slime fixture:

| Trace cell | Resolve cell | Samples | Median | p95 | Min | Max |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| 4px | 2px | 20 | 24.12 ms | 25.89 ms | 22.68 ms | 28.18 ms |
| 2px | 2px | 20 | 38.99 ms | 58.13 ms | 25.03 ms | 58.13 ms |
| 1px | 2px | 12 | 208.60 ms | 310.25 ms | 112.79 ms | 310.25 ms |

The 1px cost grows far beyond simple target-area scaling. That makes it the stress probe for subsequent HDDA/traversal work; an optimization must improve 1px and 2px without changing the deterministic image.
