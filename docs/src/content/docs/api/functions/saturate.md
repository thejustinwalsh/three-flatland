---
editUrl: false
next: false
prev: false
title: "saturate"
---

> **saturate**(`inputColor`, `amount`): [`TSLNode`](/api/type-aliases/tslnode/)

Defined in: [packages/core/src/nodes/color/saturate.ts:24](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/nodes/color/saturate.ts#L24)

Adjust saturation by mixing with grayscale (luminance).

## Parameters

### inputColor

[`TSLNode`](/api/type-aliases/tslnode/)

The input color (vec4 with alpha)

### amount

[`FloatInput`](/api/type-aliases/floatinput/)

Saturation amount (0 = grayscale, 1 = original, >1 = oversaturated)

## Returns

[`TSLNode`](/api/type-aliases/tslnode/)

Color with adjusted saturation

## Examples

```ts
// Desaturate to grayscale (petrified effect)
saturate(texture(tex, uv()), 0)
```

```ts
// Boost saturation
saturate(texture(tex, uv()), 1.5)
```
