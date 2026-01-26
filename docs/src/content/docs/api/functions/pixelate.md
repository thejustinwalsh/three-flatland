---
editUrl: false
next: false
prev: false
title: "pixelate"
---

> **pixelate**(`inputUV`, `resolution`, `pivot`): [`TSLNode`](/api/type-aliases/tslnode/)

Defined in: [packages/core/src/nodes/sprite/pixelate.ts:24](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/nodes/sprite/pixelate.ts#L24)

Pixelate UV coordinates by snapping to a pixel grid.

## Parameters

### inputUV

[`TSLNode`](/api/type-aliases/tslnode/)

The UV coordinates to transform

### resolution

[`Vec2Input`](/api/type-aliases/vec2input/)

Pixel grid resolution as [width, height] or TSL node

### pivot

[`Vec2Input`](/api/type-aliases/vec2input/) = `...`

Center point for pixelation (default: [0.5, 0.5] = center)

## Returns

[`TSLNode`](/api/type-aliases/tslnode/)

Pixelated UV coordinates (snapped to grid centers)

## Examples

```ts
// Pixelate to 16x16 grid (centered)
pixelate(uv(), [16, 16])
```

```ts
// Animate pixelation with uniform (stays centered)
pixelate(uv(), resolutionUniform)
```

```ts
// Pixelate from top-left corner
pixelate(uv(), [16, 16], [0, 1])
```
