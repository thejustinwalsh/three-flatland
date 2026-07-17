---
"three-flatland": patch
---

> Branch: fix/flatland-react-aspect
> PR: https://github.com/thejustinwalsh/three-flatland/pull/181

### Fixes

- `Flatland` now derives the camera aspect ratio from the render surface (RenderTarget dimensions when rendering to texture, otherwise the renderer's size) instead of defaulting to `1` and requiring a manual `resize()` call that nothing in the library or its types ever prompted.
- Fixes distorted geometry for consumers who never called `resize()` — previously an 800-unit frustum on a 1280x720 canvas rendered ~1.78x too large.
- `aspect` is now a real accessor (was constructor-only), so it can be set from JSX under R3F's no-arg-construction + property-setting pattern.
- Calling `resize()` or setting `aspect` explicitly still switches to manual mode permanently, preserving existing caller behavior byte-for-byte.
- Zero/negative/NaN surface dimensions are now a no-op instead of latching a broken frustum, so a `0x0` first frame self-heals on the next render.
- Unchanged surface sizes short-circuit, avoiding unnecessary LightEffect tile buffer reallocation.

Verified in Chrome on WebGPU: React and three.js twins of `examples/uikit` now render pixel-identical geometry with no example-side changes.

Summary: fixes a long-standing camera aspect ratio bug in `Flatland` where R3F consumers (and any caller that never invoked `resize()`) rendered distorted scenes; aspect is now synced automatically from the render surface each frame.
