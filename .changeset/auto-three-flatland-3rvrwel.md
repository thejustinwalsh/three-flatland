---
"three-flatland": patch
---

> Branch: fix/flatland-react-aspect
> PR: https://github.com/thejustinwalsh/three-flatland/pull/181

## Fixes

- Fix `Flatland` camera aspect defaulting to 1 and never updating unless `resize()` was called manually — no automatic hook existed in R3F for this, so scenes without a manual resize handler rendered stretched/scaled incorrectly.
- `render()` now auto-derives aspect each frame from the active render surface (RenderTarget dimensions when rendering to texture, otherwise the renderer's size), matching the same viewport source already used for `globals.viewportSize`. Unchanged sizes short-circuit to avoid unnecessary LightEffect tile buffer reallocation.
- Calling `resize()` or setting `aspect` explicitly still switches to manual mode permanently — existing callers are unaffected.
- Zero/negative/NaN dimensions are now a no-op instead of latching a broken frustum, so transient 0x0 sizes self-heal on the next valid frame.
- `aspect` is now a real property accessor (previously constructor-only), making it settable from JSX under R3F's no-arg-construction + property-setting pattern.

Summary: Flatland scenes now correctly track camera aspect from the render surface automatically, fixing distorted rendering in React/R3F consumers that had no manual resize wiring.
