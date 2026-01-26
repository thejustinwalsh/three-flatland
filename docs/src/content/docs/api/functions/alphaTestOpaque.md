---
editUrl: false
next: false
prev: false
title: "alphaTestOpaque"
---

> **alphaTestOpaque**(`inputColor`, `threshold`): [`TSLNode`](/api/type-aliases/tslnode/)

Defined in: [packages/core/src/nodes/alpha/alphaTest.ts:38](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/nodes/alpha/alphaTest.ts#L38)

Discard pixels with alpha below threshold and set remaining alpha to 1.
Creates a hard mask effect.

## Parameters

### inputColor

[`TSLNode`](/api/type-aliases/tslnode/)

The input color (vec4 with alpha)

### threshold

[`FloatInput`](/api/type-aliases/floatinput/)

Alpha threshold

## Returns

[`TSLNode`](/api/type-aliases/tslnode/)

Opaque color if above threshold, discarded otherwise
