---
"three-flatland": patch
---

> Branch: fix/flatland-react-aspect
> PR: https://github.com/thejustinwalsh/three-flatland/pull/181

### Bug Fixes

- `Flatland` now derives the camera aspect ratio automatically from the render surface every frame, instead of defaulting to aspect `1` and requiring an explicit `resize()` call that nothing documented or wired up
- Fixes incorrect scene scale under R3F, where mounting `<flatland>` without a manual resize handler rendered geometry ~1.78x too large
- Aspect is sourced from the active `RenderTarget`'s dimensions when rendering to texture, otherwise from the renderer's size; unchanged sizes are skipped so effect tile buffers don't needlessly reallocate
- Calling `resize()` or setting `aspect` explicitly still works and now permanently switches to manual mode, preserving existing caller behavior byte-for-byte
- Zero/negative/NaN dimensions are now a no-op rather than latching a broken frustum, so a 0x0 initial size self-heals on the next valid frame
- `aspect` is now a proper accessor (previously constructor-only), making it settable from JSX under R3F's property-setting pattern

### Summary

Fixes automatic camera aspect syncing in `Flatland` so React Three Fiber consumers no longer need an undocumented manual resize handshake to render at the correct scale.
