---
editUrl: false
next: false
prev: false
title: "grayscale"
---

> **grayscale**(`inputColor`): [`TSLNode`](/api/type-aliases/tslnode/)

Defined in: [packages/core/src/nodes/color/saturate.ts:48](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/nodes/color/saturate.ts#L48)

Convert color to grayscale using luminance weights.
Shorthand for saturate(color, 0).

## Parameters

### inputColor

[`TSLNode`](/api/type-aliases/tslnode/)

The input color (vec4 with alpha)

## Returns

[`TSLNode`](/api/type-aliases/tslnode/)

Grayscale color

## Example

```ts
grayscale(texture(tex, uv()))
```
