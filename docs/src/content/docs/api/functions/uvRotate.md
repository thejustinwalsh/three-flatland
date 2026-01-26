---
editUrl: false
next: false
prev: false
title: "uvRotate"
---

> **uvRotate**(`inputUV`, `angle`, `pivot`): [`TSLNode`](/api/type-aliases/tslnode/)

Defined in: [packages/core/src/nodes/sprite/uvRotate.ts:20](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/nodes/sprite/uvRotate.ts#L20)

Rotate UV coordinates around a pivot point.

## Parameters

### inputUV

[`TSLNode`](/api/type-aliases/tslnode/)

The UV coordinates to transform

### angle

[`FloatInput`](/api/type-aliases/floatinput/)

Rotation angle in radians (or TSL node)

### pivot

[`Vec2Input`](/api/type-aliases/vec2input/) = `...`

Pivot point for rotation (default: [0.5, 0.5] = center)

## Returns

[`TSLNode`](/api/type-aliases/tslnode/)

Rotated UV coordinates

## Examples

```ts
// Rotate UV by 45 degrees around center
uvRotate(uv(), Math.PI / 4)
```

```ts
// Animate rotation with uniform
uvRotate(uv(), angleUniform, [0.5, 0.5])
```
