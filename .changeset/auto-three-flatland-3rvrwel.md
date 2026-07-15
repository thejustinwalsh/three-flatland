---
"three-flatland": patch
---

> Branch: fix/flatland-react-aspect
> PR: https://github.com/thejustinwalsh/three-flatland/pull/181

## Fixes

- `Flatland` now auto-derives the camera aspect ratio from the render surface each frame, instead of defaulting to `1` until an explicit `resize()` call. Previously, R3F consumers had no obvious lifecycle hook to trigger `resize()`, so scenes could render squashed/stretched (e.g. an 800-unit frustum rendered 1.78x too large on a 1280x720 canvas) until the app manually synced camera and renderer size.
  - Aspect now tracks the `RenderTarget`'s dimensions when rendering to texture, or the renderer's size otherwise. Unchanged sizes short-circuit, so tile buffers (e.g. `LightEffect`) don't reallocate needlessly.
  - Calling `resize()` or setting `aspect` explicitly still switches to manual mode permanently — existing callers are unaffected.
  - Zero/negative/NaN dimensions are now a no-op rather than latching a broken frustum, so transient 0x0 sizes self-heal on the next frame.
- `aspect` is now a real accessor (previously constructor-only), making it settable via JSX property-setting under R3F's no-arg-construction pattern.

Verified pixel-identical rendering between the React and three.js examples/uikit twins on WebGPU, with no example-side changes required. Test suite grew from 792 to 803 tests.

This release fixes a class of aspect-ratio bugs affecting React Three Fiber consumers of `Flatland` and makes `aspect` reactively settable as a JSX prop.
