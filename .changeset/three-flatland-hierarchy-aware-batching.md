---
'three-flatland': minor
---

**BREAKING CHANGES**

- Batched sprites now inherit transforms and visibility from their authored ancestors. Remove compensating transforms and manual visibility mirrors that worked around the previous flattened behavior.
- Render targets whose textures use `NoColorSpace` now default to `SRGBColorSpace`. Set `LinearSRGBColorSpace` explicitly before first GPU use for linear or HDR output.

SpriteGroup now preserves hierarchy ownership through reparenting, React Activity retention, clipping, picking, auto-batch adoption, and cross-world transfers. `Sprite2D.visible` continues to report its locally authored value while batch slots follow effective hierarchy visibility. Render-target binding and renderer state are restored across both direct and post-processed rendering, including failure paths.
