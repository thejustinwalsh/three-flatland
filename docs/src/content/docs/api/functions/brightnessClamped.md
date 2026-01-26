---
editUrl: false
next: false
prev: false
title: "brightnessClamped"
---

> **brightnessClamped**(`inputColor`, `amount`): [`TSLNode`](/api/type-aliases/tslnode/)

Defined in: [packages/core/src/nodes/color/brightness.ts:52](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/nodes/color/brightness.ts#L52)

Adjust brightness with clamping to prevent overflow.

## Parameters

### inputColor

[`TSLNode`](/api/type-aliases/tslnode/)

The input color (vec4 with alpha)

### amount

[`FloatInput`](/api/type-aliases/floatinput/)

Brightness adjustment (-1 to 1)

## Returns

[`TSLNode`](/api/type-aliases/tslnode/)

Color with adjusted brightness, clamped to 0-1
