---
editUrl: false
next: false
prev: false
title: "pixelateBySize"
---

> **pixelateBySize**(`inputUV`, `pixelSize`): [`TSLNode`](/api/type-aliases/tslnode/)

Defined in: [packages/core/src/nodes/sprite/pixelate.ts:47](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/nodes/sprite/pixelate.ts#L47)

Pixelate UV coordinates with a single pixel size value.

## Parameters

### inputUV

[`TSLNode`](/api/type-aliases/tslnode/)

The UV coordinates to transform

### pixelSize

[`FloatInput`](/api/type-aliases/floatinput/)

Size of pixels (higher = more pixelated)

## Returns

[`TSLNode`](/api/type-aliases/tslnode/)

Pixelated UV coordinates

## Example

```ts
// Pixelate with 8 pixel size
pixelateBySize(uv(), 8)
```
