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
| Verdict | Superseded. This reduced one contact artifact, but the later luminance-diff and viewport probes showed it did not solve RC/HRC parity and was not the root cause of viewport-dependent ringing. |

Audit update: the Eq. 21 cleanup row above is current again after the
viewport-dependent grid bug was isolated. The cleanup kernel was not the root
cause of the viewport-dependent ring; the rectangular HRC output grid was.

## 2026-06-23 Viewport-Dependent HRC Grid Fix

User-reported issue: the browser showed harder north/south rings around
horizontal occluders than the report screenshots. Luminance diff confirmed HRC
was being compared against RC, but the screenshot did not reproduce the exact
browser artifact.

Root cause: Holographic HRC used a rectangular final grid derived from
`worldSize / maxWorldDim`. Different viewport aspects changed the HRC output
dimensions and probe density while RC kept a square final grid. Examples:

- `1280x720`: world `640x360`, old HRC final `128x72`.
- `1440x900`: world `576x360`, old HRC final `128x80`.

Accepted fix:

| Field | Value |
| --- | --- |
| Screenshot | `planning/experiments/hrc-review-captures/007-square-grid-viewport-invariance.png` |
| Change | Holographic HRC now uses the same square final fluence grid size as RC: `finalResolution x finalResolution`, independent of viewport aspect. |
| Restored code | Reinstated the Holographic final-readout cleanup kernel removed in the earlier false lead. With the square grid, it no longer causes the viewport-dependent ring. |
| Validation | `pnpm --filter example-three-radiance-cascades typecheck`; `pnpm vitest run packages/three-flatland/src/lights/HierarchicalRadianceCascades.test.ts packages/three-flatland/src/lights/RadianceCascades.test.ts`; vitexec forced-size luminance probe at `1280x720` and `1440x900`. |
| Probe result | Both forced sizes now report HRC final `128x128`. The ring no longer changes with final-grid aspect, but HRC remains brighter than RC in shadow regions. |
| Remaining work | RC still has better shadow quality. Continue with square-grid HRC as the baseline and use signed luminance diff as the quality gate. |

## 2026-06-23 Holographic Reference Pass Audit

Purpose: establish a hard baseline after the viewport bug fix before changing
the Holographic shader math again.

Probe setup:

- vitexec `--gpu`, Vite example config, forced render size `1280x720`.
- Comparison baseline: filters/noise/GI disabled, `raymarchSteps=64`,
  `sceneRadianceDownsampleFactor=1`, cap `512`.
- HRC mode: `holographic`.

| Field | Value |
| --- | --- |
| Screenshot | `planning/experiments/hrc-review-captures/008-holographic-reference-audit.png` |
| HRC active pass count | `17` = `1` scene radiance + `8` transfer passes + `7` radiance passes + `1` final readout |
| HRC direct-transfer samples | `4,980,736` |
| RC reference samples | `67,108,864` |
| Final resolution | RC `128x128`, HRC `128x128` |
| Canvas metrics | luma MAE `0.05353`; RMSE `0.08618`; SSIM `0.94895`; edge MAE `0.03111`; high-frequency MAE `0.001773`; profile excess peaks `-3` |
| Final radiance metrics | luma MAE `33.33434`; RMSE `41.36446`; SSIM `0.90512`; edge MAE `27.78260`; high-frequency MAE `1.35245`; profile excess peaks `0` |
| Active buffers | `hrc.sceneRadiance`, `hrc.T0..T7`, `hrc.R0..R6`, `hrc.finalRadiance` |
| Buffer audit result | Every active target has finite data and non-zero signal. Inactive filter targets are skipped when filters are disabled. |
| Verdict | Valid reference baseline, not RC parity. HRC is still materially brighter than RC in final radiance and shadow regions. |

Notable buffer activity:

| Buffer | Size | Mean luma | Max luma | Non-black |
| --- | ---: | ---: | ---: | ---: |
| `hrc.sceneRadiance` | `512x512` | `0.618176` | `3.191212` | `1.0000` |
| `hrc.T0` | `256x512` | `3.398519` | `18.2966` | `0.9718` |
| `hrc.T7` | `129x512` | `59.139097` | `931.9972` | `0.7990` |
| `hrc.R6` | `128x512` | `0.784151` | `17.9314` | `1.0000` |
| `hrc.R0` | `128x512` | `110.526307` | `612.7660` | `1.0000` |
| `hrc.finalRadiance` | `128x128` | `140.682128` | `379.0004` | `1.0000` |

Interpretation:

- The graph is not dead; all transfer/radiance hierarchy levels carry finite
  signal.
- The biggest correctness gap is no longer repeated translated shadows from the
  viewport bug. The current measurable gap is HRC over-brightening versus RC,
  especially visible in final radiance/shadow luminance.
- The next paper-aligned shader fix should target the Holographic normalization
  and final readout contract before any pass collapse or runtime optimization.

## 2026-06-23 Rejected Paper Readout Offset on Square Grid

Probe: reintroduced the paper's `R0([x + 1, y], 0)` final readout offset
after the square-grid fix, applying the `+1` in each quadrant's local parallel
axis.

| Field | Value |
| --- | --- |
| Screenshot | `planning/experiments/hrc-review-captures/009-rejected-paper-readout-offset-square-grid.png` |
| Canvas metrics | luma MAE `0.05077`; RMSE `0.08460`; SSIM `0.94676`; edge MAE `0.03234`; high-frequency MAE `0.001907`; profile excess peaks `-3` |
| Final radiance metrics | luma MAE `33.34636`; RMSE `42.33952`; SSIM `0.88900`; edge MAE `33.46918`; high-frequency MAE `1.97328`; profile excess peaks `-1` |
| Final means | RC `[155.814, 93.674, 177.658]`; HRC `[185.111, 115.982, 225.736]` |
| Verdict | Rejected and reverted. Visible canvas MAE moved slightly down, but final-radiance SSIM and edge/high-frequency error regressed. The offset is paper-required, but it is not safe as a standalone final-pass patch on the current coordinate basis. |

Additional probes:

- No occluders, `1280x720`: HRC becomes substantially darker than RC
  (`finalRadiance.ssim=0.66519`, RC mean `[454.141, 295.025, 586.855]`,
  HRC mean `[266.851, 174.822, 349.280]`). This rules out a single global
  brightness scale as the main error.
- Square viewport, `720x720`: visible canvas improves
  (`canvas.ssim=0.96516`, `profileExcessPeaks=0`), but final radiance remains
  off (`finalRadiance.ssim=0.89774`). View/world aspect contributes to visible
  artifacts, but it is not the whole HRC correctness bug.

## 2026-06-23 Rejected Final `/pi` Removal

Probe: removed the final HRC `fluence / pi` normalization from
`sampleReadout()`.

| Scenario | Canvas SSIM | Final radiance SSIM | RC mean | HRC mean | Verdict |
| --- | ---: | ---: | --- | --- | --- |
| Occluders enabled | `0.80117` | `0.26584` | `[155.814, 93.674, 177.658]` | `[590.458, 369.805, 719.575]` | Rejected: severe over-brightening. |
| Occluders disabled | `0.97293` | `0.43349` | `[454.141, 295.025, 586.855]` | `[838.328, 549.220, 1097.300]` | Rejected: canvas saturation hides final-radiance error. |

Conclusion: the paper's final lighting pseudocode does not explicitly show a
`/pi`, but removing it in this implementation is not correct. The root problem
is not a missing global scale factor.

## 2026-06-23 Rejected Aspect-Aware Cone Arc

Probe: changed Eq. 13 `coneArc()` to account for physical world-cell aspect
instead of assuming square grid cells. Direct transfer already traces physical
world segments, so this tested whether the radiance recurrence needed matching
physical angular widths.

| Scenario | Canvas SSIM | Final radiance SSIM | Final luma MAE | Verdict |
| --- | ---: | ---: | ---: | --- |
| `1280x720` | `0.96983` | `0.89274` | `34.24054` | Rejected for reference: visible canvas improved, but final-radiance oracle regressed from baseline `0.90512`. |
| `720x720` | `0.96516` | `0.89774` | `33.03426` | Neutral versus baseline square viewport. |

Conclusion: aspect-aware cone arcs may be useful later as a visual/runtime
approximation, but it does not improve the reference HRC parity gate. Reverted.
