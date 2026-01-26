---
editUrl: false
next: false
prev: false
title: "hueShiftNormalized"
---

> **hueShiftNormalized**(`inputColor`, `amount`): [`TSLNode`](/api/type-aliases/tslnode/)

Defined in: [packages/core/src/nodes/color/hueShift.ts:62](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/nodes/color/hueShift.ts#L62)

Shift hue by a normalized amount (0-1 maps to 0-360 degrees).

## Parameters

### inputColor

[`TSLNode`](/api/type-aliases/tslnode/)

The input color (vec4 with alpha)

### amount

[`FloatInput`](/api/type-aliases/floatinput/)

Hue shift amount (0-1, wraps around)

## Returns

[`TSLNode`](/api/type-aliases/tslnode/)

Color with shifted hue

## Example

```ts
// Shift hue by 25%
hueShiftNormalized(texture(tex, uv()), 0.25)
```
