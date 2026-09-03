# Shader visual judgment

- Large total-luminance loss usually means missing transport, premature ray termination, wrong normalization, or omitted compute work.
- Large mean-green growth relative to red/blue often means emissive-area energy dominates or color-space conversion moved stages.
- More dark coverage with similar highlights often means transported radiance vanished while direct emission survived.
- More clipped coverage means intensity, exposure, packing range, or accumulation is saturating.
- Lower edge energy can mean desired denoising or lost shadows; inspect the difference image.
- High changed-pixel ratio with stable global statistics can mean coordinate drift, Y-flip, camera phase, or temporal swimming.

Crop to the exact authored canvas. Compare energy in linear-light luminance. Retain sRGB channel statistics for presentation/color regressions. Require exact parity for backend ports unless a documented quantization tolerance applies.

Record each capture with its id, commit, status, exact fixture URL, shader path, settings, dimensions, baseline id, metrics path, human judgment, and evidence-supported technical judgment. When a verdict surprises the metrics, record the miss and add a signal or fixture before the next pass.

A reported backend feature bit is only permission to compile a specialization, not proof that its scheduling semantics are correct. Before an accelerated path becomes automatic, compare a deterministic rendered frame or readback against the baseline. If a scheduler loses energy while a dense kernel using the same feature does not, quarantine the scheduler rather than disabling the feature globally.
