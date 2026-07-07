---
"three-flatland": patch
---

> Branch: fix/dissolve-instant-vanish
> PR: https://github.com/thejustinwalsh/three-flatland/pull/158

### Bug Fixes

- Fixed the dissolve effect in the react `tsl-nodes` example vanishing almost instantly instead of fading over 1.5s. The noise texture was tagged sRGB via the `'pixel-art'` preset, causing WebGPU to hardware-decode it as color data and skew the noise distribution toward 0. It now applies nearest filtering directly instead of going through the preset, leaving `colorSpace` untouched — matching the vanilla three.js example's behavior.
- `applyTextureOptions` now only sets `colorSpace` when explicitly provided in the options object, letting callers building data/mask textures (noise, height, distortion) opt out of color-space tagging entirely.

Fixes an incorrect sRGB tag on the dissolve noise texture that was breaking the fade timing in the react tsl-nodes example.
