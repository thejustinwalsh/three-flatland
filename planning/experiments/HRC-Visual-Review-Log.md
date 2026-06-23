# HRC Visual Review Log

This log is the review gate for Holographic Radiance Cascades changes. Every
accepted shader/math change must be isolated, committed atomically, captured with
vitexec, and recorded here before the next change.

## Review Protocol

1. Start from a clean or intentionally documented worktree.
2. Make one paper-aligned implementation change.
3. Run typecheck and focused tests.
4. Commit only that change.
5. Capture RC and HRC screenshots with the same vitexec setup.
6. Record commit, screenshots, metrics, performance, and visual verdict.
7. Stop for user review after about 10 assistant turns, or sooner if quality
   regresses.

No uncommitted shader probes count as accepted progress. Rejected probes must be
reverted or parked before the next accepted commit.

## Perceptual Metrics

`window.__radianceCascadeControls.comparePerceptual()` is the current deterministic
probe for perceptual review. It compares both the visible scene crop and the
final radiance render targets:

| Metric | Meaning | Direction |
| --- | --- | --- |
| `luminanceMae` | Mean absolute luminance error after resampling to a shared grid. | Lower is better. |
| `luminanceRmse` | Root mean squared luminance error; penalizes larger local misses. | Lower is better. |
| `ssim` | Global SSIM-style luminance/contrast/structure score. | Higher is better. |
| `edgeMae` | Sobel edge-magnitude error; catches misplaced penumbra edges. | Lower is better. |
| `highFrequencyMae` | Difference in 3x3 high-frequency residual; catches shimmer/banding. | Lower is better. |
| `profileExcessPeaks` | Extra strong horizontal shadow-profile peaks in HRC versus RC. | Near zero is better; positive values indicate repeated/ringing structure. |

The visible-canvas metric crops to the deterministic example scene rectangle
before scoring, so the Tweakpane/devtools overlay does not dominate the result.

## Current Baseline

| Item | Value |
| --- | --- |
| Branch | `pr-72-radiance-cascades` |
| Reference screenshot | `planning/experiments/hrc-review-captures/000-reference-rc.png` |
| Current Holographic screenshot | `planning/experiments/hrc-review-captures/001-current-holographic.png` |
| Current visual issue | Holographic is faster but has repeated/banded shadow structure versus RC. |
| Current verdict | Not RC parity. Do not optimize further until the paper mapping is audited. |

## Captures

### 000 - RC Reference

| Field | Value |
| --- | --- |
| Screenshot | `planning/experiments/hrc-review-captures/000-reference-rc.png` |
| Algorithm | Conventional RC |
| Settings | comparison baseline, cap 512, intensity 0.005, warm 6.1, cool 9.7 |
| Visual verdict | Reference. Clean continuous penumbrae; no repeated blocker silhouettes. |

### 001 - Current Holographic Baseline

| Field | Value |
| --- | --- |
| Screenshot | `planning/experiments/hrc-review-captures/001-current-holographic.png` |
| Algorithm | HRC Holographic |
| Settings | comparison baseline, cap 512, intensity 0.005, warm 6.1, cool 9.7 |
| Estimated sample count | 4,980,736 |
| Visual verdict | Faster than RC but not accepted: visible banding/repeated shadow structure. |

### 002 - Rejected Readout Offset Probe

| Field | Value |
| --- | --- |
| Screenshot | `planning/experiments/hrc-review-captures/002-rejected-readout-offset.png` |
| Change | Reintroduced `R0([x + 1, y], 0)` readout offset without fully realigning the coordinate system. |
| Estimated sample count | 4,980,736 |
| Visual verdict | Rejected. Still banded and not RC-like. Reverted. |

### 003 - Rejected Paper-Resolution Probe

| Field | Value |
| --- | --- |
| Screenshot | `planning/experiments/hrc-review-captures/003-rejected-paper-resolution.png` |
| Change | Temporarily made Holographic output use full `cascadeResolution` grid. |
| Estimated sample count | 79,691,776 |
| Visual verdict | Rejected as a standalone change. More expensive and still structurally wrong, which means surrounding mapping is still incorrect. Reverted. |

### 004 - Rejected Offset + Mirror-Origin Probe

| Field | Value |
| --- | --- |
| Screenshot | `planning/experiments/hrc-review-captures/004-rejected-offset-mirror.png` |
| Change | Combined readout offset with mirrored quadrant origin adjustment. |
| Estimated sample count | 79,691,776 |
| Visual verdict | Rejected as a standalone change. Did not remove the repeated/banded shadow issue. Reverted. |

## Next Required Audit

Before the next shader edit, fill in an equation-to-code table for:

| Paper item | Required behavior | Current code location | Status |
| --- | --- | --- | --- |
| Eq. 13 | Cone angular arc `A_n(i)` from `v_n(i +/- 1/2)` | `HierarchicalRadianceCascades.ts`, `_ensureHolographicRadianceMaterial`, `coneArc()` | Mostly aligned. Direction index `d` represents paper half-integer `i = d + 1/2`; child `d` spans edge directions `d..d+1`. |
| Eq. 14 | Odd-`x` radiance merge via `T_n(p, i +/- 1/2)` and `R_{n+1}(q, j)` | `_ensureHolographicRadianceMaterial`, `contributionOdd()` | Mostly aligned. Uses `T_n` at `parallel, localY, edgeDirection`, then samples `R_{n+1}` at `p + v_n(edge)`. Needs visual proof under paper output contract. |
| Eq. 15-17 | Even-`x` radiance average of direct child and traced child | `_ensureHolographicRadianceMaterial`, `contributionEven()` | Mostly aligned. Uses direct `R_{n+1}(p,j)` and traced branch through `T_{n+1}(p, 2i +/- 1)`. Needs proof that valid-domain masks are not clipping rectangular scenes incorrectly. |
| Eq. 18 | Even transfer merge `T_n(p,k)` with `T_n(p + v_n(k), k)` | `_ensureHolographicRecursiveTransferMaterial`, even `directionIndex` branch | Aligned in structure. Uses previous-level near/far transfer and standard radiance/transmittance merge. |
| Eq. 20 | Odd transfer averaged merge of neighboring directions | `_ensureHolographicRecursiveTransferMaterial`, odd `directionIndex` branch | Aligned in structure. Uses neighboring low/high direction merges and averages them. |
| Algorithm 1 HRC grid | HRC operates on an `X x Y` fluence grid; only the parallel axis decimates per cascade. | `_holographicFinalRadianceDimensions()` and `_holographicLevelInfoForResolution()` | Not paper-clean. Current native HRC output is `cascadeResolution / sqrt(baseRayCount)` to fit RC display texture conventions. This may be a display optimization, but it should not be assumed equivalent to the paper solver grid. |
| Algorithm 1 Lighting | Four rotated quadrants and final `R0([x + 1, y], 0)` | `_ensureHolographicDirectTransferMaterial()` quadrant transforms; `_ensureHolographicFinalRadianceMaterial()` readout | Suspect. Current best visual state omits the paper `+1` readout offset because reintroducing it without a full coordinate-system realignment worsened output. The paper offset is not optional; this points to a coordinate convention mismatch that must be fixed systematically. |
| Eq. 21 | 1px opacity-aware cross blur after quadrant sum | `_ensureHolographicFinalRadianceMaterial()`, `sampleNeighbor()` | Present. Center weight 4 and four cardinal taps; SDF guards block cross-occluder blur. |

Audit conclusion: the recurrence equations are plausibly close, but the active
visual artifact should be treated as a coordinate/output-contract bug, not a
filtering or exposure problem. The next implementation change should either:

- restore a paper-native HRC fluence grid behind a separate RC-compatible display
  downsample, or
- fully realign the current reduced HRC grid's quadrant transforms so the paper
  `R0([x + 1, y], 0)` readout is valid again.

Do not optimize or tune blur/noise until the selected path removes the repeated
shadow structure against the RC reference.

## 2026-06-23 Ring Artifact Probe

User-reported issue: HRC Holographic showed a detached contact shadow around
occluders: dark shadow at the object, then a bright ring/gap, then continued
shadow. RC did not show the gap.

Rejected probes:

- Final readout paper-offset probe: still showed the ring and worsened final
  radiance buffer SSIM. Reverted.
- Center-to-center direct-transfer probe: mildly changed aggregate metrics but
  did not remove the visible ring. Reverted.

Accepted probe:

| Field | Value |
| --- | --- |
| Screenshot | `planning/experiments/hrc-review-captures/005-accepted-no-final-cleanup.png` |
| Change | Removed the always-on four-neighbor Holographic final-readout cleanup pass. The HRC final readout now decodes `R0` directly and leaves smoothing to the explicit filter stage. |
| Root cause | The mandatory cleanup was a hidden spatial blur before optional filtering. Near SDF silhouettes, its visibility gate blended unequal neighbor samples and produced the bright ring between the blocker and the continuing shadow. |
| Canvas metrics | luma MAE 0.03449; RMSE 0.05590; SSIM 0.97589; edge MAE 0.02349; high-frequency MAE 0.001386; profile excess peaks -2. |
| Final radiance metrics | luma MAE 28.0138; RMSE 34.5007; SSIM 0.91827; edge MAE 26.7811; high-frequency MAE 1.1684; profile excess peaks 1. |
| Validation | `pnpm --filter example-three-radiance-cascades typecheck`; `pnpm vitest run packages/three-flatland/src/lights/HierarchicalRadianceCascades.test.ts packages/three-flatland/src/lights/RadianceCascades.test.ts`; `pnpm exec vitexec --gpu --config examples/three/radiance-cascades/vite.config.ts --screenshot /private/tmp/hrc-ring-no-cleanup-only.png --timeout 60 ...` |
| Verdict | Accepted. This fixes the reported ring without changing transfer coordinates or using tuning as a mask. Residual quality mismatch remains a separate HRC parity task. |

Audit update: the Eq. 21 cleanup row above is no longer current for the accepted
implementation. A cleanup kernel may still be useful later, but it must be an
explicit, separately tested filter and must not reintroduce contact-shadow gaps.
