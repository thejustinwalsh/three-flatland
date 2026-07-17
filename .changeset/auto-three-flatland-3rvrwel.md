---
"three-flatland": patch
---

> Branch: fix/flatland-react-aspect
> PR: https://github.com/thejustinwalsh/three-flatland/pull/181

### Fixes

- `Flatland` now auto-derives the camera aspect ratio from the renderer (or the active `RenderTarget`) on every render, instead of defaulting to a fixed aspect of 1 until `resize()` was called manually.
  - Fixes distorted/oversized scenes in R3F, where nothing previously called `resize()` for you (e.g. a bare `<flatland>` rendered at aspect 1 regardless of actual canvas size, ~1.78x too large on a 1280x720 canvas).
  - `aspect` is now a real get/set accessor, reachable from JSX under R3F's no-arg-construction + property-setting pattern (previously constructor-only).
  - Calling `resize()` or setting `aspect` explicitly still switches to manual control permanently — existing callers are unaffected.
  - Invalid sizes (zero, negative, NaN — e.g. R3F's unmeasured first commit) are ignored rather than latching a broken frustum, so auto-sync self-heals once a real size is available.
  - Unchanged sizes short-circuit the sync so `LightEffect` tile buffers only reallocate on real size changes.

Fixes scenes rendered via React Three Fiber matching aspect ratio automatically, removing the need for a hand-rolled resize bridge.
