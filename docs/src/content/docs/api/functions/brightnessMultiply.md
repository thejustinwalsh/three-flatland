---
editUrl: false
next: false
prev: false
title: "brightnessMultiply"
---

> **brightnessMultiply**(`inputColor`, `factor`): [`TSLNode`](/api/type-aliases/tslnode/)

Defined in: [packages/core/src/nodes/color/brightness.ts:39](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/nodes/color/brightness.ts#L39)

Adjust brightness multiplicatively (exposure-like).

## Parameters

### inputColor

[`TSLNode`](/api/type-aliases/tslnode/)

The input color (vec4 with alpha)

### factor

[`FloatInput`](/api/type-aliases/floatinput/)

Brightness factor (1 = no change, >1 = brighter, <1 = darker)

## Returns

[`TSLNode`](/api/type-aliases/tslnode/)

Color with adjusted brightness

## Example

```ts
// Double brightness
brightnessMultiply(texture(tex, uv()), 2)
```
