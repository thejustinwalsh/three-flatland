---
"three-flatland": patch
---

> Branch: fix/flatland-react-aspect
> PR: https://github.com/thejustinwalsh/three-flatland/pull/181

### Fixes

- `Flatland` now auto-derives the camera aspect ratio from the renderer (or render target, when rendering to texture) every frame, instead of defaulting to a fixed aspect of `1` until `resize()` was manually called. Fixes scenes under React Three Fiber rendering at the wrong aspect ratio when no manual resize bridge was wired up.
- `aspect` is now a real accessor (get/set), previously constructor-only and unreachable from JSX under R3F's no-arg-construction + property-setting pattern.
- Calling `resize()` or assigning `aspect` still switches to manual control permanently, preserving existing behavior for consumers who manage sizing themselves.
- Zero, negative, or `NaN` dimensions are now ignored as a no-op, so an unmeasured `0x0` first layout (e.g. R3F's first commit) self-heals on the next valid frame instead of latching a broken frustum.
- Unchanged renderer/render-target sizes are skipped during auto-sync to avoid unnecessary `LightEffect` tile buffer reallocation.

Flatland scenes now track the canvas aspect ratio automatically, removing the need for a hand-rolled resize bridge in React Three Fiber.
