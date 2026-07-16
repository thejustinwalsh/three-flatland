---
"three-flatland": patch
---

> Branch: fix/flatland-react-aspect
> PR: https://github.com/thejustinwalsh/three-flatland/pull/181

- Fix: `Flatland` now automatically derives the camera aspect ratio from the renderer's viewport (or the render target, when rendering to texture) on every render, instead of defaulting to a fixed aspect of 1 until `resize()` was called
- Fixes incorrect/distorted scene geometry in R3F integrations that never called `resize()` manually (previously off by up to ~1.78x on common canvas sizes)
- `aspect` is now a real accessor (getter/setter), reachable as a JSX prop under R3F's no-arg-construction + property-setting pattern; setting it switches to manual aspect control
- Calling `resize()` also switches to manual aspect control going forward, matching existing behavior for all current callers
- Zero, negative, or non-finite dimensions are ignored as a no-op, so a transient unmeasured 0x0 layout self-heals on the next frame instead of permanently latching a broken frustum
- Unchanged sizes short-circuit the sync so effects like `LightEffect` tile buffers only reallocate on real size changes

Fixes camera aspect ratio distortion in `Flatland`, especially for React Three Fiber consumers that had no lifecycle hook to trigger a manual resize.
