---
editUrl: false
next: false
prev: false
title: "outline8"
---

> **outline8**(`inputColor`, `inputUV`, `tex`, `options`): [`TSLNode`](/api/type-aliases/tslnode/)

Defined in: [packages/core/src/nodes/sprite/outline.ts:89](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/nodes/sprite/outline.ts#L89)

Add an outline effect with 8-directional sampling for smoother edges.

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
