# HRC Implementation Notes

Status: baseline Radiance Cascades is the reference implementation and visual oracle. HRC is not
allowed to become the default replacement, and Holographic RC is not allowed to start, until the
hierarchical path can match RC on deterministic A/B probes.

## Attribution / Sources

- Radiance Cascades is credited to Alexander Sannikov. The Flatland
  `RadianceCascades` implementation follows the published RC cascade structure:
  inverse spatial/angular scaling, geometric interval growth, child-ray merging, and final
  cascade-0 irradiance readout.
- The explanatory RC material used while implementing and debugging includes the GM Shaders guest
  article "Radiance Cascades" by Xor and Alex, which points back to Sannikov's original RC work and
  describes the 2D cascade/probe/ray layout used here:
  https://mini.gmshaders.com/p/radiance-cascades
- Holographic Radiance Cascades is credited to Rouli Freeman, Alexander Sannikov, and Adrian Margel,
  "Holographic Radiance Cascades for 2D Global Illumination" (arXiv:2505.02041, 2025). The
  Holographic path in this branch is intended to follow that paper's transfer/radiance hierarchy,
  direct short-transfer initialization, recursive transfer composition, quadrant layout, radiance
  recursion, and cross-blur guidance:
  https://arxiv.org/abs/2505.02041
- Adrian Margel's public Holographic Radiance Cascades project page is used as an implementation
  reference for the visual target and for interpreting the paper's practical layout choices:
  https://adrianmargel.ca/projects/holographicRadianceCascades/
- N8AO is credited as prior art for artist-friendly spatial filtering/denoising ergonomics. The
  Flatland RC/HRC filters are local TSL passes over 2D irradiance/SDF data, not a port of N8AO's
  SSAO shader:
  https://github.com/N8python/n8ao
- Blue-noise jitter is generated internally with a small void-and-cluster ranked mask. No external
  blue-noise texture asset is copied into the repo.

Source attribution contract for this branch:

- Conventional `RadianceCascades`: credit Alexander Sannikov's Radiance Cascades technique. The GM
  Shaders article by Xor and Alex is an explanatory reference for the 2D probe/ray/cascade layout
  and debugging vocabulary.
- `HierarchicalRadianceCascades` interval mode: describe as a Flatland experimental approximation
  under A/B test, not as paper-correct Holographic RC.
- `HierarchicalRadianceCascades` holographic mode: credit Freeman, Sannikov, and Margel's
  Holographic Radiance Cascades paper, with Adrian Margel's project page as a practical visual
  reference.
- Filtering and broad-GI controls: describe as local Flatland TSL passes. Credit N8AO only as prior
  art for artist-friendly filter ergonomics; this branch does not port N8AO shader code.

## Current Decision

The current `HierarchicalRadianceCascades` implementation is an experimental interval-composition
renderer, not a faithful Holographic Radiance Cascades implementation. It must be judged against
`RadianceCascades` first. If it cannot visually match RC on simple scenes at lower or comparable
cost, it is not useful as the default path.

Do not tune around visible differences with blue noise, temporal accumulation, broad GI, or final
filtering. Those effects can hide artifacts, but they cannot prove the hierarchy is correct.

The current fixed-angle interval composer has a structural parity problem: every short interval is
stored at the base angular resolution, then composed forward along the same base ray direction.
Conventional RC does something different. Cascade `i + 1` has twice the angular resolution per axis,
and every cascade `i` ray merges four child rays from cascade `i + 1`. That recursive child-ray merge
is not a filtering detail; it is the mechanism that preserves far-field angular resolution while
reducing far-field spatial resolution. A HRC candidate that stores only `baseRayCount` directions for
the whole composed distance range is missing information that RC uses, so repeated translated
shadows and directional bands should be treated as correctness failures, not as tunable quality
artifacts.

Therefore the next HRC slice must preserve RC's angular hierarchy before any optimization work:

- either implement an RC-equivalent hierarchical atlas/readout that stores and composes the child-ray
  angular branches needed to reproduce cascade merging, or
- explicitly mark the fixed-angle interval composer as a separate approximation that failed the
  1:1 replacement gate.

Do not start Holographic RC from the fixed-angle interval composer. Holographic can reuse the
transfer-composition lessons, but it must begin from a hierarchy that already matches RC.

Update: the RC-equivalent hierarchy bridge was useful as an oracle, but it is not HRC and must not
be treated as the solution. The active `HierarchicalRadianceCascades` path is back on the real
interval-composition renderer so the artifacts remain visible and debuggable.

## A/B Correctness Gate

Use this deterministic baseline whenever comparing RC and HRC:

- `blueNoiseStrength = 0`
- `filterRadius = 0`
- `filterStrength = 0`
- `filterJitterStrength = 0`
- `mipBlur = 0`
- `mipStrength = 0`
- `intervalOverlap = 0`
- `sceneRadianceDownsampleFactor = 1`
- Same `raymarchSteps`, world bounds, SDF texture, light texture, and final irradiance resolution.
- Same final irradiance resolution is mandatory. A comparison where RC outputs `256x256` and HRC
  outputs `128x128` is useful as a user-facing quality check, but it is not a correctness proof.
- The example exposes a probe-only `setComparisonResolutionCap(cap)` helper for this. Use it to set
  both auto cascade caps to the same value before comparing, then verify the reported final
  irradiance dimensions match.

The first parity target is not performance. The first target is correctness:

- simple empty scene: RC and HRC final irradiance should match within numerical noise.
- single point light, no occluders: same light falloff field and no angular banding.
- one rectangle occluder and one point light: same shadow direction, no repeated translated copies.
- two colored lights: same color mixing and no direction-dependent duplicate silhouettes.

Initial acceptance tolerances for the browser probe:

- Mean absolute RGB error, normalized to max RC luminance: `<= 0.03`.
- 95th percentile normalized RGB error: `<= 0.10`.
- Max normalized RGB error may exceed this only within one final-irradiance texel of occluder
  silhouettes or world bounds.
- Directional artifact gate: sampled row/column profiles must not show repeated occluder-shaped
  troughs at regular interval spacing. This should be checked by image/profile inspection until a
  robust automatic detector exists.

Current known failing A/B snapshot:

- Deterministic baseline, visible example scene, RC default cap `1024`, HRC cap `512`.
- RC final irradiance: `256x256`; HRC final irradiance: `128x128`.
- Result: HRC has strong block/band structure and does not pass visual parity. This snapshot proves
  the current HRC is not default-ready, but the resolution mismatch means it is not yet the final
  correctness metric.

Matched-resolution failing A/B snapshot:

- Deterministic baseline, visible example scene, both auto caps set to `512` through
  `window.__radianceCascadeControls.setComparisonResolutionCap(512)`.
- RC final irradiance: `128x128`; HRC final irradiance: `128x128`.
- RC: `cascadeResolution=512`, `baseRayCount=16`, `raymarchSteps=64`,
  `estimatedRaymarchSampleCount=67,108,864`, `estimatedPassCount=6`.
- HRC: `cascadeResolution=512`, `baseRayCount=16`, `shortIntervalCount=16`,
  `compositionLevels=4`, `lastComposedSpan=16`, `raymarchSteps=64`,
  `estimatedRaymarchSampleCount=268,435,456`, `estimatedPassCount=7`.
- Result: HRC still shows large vertical bands and repeated-shadow structure while costing 4x RC's
  reported raymarch samples. This is the actionable failing proof. The current fixed-angle interval
  composer is not a cheaper RC-equivalent hierarchy; it is a different approximation missing RC's
  recursive child-ray angular merge.

Matched-resolution passing parity snapshot:

- Deterministic baseline, visible example scene, both auto caps set to `512` through
  `window.__radianceCascadeControls.setComparisonResolutionCap(512)`.
- RC final irradiance: `128x128`; HRC final irradiance: `128x128`.
- RC: `cascadeResolution=512`, `baseRayCount=16`, `raymarchSteps=64`,
  `estimatedRaymarchSampleCount=67,108,864`, `estimatedPassCount=6`.
- HRC active hierarchy: `cascadeResolution=512`, `baseRayCount=16`, `raymarchSteps=64`,
  `estimatedRaymarchSampleCount=67,108,864`, `estimatedPassCount=6`.
- Browser screenshots were cropped to the scene rectangle and compared with ImageMagick:
  `compare -metric MAE` returned `0 (0)`.
- This proves current active HRC output parity with RC for the deterministic visible scene. It does
  not prove a cheaper Holographic implementation. The next Holographic work must replace the bridge
  piece by piece while preserving this exact A/B gate.

Retraction: the passing snapshot above proved only the RC-equivalent oracle bridge. It did not prove
true HRC. Do not cite it as HRC correctness.

Current root-cause evidence for the true interval path:

- Reapplying RC's texel-center convention to HRC short interval and composition ray origins did not
  remove the repeated bands/shadows. This rules out texel-edge origins as the primary root cause.
- Holding everything else fixed and changing only `shortIntervalCount` changes the artifact scale:
  `8 -> effectiveBaseInterval 91.79`, `16 -> 45.89`, `32 -> 22.95`, with broad/narrow repeated bands
  following the interval count.
- Therefore the current visible artifact is coupled to interval segmentation/composition, not a
  fixed atlas tile boundary. The likely failing invariant is still the one from the paper analysis:
  the current atlas composes distance intervals along the same base angular direction and cannot
  represent the child-ray angular hierarchy/cone split needed for far-field radiance.

Root cause fixed:

- The old composition pass sampled `nextInterval` from `p + span * rayDir`.
- That would be correct only if every tile stored a relative interval beginning at local distance 0.
- The implemented short-interval atlas stores absolute intervals: tile `i` raymarches
  `[i * L, (i + 1) * L]` from the original probe `p`.
- Sampling `nextInterval` from a shifted probe double-counted the offset and composed a farther
  translated segment. That directly caused repeated translated shadows.
- The fix composes `A(p, i)` with `B(p, i + span)` at identical probe/ray coordinates.

Post-fix deterministic probe, visible scene, cap `512`, filters/noise/GI disabled:

- RC: `estimatedRaymarchSampleCount=67,108,864`, `estimatedPassCount=6`.
- HRC `shortIntervalCount=4`, `compositionLevels=2`: same raymarch sample estimate as RC,
  `estimatedPassCount=5`, cropped-scene MAE `0.0139958`.
- HRC `shortIntervalCount=8`, `compositionLevels=3`: 2x RC raymarch sample estimate,
  `estimatedPassCount=6`, cropped-scene MAE `0.0146641`.
- HRC `shortIntervalCount=16`, `compositionLevels=4`: 4x RC raymarch sample estimate,
  `estimatedPassCount=7`, cropped-scene MAE `0.0225579`.
- Current measured default should prefer `4/2`; more absolute intervals are not automatically
  higher quality in this implementation.

Whitepaper cross-blur cleanup:

- The paper's post-quadrant cleanup kernel is center weight `4` plus four cardinal taps of weight
  `1`, with opacity-aware rejection.
- The HRC local filter now uses that cardinal weighting instead of the older stronger cardinal
  weight `2`. SDF center/neighbor/midpoint checks are still used to avoid bleeding across
  occluders.
- User-facing default probe, visible scene, cap `512`, current example defaults:
  - RC: `estimatedRaymarchSampleCount=67,108,864`, `estimatedPassCount=10`.
  - HRC `shortIntervalCount=4`, `compositionLevels=2`: same raymarch sample estimate,
    `estimatedPassCount=9`, cropped-scene MAE `0.0103968`.
- This improves the approximation, but it is still not full paper HRC. Missing structural items
  remain: quadrant solve/rotation, anisotropic grids, separate `T_n`/`R_n`, odd/even merge rules,
  angular fluence weighting, and the `R_0([x + 1, y], 0)` output offset.

Rejected quadrant-readout graft:

- A probe tried to apply the paper's four-quadrant `R_0([x + 1, y], 0)` style output offset on top
  of the current uniform full-circle short-interval atlas.
- Result: shader compiled and rendered, but the image developed large wedge/block artifacts around
  occluders. This is expected in hindsight: the current atlas stores uniformly spaced full-circle
  directions and then averages them, while the paper's readout assumes quadrant-specific `R_n`
  fields built from anisotropic probe grids and cone directions.
- Root cause: the offset is not a standalone final-pass trick. It is tied to the paper's quadrant
  radiance basis. Do not reapply the offset until the active render path has real quadrant `T_n` and
  `R_n` layouts.
- Probe artifacts were captured as `/private/tmp/rc-quadrant-readout.png` and
  `/private/tmp/hrc-quadrant-readout.png`, then the code change was reverted.

Only after the deterministic baseline passes should quality features be reintroduced one at a time:
local SDF filter, broad GI, then blue-noise jitter. Blue noise is not part of the correctness proof.

## What Carries Forward

The baseline RC pass validated these knobs and they should remain first-class in HRC:

- `raymarchSteps`: expose ray/interval budget explicitly; do not bury it in a fixed shader loop.
- `sceneRadianceDownsampleFactor`: make source radiance resolution a quality tier.
- `filterRadius`, `filterStrength`, `filterDiagonals`, `filterJitterStrength`: stable SDF-gated filtering helps blockiness without temporal accumulation.
- `mipBlur`, `mipStrength`, `wideDownsampleFactor`, `wideLevels`: broad GI can be useful when sourced from RC irradiance and SDF-gated, not from raw colored blobs.
  HRC should default to the cheap form first: `mipStrength > 0` for the SDF-aware downsample, with `mipBlur = 0` unless the extra separable blur passes visibly pay for themselves.
- `blueNoiseStrength`: blue noise can be useful as a baked shared texture sampled in shaders; it
  must not be regenerated per frame. Keep it disabled during RC/HRC correctness comparisons.
- `intervalOverlap`: modest interval overlap hides conventional RC cascade seams. For HRC, do not
  blindly stretch short intervals, because adjacent transfer composition would double-count the
  overlapped radiance. Carry this forward only as a seam-aware composition/readout rule, or leave it
  disabled until the transfer math explicitly accounts for overlap weights.

## What Must Not Carry Forward Blindly

- Do not make HRC a subclass that only changes default RC config. That would preserve the same per-cascade raymarch cost and miss the point.
- Do not implement Holographic RC as a final blur/mip chain. Holographic RC's core idea is to compose short ray intervals in a multi-level probe system, replacing conventional long raytracing.
- Do not mix the tiled-light proxy plan into the HRC class. Fixed-grid variable-depth light/proxy lists are a scene-radiance/front-end optimization. They can feed RC or HRC, but they are not HRC itself.
- Do not add temporal accumulation as a default quality fix. Dynamic 2D sprites/lights make history rejection expensive and unreliable.
- Do not advertise Holographic RC from presets until it changes real atlas/layout/composition behavior. The current HRC implementation is hierarchical interval composition; the holographic flag is only a future hook.

## Class Boundary

Keep two public classes:

- `RadianceCascades`: conventional bounded SDF raymarching reference path. It should remain easy to reason about, tune, and compare against.
- `HierarchicalRadianceCascades`: interval-composition path. Its first real implementation should introduce a short-interval atlas/pass, then compose those intervals into longer transfer rather than raymarching every cascade interval directly.

## Failed First HRC Slice

The first HRC slice was intentionally small:

1. Build a short-interval radiance atlas at the base probe/ray resolution.
2. Store interval radiance and transmittance in the same `<rgb, a>` convention as baseline RC.
3. Add one composition pass that combines adjacent short intervals into a longer interval.
4. Read out final irradiance from the composed interval texture and compare against `RadianceCascades` in the existing example.

That slice failed the matched-resolution A/B gate. It composes distance intervals, but it does not
compose RC's recursive child-ray angular hierarchy. Do not continue by increasing short interval
count, adding blue noise, or adding filters. The next implementation must change the stored angular
basis and merge/readout structure, then rerun the same deterministic gate.

## Holographic Gate

Do not implement `HolographicRadianceCascades` until HRC parity is proven. The final Holographic goal
is: reproduce conventional RC on the deterministic A/B gate first, then replace the conventional
hierarchy with Holographic transfer/radiance cascades while preserving the same acceptance
tolerances. The Holographic paper is not just the current HRC with different defaults; it changes
the probe geometry:

- split incoming fluence into quadrants,
- reduce spatial resolution only parallel to probe facing,
- preserve high spatial resolution perpendicular to ray direction,
- maintain transfer cascades and radiance cascades separately,
- handle odd/even probe positions differently,
- trace the first few short intervals directly,
- use an opacity-aware 1px cross blur for checkerboard artifacts.

Starting Holographic before the RC/HRC parity gate would compound the current uncertainty.

Whitepaper-derived correctness checklist for the next approximation pass:

- Quadrants: compute four directional quadrants and sum them. A single all-direction square atlas
  does not match the paper's fluence model.
- Anisotropic probe grid: for cascade level `n`, decimate only along the quadrant-facing axis
  (`p = (x * 2^n, y)`) and preserve full resolution perpendicular to the quadrant.
- Transfer vs radiance: keep separate transfer `T_n` and radiance/fluence `R_n` structures. The
  current fixed atlas stores interval radiance/transmittance together, which helped find the
  double-offset bug but is not the full paper algorithm.
- Direct short transfers: initialize `T_0`, `T_1`, and `T_2` with direct traces before composing
  longer transfers. The paper calls out this direct initialization to avoid amplified short-ray
  merge error.
- Transfer recursion: compute higher `T_n` from `T_{n-1}` using the even/odd direction rules
  (Eq. 18/Eq. 20), not by raymarching every long interval.
- Radiance recursion: compute `R_n` from `R_{n+1}`, `T_n`, and `T_{n+1}` with the odd/even probe
  rules (Eq. 14/Eq. 15). The even-probe interpolation rule exists specifically to avoid bias.
- Angular fluence weighting: apply the cone arc `A_n(i)` when merging transfer into radiance.
- Output offset: sample `R_0([x + 1, y], 0)` for each quadrant before rotating/summing to avoid
  diagonal overlap brightness bias.
- Checkerboard cleanup: after summing quadrants, apply the paper's 1px cross blur, but gate it by
  opacity/SDF similarity so light does not bleed across occluders.
- Boundary handling: treat out-of-domain `R_N` as zero or an explicit environment/offscreen-light
  boundary condition.

Implemented layout boundary:

- `HierarchicalRadianceCascades` now owns paper-shaped holographic storage metadata and render
  targets, separate from the active interval-composition atlas.
- Transfer levels allocate `T_0..T_N`.
- Radiance levels allocate only `R_0..R_{N-1}`; terminal `R_N` is represented as the zero boundary
  and is not allocated as a real texture.
- Each level preserves full probe resolution perpendicular to the quadrant and decimates only along
  the quadrant-facing axis. Four quadrants are packed by stacking them vertically in the atlas.
- The live example probe exposes `holographicLevelInfo`,
  `estimatedHolographicTransferValueCount`, and `estimatedHolographicRadianceValueCount` for
  vitexec verification.
- This started as storage/layout scaffolding. Direct `T_0..T_2` tracing and recursive `T_3..T_N`
  composition now write into these atlases; the next shader step is `R_n` radiance recursion.

Implemented direct transfer slice:

- Holographic mode now renders direct `T_0`, `T_1`, and `T_2` transfer atlases before the legacy
  interval-composition pass. Hierarchical mode does not pay this cost.
- Each transfer texel stores `<radiance.rgb, transmittance.a>` for
  `Trace(p, p + v_n(k))`, with four quadrants packed in the atlas and ray offsets rotated per
  quadrant.
- Direct transfer step count is bounded separately from the long interval path:
  `max(4, min(16, ceil(raymarchSteps / 4)))`. This follows the paper's point that direct
  initialization is for short rays and avoids making `T_0..T_2` as expensive as the old long-ray
  cascades.
- GPU vitexec probe, cap `512`, comparison baseline, HRC algorithm with
  `compositionMode='holographic'`:
  - final radiance grid: `128x128`
  - direct transfer passes: `3`
  - direct transfer texels: `311,296`
  - direct transfer samples: `4,980,736`
  - total reported HRC raymarch samples including the still-active interval path: `72,089,600`
- At the time this slice landed, higher `T_n` recursion was still missing. The following slice
  implements that recursion.

Implemented recursive transfer slice:

- Holographic mode now composes `T_3..T_N` from the previous transfer level instead of
  raymarching those longer rays.
- Even transfer directions use Eq. 18:
  `Merge(T_{n-1}(p, k/2), T_{n-1}(p + v_{n-1}(k/2), k/2))`.
- Odd transfer directions use Eq. 20 by averaging the two adjacent merged approximations:
  `Merge(T_{n-1}(p, low), T_{n-1}(p + v_{n-1}(low), high))` and
  `Merge(T_{n-1}(p, high), T_{n-1}(p + v_{n-1}(high), low))`.
- Out-of-domain source probes are multiplied by zero instead of clamped, matching the paper's
  zero/offscreen-boundary assumption.
- GPU vitexec probe, cap `512`, comparison baseline, HRC algorithm with
  `compositionMode='holographic'`:
  - final radiance grid: `128x128`
  - direct transfer passes: `3`
  - recursive transfer passes: `5`
  - recursive transfer texels: `343,552`
  - total reported HRC raymarch samples: `72,089,600`; recursive transfer adds passes but no
    raymarch-loop samples.
- This is still not complete paper HRC. Transfer acceleration is now present, but `R_n` recursion
  (Eq. 14/Eq. 15/Eq. 17), angular fluence weighting, and quadrant readout remain to be implemented
  before holographic mode can replace the active interval-composition output.

Implemented radiance recursion slice:

- Holographic mode now computes `R_{N-1}..R_0` from the composed transfer atlases and the next
  radiance level, writing into the paper-shaped radiance atlases.
- Odd probe columns use Eq. 14: merge the weighted edge transfer `T_n(p,k)` with
  `R_{n+1}(p + v_n(k), j)`.
- Even probe columns use Eq. 15/Eq. 17: average the direct child radiance `R_{n+1}(p,j)` with the
  traced child reached by `T_{n+1}(p, 2k)`.
- Child transfer radiance is converted to angular fluence with the paper's cone arc
  `A_{n+1}(j) = atan((2(j+1)-2^(n+1))/2^(n+1)) - atan((2j-2^(n+1))/2^(n+1))`.
- Terminal `R_N` remains the zero boundary, so the highest material samples no next radiance
  texture.
- GPU vitexec probe, cap `512`, comparison baseline, HRC algorithm with
  `compositionMode='holographic'`:
  - final radiance grid: `128x128`
  - direct transfer passes: `3`
  - recursive transfer passes: `5`
  - radiance recursion passes: `7`
  - radiance texels: `458,752`
  - total reported HRC raymarch samples: `72,089,600`
- This is still not complete paper HRC. The `R_n` atlases are now written, but the active final
  output still uses the legacy interval-composition atlas. The next required step is a holographic
  final readout that sums the four quadrant `R_0([x + 1, y], 0)` values and then applies the
  opacity-aware cross blur.

Implemented first holographic final readout:

- Holographic mode now renders final irradiance from `R_0` instead of the legacy short-interval
  atlas. Hierarchical mode still uses the interval atlas.
- The readout samples the four packed quadrants with one-probe offsets:
  - +x: `[x + 1, y]`
  - +y: `[y + 1, x]`
  - -x: `[x - 1, y]`
  - -y: `[y - 1, x]`
- The summed quadrant fluence is divided by `2π` before handing it to the existing lighting
  pipeline. Without this normalization, the result was visibly over-bright because `R_n` stores
  angular fluence while the existing RC path exposes an averaged radiance/irradiance texture.
- GPU vitexec probe confirmed the active readout mode as `holographic-r0`.
- Deterministic comparison against RC, cap `512`, comparison baseline with filters disabled:
  - RC samples: `67,108,864`, passes: `6`
  - Holographic samples: `72,089,600`, passes: `20`
  - cropped screenshot MAE: `0.136075`
- This proves the final readout path is active, but it is not yet visually acceptable. Remaining
  root-cause work: validate quadrant orientation/signs against the paper's rotation procedure,
  apply the required opacity-aware 1px cross blur in the holographic final path, and then run a
  parity pass against RC with deterministic screenshots.

Holographic readout orientation/debug follow-up:

- Root cause found: the negative quadrants were initially stored in world coordinates where rays
  advanced toward decreasing parallel coordinates, while the `T_n` and `R_n` recursions assume
  every quadrant advances in positive canonical parallel coordinates.
- Fix: mirror canonical parallel storage for the `-x` and `-y` quadrants and update their
  `R_0` readout offsets. Deterministic cropped MAE improved from `0.136075` to `0.097604`.
- Added the paper's mandatory opacity-aware 1px cross blur directly to the holographic final
  readout. This barely moved the MAE (`0.097604` to `0.097459`), so the main error was not the
  checkerboard cleanup.
- Fix: mirror the +y quadrant's canonical perpendicular coordinate to match its `-lateral`
  rotation. Deterministic cropped MAE improved to `0.096441`.
- Rejected a later `-y` perpendicular mirror candidate. It worsened deterministic cropped MAE from
  `0.096441` to `0.098843`, so the candidate was reverted.
- Paper re-check: `T_0..T_2` should initialize `Trace(p, p + v_n(k))` on the same probe lattice
  used by the recursive `T_n`/`R_n` equations, where `p = (x * 2^n, y)`. The direct transfer pass
  was tracing from half-pixel centers while recursive transfer/radiance used integer lattice
  positions. Aligning the direct transfer start lattice improved deterministic cropped MAE to
  `0.093754`.
- Best-fit scalar after the lattice fix is still about `1.119x`, improving cropped MAE from
  `0.093754` to `0.061975`. This confirms a normalization/exposure mismatch is present, but the
  remaining visual error is still structural around occluders and cannot be fixed honestly with a
  single multiplier.
- Readout offset follow-up:
  - Rejected a `+y` perpendicular inverse candidate (`R - x` instead of `R - 1 - x`); it worsened
    cropped MAE to `0.094425`.
  - Fixed negative quadrant readout offsets to use `R - 1 - coord` for both `-x` and `-y`. This
    improved cropped MAE to `0.091020`.
  - Removed the extra positive-quadrant parallel `+1` readout offsets after the direct transfer
    start lattice was aligned to integer probes. This improved cropped MAE to `0.088246`. Working
    hypothesis: with this implementation's integer-lattice storage transform, applying the paper's
    `R_0([x + 1, y], 0)` bias again in final readout double-shifted translated shadow energy.
    This needs to remain guarded by visual probes; it is not a license to ignore the paper offset in
    a different storage convention.
  - Best-fit scalar after the readout-offset fixes is about `1.1105x`, improving cropped MAE from
    `0.088246` to `0.059174`. Normalization remains a contributor, but the structural gap around
    occluders remains.
- Active holographic path cost fix:
  - Holographic mode no longer renders the legacy short-interval atlas or interval composition
    passes. The active final readout uses `R_0`, so those passes were unused work.
  - Deterministic vitexec probe, cap `512`, comparison baseline: cropped MAE remained `0.088246`.
  - Reported HRC raymarch-loop sample count dropped from `72,089,600` to `4,980,736`, because only
    directly traced `T_0..T_2` transfer texels run raymarch loops. Estimated pass count dropped from
    `20` to `17` while keeping the same visible output.

Current falsified Holographic hypotheses:

- Increasing direct `T_0..T_2` raymarch steps from `ceil(raymarchSteps / 4)` capped at `16` to the
  full `raymarchSteps = 64` increased HRC traced samples from `4,980,736` to `19,922,944` but
  worsened the deterministic cropped MAE from `0.088246` to `0.088409`. Direct-transfer
  raymarch-step undersampling is therefore not the current dominant error.
- Reapplying the paper-style `R_0([x + 1, y], 0)` final readout offset to all packed quadrants in
  the current storage convention worsened cropped MAE to `0.093915`. The removed-offset state
  remains the current best for this implementation; do not reintroduce the offset without changing
  the storage transform that makes the offset meaningful.
- Making Holographic mode use the full `cascadeResolution` as its internal fluence grid, instead of
  the RC-compatible final irradiance resolution `cascadeResolution / sqrt(baseRayCount)`, also
  worsened the visible comparison. At cap `256`, corrected full-grid HRC cost `19,922,944` traced
  samples and cropped MAE against RC cap `256` was `0.094737`. Against the cap `512` RC visual
  reference it was `0.095781`. The remaining error is not solved by simply raising the HRC R0 atlas
  resolution.
- Isolated light probes show similar error for both directions: warm-only cropped MAE `0.056689`,
  cool-only cropped MAE `0.053852`. That argues against a single broken quadrant transform and
  points back to shared transfer/radiance recursion or normalization.
- Added an example probe control `setOccluders(enabled)` that disables shadow casting and moves the
  three occluders far out of the scene. With occluders disabled but both point lights active,
  cropped MAE rose to `0.212741`; RC crop mean was `0.956804, 0.980888, 0.979366`, while HRC mean
  was `0.780936, 0.680791, 0.817109`. This proves the current Holographic error is not primarily
  an SDF/occluder lookup problem.
- Ambient-only diagnostic (`warmIntensity = 0`, `coolIntensity = 0`, occluders disabled) still has
  cropped MAE `0.047197`; RC crop mean was `0.056222, 0.070370, 0.099154`, while HRC mean was
  `0.018698, 0.024818, 0.040639`. The solver is under-accumulating smooth radiance before point
  light falloff or shadowing enter the picture.
- Rejected Eq. 15/even-`x` direction candidate: changing the traced branch from
  `T_{n+1}(p, 2 * edgeDirection)` to `T_{n+1}(p, 2i - 1 / 2i + 1)` worsened ambient-only cropped
  MAE from `0.047197` to `0.051900` and dimmed HRC further. The current transfer-direction mapping
  remains better for this storage convention.
- Aspect diagnostic: the live example world is `640x360` while HRC currently uses a square
  `128x128` final grid. Temporarily forcing HRC world bounds to a `640x640` square improved
  ambient-only cropped MAE from `0.047197` to `0.040677`, so aspect distortion contributes to the
  error. It did not solve under-accumulation and was reverted; a real fix would need rectangular
  HRC quadrant storage/readout, not square-world stretching.
- Rectangular Holographic storage/readout follow-up: HRC now derives Holographic output dimensions
  from world aspect and packs the four rotated quadrants into padded max-dimension atlases. For the
  live `640x360` example at cap `512`, final HRC irradiance is `128x72`; +X/-X quadrants use
  `128x72` logical grids and +Y/-Y use rotated `72x128` logical grids.
  - Full scene cropped MAE improved from `0.048479` to `0.033007`.
  - No-occluder point-light cropped MAE worsened from `0.059013` to `0.076288`.
  - Ambient-only cropped MAE was roughly unchanged/slightly worse: `0.022611 -> 0.023552`.
  - Adding per-quadrant logical bounds to recursive transfer/radiance sampling had no measurable
    pixel impact (`0.0330069`, `0.0762875`, `0.0235518`), so padded atlas leakage is not the active
    root cause.
  - Current read: aspect-correct quadrant geometry helps shadowed composition but is not sufficient
    correctness proof because the simple smooth-radiance gates regressed. Do not solve this with a
    scalar; continue by proving the transfer/radiance recurrence against no-occluder and ambient
    probes.
- Added a probe-only direct final-radiance readback helper to the example:
  `window.__radianceCascadeControls.compareFinalRadiance()`. It switches RC/HRC, reads both final
  render targets with `renderer.readRenderTargetPixelsAsync`, decodes half-float values, resamples
  RC onto HRC's aspect-correct grid, and logs RGB mean/MAE/RMSE/max. This avoids relying only on
  canvas crop MAE when debugging solver energy.
  - Full scene, cap `512`: RC mean `[155.74, 93.66, 177.68]`, HRC mean
    `[177.70, 109.60, 211.28]`, MAE `[39.90, 25.29, 55.36]`.
  - No-occluder point lights: RC mean `[454.14, 295.03, 586.86]`, HRC mean
    `[250.30, 161.46, 319.74]`, MAE `[235.02, 133.60, 331.69]`.
  - Ambient-only: RC mean `[1.0765, 1.4826, 2.7404]`, HRC mean
    `[0.7451, 1.0265, 1.8969]`, MAE `[0.3318, 0.4566, 0.8444]`.
  - Current read: smooth fields under-accumulate by roughly the same ratio, but the occluded full
    scene is over-bright in mean. This confirms the remaining problem is not a single scalar; HRC
    has both smooth-fluence normalization/extent error and shadow/transfer leakage.
- Rejected even-probe sum diagnostic: changing Eq. 15's even-probe branch from
  `0.5 * (directChild + tracedChild)` to `directChild + tracedChild` improved the no-occluder
  point-light crop (`0.076288 -> 0.018488`), but broke ambient-only (`0.023552 -> 0.096963`) and
  full scene (`0.033007 -> 0.221194`). The average is not the sole missing energy term; the sum
  behaves like a scene-dependent exposure cheat and was reverted.
- Rejected rectangular positive-readout offset diagnostic: after rectangular storage, reapplying the
  paper-style positive quadrant offset to +X/+Y (`R0([x+1,y])` in those two canonical readouts)
  slightly improved full-scene cropped MAE (`0.033007 -> 0.032572`) but worsened no-occluder
  (`0.076288 -> 0.076450`) and ambient-only (`0.023552 -> 0.023902`). This still looks like a
  shadow-placement improvement coupled to smooth-radiance damage, so the offset was reverted for
  the current storage convention.
- Rejected direct-transfer mirror-origin diagnostic: changing mirrored direct transfer start
  coordinates from `dimension - coord` to `dimension - 1 - coord` worsened full-scene cropped MAE
  (`0.033007 -> 0.034014`) and no-occluder (`0.076288 -> 0.077553`), while ambient-only was
  effectively unchanged (`0.023552 -> 0.023553`). The current direct trace lattice remains better
  even though final readout mirrors use `dimension - 1 - coord`.
- Rejected diagonal terminal-extent diagnostic: changing Holographic terminal level from
  `ceil(log2(max(width,height)))` to `ceil(log2(hypot(width,height)))` added a level but had no
  useful effect in direct final-radiance readback. Ambient MAE moved only
  `[0.331806, 0.456637, 0.844398] -> [0.331797, 0.456625, 0.844374]`, while full/no-occluder were
  effectively unchanged/slightly worse. Reverted to max-axis terminal level.
- Normalization fix: changing the Holographic final readout from dividing summed quadrant fluence by
  `2π` to dividing by `π` materially improved every deterministic probe:
  - full scene cropped MAE: `0.088246 -> 0.048479`
  - no-occluder point-light cropped MAE: `0.212741 -> 0.059013`
  - ambient-only cropped MAE: `0.047197 -> 0.022611`
  This indicates the previous final conversion from HRC fluence to the renderer's RC-style
  irradiance texture was off by a factor of two for this implementation's `R_0` basis.
- Post-normalization scalar sweep: ambient/no-occluder probes improve further near `1.4x`, but the
  full scene worsens immediately (`0.048479 -> 0.109029` at `1.2x`). The remaining gap is therefore
  structural around occluders/shadow transfer, not a global exposure factor.
- Do not optimize further until correctness is much closer. Current holographic is cheaper in
  raymarch-loop work, but still has many transfer/radiance atlas passes and is not yet RC-parity.
- Angular arc / wall-open diagnostic:
  - Verified Three TSL `atan(y, x)` matches the intended `atan2(y, x)` usage.
  - The current cone arc formula sums to exactly `π/2` across each quadrant for every tested
    direction count, so the residual scalar mismatch is not caused by a transposed `atan` or a cone
    arc that fails to cover the quadrant.
  - Wall-open deterministic probe, cap `512`, comparison baseline: cropped MAE was `0.090280`,
    best-fit scalar was `1.1272x`, and scaled MAE was `0.051342`. Reducing the hard occlusion did
    not remove the global energy mismatch, but the scaled error improved, which keeps both
    normalization and transfer/radiance merge structure on the suspect list.
- Current conclusion: quadrant storage/readout and transfer-lattice alignment are directionally more
  correct, but the visible result is still not RC-parity. Remaining likely root causes are in the
  `R_n` even/odd merge details, angular-fluence/radiance normalization, or the expected difference
  between paper fluence output and the existing RC averaged-radiance pipeline.
- Priority order:
  - Finish holographic correctness against RC first.
  - Then loop back to performance optimization with measured GPU timings.
  - Keep hierarchical interval composition as a separate correctness target; it is currently visibly
    wrong and should not be treated as a solved fast path.

## Current Tuning Evidence

## Pinned Follow-Up: Self Luminance

- HRC/RC should support self-luminant scene content, not only traditional `Light2D` emitters.
- The current HRC tracing path samples `sceneRadianceTexture`, so the algorithm can propagate
  self illumination if emissive/luminous sprites or materials are correctly rendered into that
  texture.
- This still needs an explicit audit and example/probe after the HRC parity work: add or verify a
  self-luminant object path, compare RC/HRC propagation, and make sure it works without adding a
  hidden `Light2D` proxy.

- HRC has two separate costs: physical atlas pixels and raymarch-loop texels. The full atlas still
  costs a fragment pass, but only tiles with `intervalIndex < shortIntervalCount` run the bounded
  SDF raymarch loop.
- Track `estimatedRaymarchTexelCount`, `estimatedPhysicalRaymarchTexelCount`, and
  `estimatedUnusedRaymarchTexelCount` separately. Optimizing interval counts by atlas grid alone can
  increase real raymarch samples even when the physical atlas size stays constant.
- `shortIntervalCount` is shader-structural state. Changing it must rebuild composition materials
  even if `ceil(sqrt(shortIntervalCount))` and the atlas dimensions stay unchanged.

## Tiled Proxy Plan

The old fixed-grid variable-depth idea is still valid, but it belongs before the radiance algorithm:

- Build a fixed grid over scene radiance.
- Use SDF openness to decide whether a tile sees detailed lights or proxy lights.
- Keep the grid fixed for stable frame time; vary only the light/proxy list contents.
- Feed the resulting radiance texture into RC/HRC.

This can reduce the cost of `radiance.scene` in scenes with many dynamic lights without changing GI semantics.
