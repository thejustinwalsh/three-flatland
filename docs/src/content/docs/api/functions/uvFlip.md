---
editUrl: false
next: false
prev: false
title: "uvFlip"
---

> **uvFlip**(`inputUV`, `flipX`, `flipY`): [`TSLNode`](/api/type-aliases/tslnode/)

Defined in: [packages/core/src/nodes/sprite/uvFlip.ts:20](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/nodes/sprite/uvFlip.ts#L20)

Flip UV coordinates horizontally and/or vertically.

## Parameters

### inputUV

[`TSLNode`](/api/type-aliases/tslnode/)

The UV coordinates to transform

### flipX

Whether to flip horizontally (true/1 = flip, false/0 = normal)

`boolean` | [`FloatInput`](/api/type-aliases/floatinput/)

### flipY

Whether to flip vertically (true/1 = flip, false/0 = normal)

`boolean` | [`FloatInput`](/api/type-aliases/floatinput/)

## Returns

[`TSLNode`](/api/type-aliases/tslnode/)

Flipped UV coordinates

## Examples

```ts
// Flip horizontally
uvFlip(uv(), true, false)
```

```ts
// Flip based on uniform
uvFlip(uv(), flipXUniform, flipYUniform)
```
