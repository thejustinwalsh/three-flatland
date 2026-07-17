---
"three-flatland": patch
---

> Branch: fix/flatland-react-aspect
> PR: https://github.com/thejustinwalsh/three-flatland/pull/181

### Fixes

- `Flatland` now auto-derives the camera aspect ratio from the render surface each frame, instead of defaulting to `1` until `resize()` was manually called. Fixes distorted/oversized rendering (e.g. 1.78x scale error) for consumers — especially R3F — that never wired up a resize handler.
  - Aspect is derived from the active `RenderTarget`'s dimensions when rendering to texture, otherwise from the renderer's size. Recomputation is skipped when the size is unchanged, so `LightEffect` tile buffers only reallocate on real changes.
  - Zero/negative/NaN surface dimensions are now a no-op rather than latching a broken aspect, so a `0x0` first frame self-heals instead of permanently pinning aspect `1`.
  - `aspect` is now a real accessor (previously constructor-only), making it settable from JSX under R3F's no-arg-construction + property-setting pattern.
  - Calling `resize()` or setting `aspect` explicitly still switches to manual mode permanently — existing callers are unaffected.

Summary: fixes incorrect/distorted rendering caused by stale camera aspect ratios, particularly for React Three Fiber consumers with no resize handler wired up.
