---
"three-flatland": patch
---

> Branch: fix/flatland-react-aspect
> PR: https://github.com/thejustinwalsh/three-flatland/pull/181

## Fixes

- `Flatland` now auto-derives the camera aspect from the render surface every frame instead of defaulting to 1 and staying there until `resize()` was called manually. Previously, consumers (especially R3F users) had no obvious place to trigger a resize, causing scenes to render distorted (e.g. 1.78x too large) until they discovered the undocumented handshake.
  - Aspect is derived from the `RenderTarget` dimensions when rendering to texture, otherwise from the renderer's size; unchanged sizes short-circuit to avoid unnecessary reallocation of `LightEffect` tile buffers.
  - Calling `resize()` or setting `aspect =` explicitly still switches to manual mode permanently — existing callers are unaffected.
  - Zero/negative/NaN dimensions are now a no-op, so a transient 0x0 first frame self-heals instead of permanently pinning aspect to 1.
  - `aspect` is now a real property accessor (was constructor-only), making it settable from JSX under R3F's no-arg-construction + property-setting pattern.

Verified pixel-identical rendering between the React and three.js twins of the `uikit` example on WebGPU, with no example-side changes required.

Fixes camera aspect ratio distortion in R3F scenes that don't manually wire a resize handler.
