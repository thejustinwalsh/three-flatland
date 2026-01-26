---
editUrl: false
next: false
prev: false
title: "alphaMaskValue"
---

> **alphaMaskValue**(`inputColor`, `mask`): [`TSLNode`](/api/type-aliases/tslnode/)

Defined in: [packages/core/src/nodes/alpha/alphaMask.ts:52](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/nodes/alpha/alphaMask.ts#L52)

Multiply alpha by a mask value (single float instead of texture).

## Parameters

### inputColor

[`TSLNode`](/api/type-aliases/tslnode/)

The input color (vec4 with alpha)

### mask

[`FloatInput`](/api/type-aliases/floatinput/)

Mask value (0-1)

## Returns

[`TSLNode`](/api/type-aliases/tslnode/)

Color with masked alpha

## Example

```ts
// Fade sprite by 50%
alphaMaskValue(texture(tex, uv()), 0.5)
```
