---
'three-flatland': minor
---

**BREAKING CHANGES**

- Batched sprites now inherit transforms and visibility from their authored ancestors. Remove compensating transforms and manual visibility mirrors that worked around the previous flattened behavior.
- `SpriteGroup` now extends `ClippingGroup` from `three/webgpu` instead of `Group`, enabling batch-root clipping but changing its base class for subclasses and type consumers.
- `Sprite2D.visible` is no longer mutated by loading or batching internals. It now always reports the locally authored `Object3D` value; content readiness and effective ancestor visibility are tracked separately.
- Render targets whose textures use `NoColorSpace` now default to `SRGBColorSpace`. Set `LinearSRGBColorSpace` explicitly before first GPU use for linear or HDR output.

SpriteGroup now preserves hierarchy ownership through reparenting, React Activity retention, picking, auto-batch adoption, cross-world transfers, texture/layer reassignment, and disposal. Add `clipRect` with local `[x, y, width, height]` coordinates for WebGPU batch clipping; nested rectangles compose, the exported `ClipRect` type is available for typed APIs, and CPU picking excludes clipped pixels.

Hierarchy-owned descendants remain under their authored parents. `add()` and `addSprites()` adopt direct sprites without duplicate enrollment, `remove()` and `removeSprites()` are no-ops for retained deep descendants just like `Object3D.remove()`, and `clear()` releases retained descendants as well as direct children. Render-target binding and renderer state are restored across both direct and post-processed rendering, including failure paths.
