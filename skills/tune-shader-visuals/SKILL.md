---
name: tune-shader-visuals
description: Use when tuning, optimizing, refactoring, or porting shaders without silently regressing rendered output, including TSL, WGSL, GLSL, WebGPU, post-processing, lighting, shadows, radiance cascades, GPU performance passes, and backend specializations where visual correctness and speed must be evaluated together.
---

# Tune Shader Visuals

Treat the rendered frame as a versioned test artifact. Never accept a shader speedup from timing or compiled code alone.

## Establish the oracle

1. Choose the last human-approved commit and record its hash.
2. Create a deterministic fixture with a fixed viewport, camera, seed, shader path, and tuning values. Freeze motion, animation, flicker, and temporal noise.
3. Capture the game/canvas region at native pixels, excluding browser chrome and controls.
4. Store the screenshot beside a manifest containing the exact URL, settings, commit, backend, GPU, and capture dimensions.
5. Record the human verdict as `approved` and the reason it looks correct.

Do not compare screenshots from random or moving scenes. Do not let a dev panel restore different values on reload.

## Change one claim at a time

Make one conceptual shader change, then:

1. compile and validate the generated shader;
2. capture the identical deterministic fixture;
3. compare it to the approved oracle with `scripts/compare-png.mjs`;
4. inspect the side-by-side frame and difference image;
5. measure GPU and CPU only after visual parity is established;
6. commit the code, capture, metrics, and judgment atomically.

Never combine a math change, tuning change, and scheduling/backend change in one commit. Preserve experimental paths behind explicit hard gates until they match the oracle.

## Judge the result

Read [references/judgment.md](references/judgment.md) before accepting or rejecting a candidate.

Classify every candidate:

- `approved`: correct or intentionally improved; becomes the new oracle.
- `rejected-regression`: visibly or analytically worse; do not stack more work on it.
- `experimental`: useful evidence, but not eligible for defaults or automatic selection.
- `needs-human-judgment`: metrics conflict with visual intent or the difference is artistically ambiguous.

If unclear, ask the user with both captures and metrics. Record their verdict and reasoning so the next comparison has better priors.

## Required signals

Log mean and percentile luminance, total luminance/scene energy, dark and clipped-pixel coverage, mean RGB/channel balance, pixel MAE/RMSE, changed-pixel ratio, edge-energy change, and timings with render and compute GPU timestamp pools combined.

Metrics detect regressions; they do not define beauty. Always inspect motion separately after the frozen-frame gate passes.

## Self-improve

After a human verdict, append the evidence and reason to the fixture log, identify which metrics predicted or missed it, add a targeted fixture or signal for missed failure modes, and revise this skill when the workflow itself allowed a regression through. Never overwrite prior evidence.
