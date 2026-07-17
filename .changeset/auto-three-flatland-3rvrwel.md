---
"three-flatland": patch
---

> Branch: fix/flatland-react-aspect
> PR: https://github.com/thejustinwalsh/three-flatland/pull/181

## Fixes

- `Flatland` now auto-derives the camera aspect ratio from the render surface (RenderTarget dimensions when rendering to texture, otherwise the renderer's size) instead of defaulting to `1` and requiring a manual `resize()` call. Fixes scenes rendering with a distorted/stretched frustum (e.g. `uikit` example) when no resize handler was wired up.
- Calling `resize()` or setting `aspect` explicitly still switches to manual mode, so existing callers are unaffected.
- Zero/negative/NaN surface dimensions are now a no-op — a `0x0` first frame self-heals on the next resize instead of permanently locking aspect to `1`.
- `aspect` is now a real accessor (was constructor-only), making it settable from JSX under R3F.

Fixes a silent-but-common footgun where R3F consumers of `<flatland>` had no way to signal viewport resizes, causing distorted rendering by default.
