---
"three-flatland": patch
---

> Branch: fix/flatland-react-aspect
> PR: https://github.com/thejustinwalsh/three-flatland/pull/181

### Fixes

- `Flatland` now auto-derives the camera aspect ratio from the renderer (or render target) size on every render, instead of defaulting to a fixed `1` until `resize()` was called manually. Fixes distorted/oversized geometry in R3F usage, where no obvious hook existed to call `resize()` on canvas size changes.
- `aspect` is now a real get/set accessor (previously constructor-only), so it can be read or assigned from JSX under R3F's no-arg-construction + property-setting pattern.
- Calling `resize()` or assigning `aspect` still switches to manual control permanently, preserving existing caller behavior byte-for-byte.
- Zero, negative, or non-finite dimensions (e.g. an unmeasured 0x0 canvas on first R3F commit) are now ignored rather than latching a broken frustum, so auto-sync self-heals on the next valid frame.
- Auto-sync short-circuits when the size hasn't changed, avoiding redundant `LightEffect` GPU tile buffer reallocation.

### Summary
Fixes camera aspect ratio not tracking the render surface automatically, which caused distorted scenes in React Three Fiber apps that don't manually call `resize()`.
