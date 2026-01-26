---
editUrl: false
next: false
prev: false
title: "uvScale"
---

> **uvScale**(`inputUV`, `scale`, `pivot`): [`TSLNode`](/api/type-aliases/tslnode/)

Defined in: [packages/core/src/nodes/sprite/uvScale.ts:20](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/nodes/sprite/uvScale.ts#L20)

Scale UV coordinates around a pivot point.

## Parameters

### inputUV

[`TSLNode`](/api/type-aliases/tslnode/)

The UV coordinates to transform

### scale

[`Vec2Input`](/api/type-aliases/vec2input/)

Scale factor as [x, y] or TSL node

### pivot

[`Vec2Input`](/api/type-aliases/vec2input/) = `...`

Pivot point for scaling (default: [0.5, 0.5] = center)

## Returns

[`TSLNode`](/api/type-aliases/tslnode/)

Scaled UV coordinates

## Examples

```ts
// Scale UV by 2x around center
uvScale(uv(), [2, 2])
```

```ts
// Scale with uniform for animation
uvScale(uv(), scaleUniform, [0.5, 0.5])
```
