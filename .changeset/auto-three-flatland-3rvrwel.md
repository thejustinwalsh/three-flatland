---
"three-flatland": patch
---

> Branch: fix/flatland-react-aspect
> PR: https://github.com/thejustinwalsh/three-flatland/pull/181

### Fixed

- `Flatland` now derives its camera aspect ratio automatically from the render surface (renderer size, or the `RenderTarget` size when rendering to texture) instead of defaulting to a fixed `1` and requiring a manual `resize()` call. Fixes distorted/oversized rendering in consumers (e.g. React Three Fiber) that never wired up a resize handshake.
- Unchanged surface sizes short-circuit, so effects like `LightEffect` don't reallocate tile buffers every frame.
- Zero/negative/NaN surface dimensions are now a no-op rather than latching a broken frustum, so a `0x0` initial frame self-heals on the next render.

### Changed

- `aspect` is now a real get/set accessor on `Flatland` (previously constructor-only), making it reachable from JSX under R3F's no-arg-construction + property-setting pattern.
- Passing an explicit `aspect` option/property, or calling `resize()`, switches `Flatland` to manual aspect control permanently — existing callers that already manage aspect are unaffected.

Auto camera aspect sync eliminates a silent, undocumented resize handshake that every consumer previously had to implement by hand.
