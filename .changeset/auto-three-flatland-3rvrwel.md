---
"three-flatland": patch
---

> Branch: fix/flatland-react-aspect
> PR: https://github.com/thejustinwalsh/three-flatland/pull/181

## Fixes

- `Flatland` now auto-derives the camera aspect ratio from the render surface (renderer viewport, or the `RenderTarget` when rendering to texture) on every render, instead of defaulting to a static `1` and requiring a manual `resize()` call. Fixes scenes rendering at the wrong scale when nothing calls `resize()` (e.g. under R3F, where there was no natural place to wire a resize handler).
- `aspect` is now a real get/set accessor (previously constructor-only), so it can be assigned via property-setting, including from JSX under R3F.
- Setting `aspect` explicitly, or calling `resize()`, permanently switches Flatland to manual aspect control — auto-sync only applies when `aspect` is omitted, so existing manual callers are unaffected.
- Unchanged renderer/render-target sizes short-circuit the aspect recompute, avoiding unnecessary `LightEffect` tile buffer reallocation. Zero/negative/NaN dimensions are ignored rather than latching a broken frustum, so a `0x0` initial frame self-heals automatically.

Verified on WebGPU: React and three.js example twins now render pixel-identical geometry with no example-side changes required.
