# HDDA hierarchy parity gate

## Fixture

- Date: 2026-08-29
- Branch: `radiance-lighting-presets`
- Approved starting commit: `0fd688fb`
- URL: `http://127.0.0.1:5184/three/radiance-dungeon/?slimes=5&seed=1337&pause=1`
- Stress URL: the same fixture with `slimes=100`
- Canvas: 640 × 360 authored pixels, cropped from the page at `(133, 302)`
- Renderer: Three.js WebGPU in the in-app Chromium browser on macOS
- Settings: DDA Fixed RC, cell size 2×, ambient 0.28, bands 0, torch emission 8.0, slime emission 0.5
- Determinism: seeded slime placement and paused motion, animation, flicker, and temporal noise

## Judgments

| Candidate | Status | Evidence |
| --- | --- | --- |
| `fragment.png` | approved oracle | Human-approved broad transport and shadows before acceleration-path comparison. |
| `fragment-hdda-level2-fixed.png` | approved | Corrected level-2 HDDA versus the level-0 oracle: no pixels changed above 2/255, energy delta −0.00028%, identical dark and clipped coverage. |
| `workgroup-hdda-level2-fixed.png` | approved | Corrected compute HDDA versus corrected fragment: energy delta −0.00155%, 0.059% changed pixels, dark coverage delta −0.0039 percentage points. |
| `workgroup-hdda-level2-fixed-slimes100.png` | approved | Dense emitter stress test versus fragment: zero pixels changed above 2/255, energy delta −0.00077%, identical clipped coverage. |

## Root cause

Both hierarchy reduction shaders used a vector condition with TSL `select()`. Generated WGSL lowered it through `all(...)`, coupling occupancy, emitter silhouette, and emission flags. Wall-only and emission-only blocks therefore became false-empty and HDDA skipped real transport. Three scalar selects restore independent conservative flags.

## Acceptance rule learned

Inspect generated TSL output for vector-condition lowering. Independent mask channels require independent scalar predicates unless the intended condition really is “all channels.”
