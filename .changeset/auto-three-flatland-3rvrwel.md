---
"three-flatland": patch
---

> Branch: fix/flatland-react-aspect
> PR: https://github.com/thejustinwalsh/three-flatland/pull/181

### Fixes

- `Flatland` now auto-derives camera aspect from the render surface (RenderTarget dimensions when rendering to texture, otherwise the renderer's size) instead of defaulting to a stale aspect of 1 until `resize()` was manually called. Fixes distorted/oversized scenes in R3F consumers that had no natural place to wire a resize handler.
- Unchanged surface sizes short-circuit, so `LightEffect` tile buffers only reallocate on real changes.
- Calling `resize()` or setting `aspect =` explicitly switches to manual mode permanently — existing callers are unaffected.
- Zero/negative/NaN dimensions are now a no-op, so a `0x0` initial frame self-heals instead of permanently pinning aspect to 1.
- `aspect` is now a real accessor (previously constructor-only), making it reachable from JSX under R3F's no-arg-construction + property-setting pattern.

This is a bug fix with no breaking API changes: it corrects incorrect camera aspect/frustum behavior for consumers (especially React Three Fiber) that weren't manually resizing `Flatland`.
