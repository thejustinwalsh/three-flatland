---
"three-flatland": patch
---

> Branch: fix/dissolve-instant-vanish
> PR: https://github.com/thejustinwalsh/three-flatland/pull/158

### Fixes

- Fix the React `tsl-nodes` dissolve example vanishing almost instantly instead of fading over 1.5s. The noise texture was tagged sRGB via the `pixel-art` preset, causing WebGPU to hardware-decode the scalar noise values and skew them toward 0. Noise texture now sets nearest filtering directly and leaves `colorSpace` untouched, matching the vanilla Three.js example's behavior.
- `applyTextureOptions` now only applies `colorSpace` when explicitly provided in a custom options object, so data/mask textures (noise, height, distortion) can opt out of color-space tagging entirely.

Fixes a visual regression in the React dissolve example; no public API changes.
