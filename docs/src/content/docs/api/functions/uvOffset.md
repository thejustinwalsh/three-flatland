---
editUrl: false
next: false
prev: false
title: "uvOffset"
---

> **uvOffset**(`inputUV`, `offset`): [`TSLNode`](/api/type-aliases/tslnode/)

Defined in: [packages/core/src/nodes/sprite/uvOffset.ts:19](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/nodes/sprite/uvOffset.ts#L19)

Offset UV coordinates by a given amount.

## Parameters

### inputUV

[`TSLNode`](/api/type-aliases/tslnode/)

The UV coordinates to transform

### offset

[`Vec2Input`](/api/type-aliases/vec2input/)

Offset amount as [x, y] or TSL node

## Returns

[`TSLNode`](/api/type-aliases/tslnode/)

Offset UV coordinates

## Examples

```ts
// Offset UV by 0.1 in both directions
uvOffset(uv(), [0.1, 0.1])
```

```ts
// Animate UV offset with uniform
uvOffset(uv(), offsetUniform)
```
