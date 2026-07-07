---
"three-flatland": patch
---

> Branch: fix/dissolve-instant-vanish
> PR: https://github.com/thejustinwalsh/three-flatland/pull/158

## Bug Fixes

- Fixed the react `tsl-nodes` dissolve example vanishing almost instantly instead of fading over 1.5s
  - Root cause: the noise/data texture was tagged sRGB via the `pixel-art` preset, causing WebGPU to hardware-decode samples and skew the dissolve threshold toward 0
  - Noise texture now sets nearest filtering directly instead of going through the color-oriented preset, matching the vanilla three.js example
- Added test coverage for `applyTextureOptions` documenting that `colorSpace` is only applied when explicitly requested, so data/mask textures (noise, height, distortion maps) can opt out

Fixes a visual bug in an example — no API changes.
