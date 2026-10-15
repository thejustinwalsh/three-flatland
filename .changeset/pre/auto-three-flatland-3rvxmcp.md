---
"three-flatland": patch
---

> Branch: fix/dissolve-instant-vanish
> PR: https://github.com/thejustinwalsh/three-flatland/pull/158

- Fix: the dissolve effect in the react `tsl-nodes` example vanished almost instantly instead of fading out over 1.5s. Caused by the noise texture being tagged sRGB via the `pixel-art` preset, which made WebGPU hardware-decode the raw noise samples and skew them toward 0. The noise texture now sets nearest filtering directly and leaves `colorSpace` untouched, matching the vanilla three.js example's behavior.
- Add tests for `applyTextureOptions` documenting that `colorSpace` is only applied when explicitly provided, so data/mask textures (noise, height, distortion maps) can opt out of sRGB tagging.

Fixes a bug where the WebGPU dissolve shader example dissolved too fast due to incorrect sRGB tagging on a non-color noise texture; no public API changes.
