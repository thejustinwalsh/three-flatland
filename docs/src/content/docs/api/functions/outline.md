---
editUrl: false
next: false
prev: false
title: "outline"
---

> **outline**(`inputColor`, `inputUV`, `tex`, `options`): [`TSLNode`](/api/type-aliases/tslnode/)

Defined in: [packages/core/src/nodes/sprite/outline.ts:36](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/nodes/sprite/outline.ts#L36)

Add an outline effect by sampling neighboring pixels.
Detects edges based on alpha differences and draws outline around opaque areas.

## Parameters

### inputColor

[`TSLNode`](/api/type-aliases/tslnode/)

The input color (typically texture sample result)

### inputUV

[`TSLNode`](/api/type-aliases/tslnode/)

The UV coordinates

### tex

[`Texture`](https://github.com/mrdoob/three.js/blob/dev/src/textures/Texture.js)

The texture to sample for neighbor detection

### options

[`OutlineOptions`](/api/interfaces/outlineoptions/) = `{}`

Outline configuration

## Returns

[`TSLNode`](/api/type-aliases/tslnode/)

Color with outline applied

## Examples

```ts
// Basic white outline
outline(texture(tex, uv()), uv(), tex, { color: [1, 1, 1, 1] })
```

```ts
// Glowing outline with custom thickness
outline(texture(tex, uv()), uv(), tex, {
  color: [0, 1, 0, 1],
  thickness: 0.02,
  textureSize: [64, 64]
})
```
