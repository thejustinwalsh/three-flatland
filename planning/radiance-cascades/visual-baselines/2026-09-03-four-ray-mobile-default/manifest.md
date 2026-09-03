# Four-ray DDA mobile default

- Date: 2026-09-03
- Baseline commit: `a810d8f8`
- Fixture: paused, seed 1337, 100 slimes, 640x360 authored surface
- Backend/path: WebGPU `webgpu-workgroup`
- Lighting: 4px DDA trace, 4px resolve, HDDA level 2, GI filter off
- Baseline: 16 C0 rays
- Candidate: 4 C0 rays
- Verdict: `approved`

The candidate uses the canonical four-direction C0 radiance-cascade budget. Higher cascades still grow angular resolution by 4x. This removes 75% of the cascade atlas texels and the corresponding DDA jobs without changing the transport grid, resolve grid, hierarchy, fixed-point packing, or scene tuning.

The 40-sample candidate GPU median is 4.456 ms with a 5.833 ms p95. The matched 20-sample 16-ray baseline median is 10.027 ms with an 11.534 ms p95; the first 30-sample baseline run measured 12.517/13.369 ms. Mean scene luminance changed +0.962%, dark coverage +0.738 percentage points, and edge energy +2.723%. The stylized image remains visually coherent with no new obvious spokes in the dungeon fixture.

An intermediate dense direct-index workgroup scheduler was rejected: it preserved shader math but raised median GPU cost to 17.695 ms because long-ray divergence cost more than the removed atomics. The persistent atomic scheduler remains the approved baseline until the DDA loop exposes resumable state for real lane refill.

Artifacts:

- `baseline-16-rays.png`
- `candidate-4-rays.png`
- `difference-4x.png`
- `metrics.json`
