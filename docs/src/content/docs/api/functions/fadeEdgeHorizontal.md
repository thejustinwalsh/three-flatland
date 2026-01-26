---
editUrl: false
next: false
prev: false
title: "fadeEdgeHorizontal"
---

> **fadeEdgeHorizontal**(`inputColor`, `inputUV`, `edgeWidth`): [`TSLNode`](/api/type-aliases/tslnode/)

Defined in: [packages/core/src/nodes/alpha/fadeEdge.ts:83](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/nodes/alpha/fadeEdge.ts#L83)

Fade alpha only on horizontal edges.

## Parameters

### inputColor

[`TSLNode`](/api/type-aliases/tslnode/)

The input color (vec4 with alpha)

### inputUV

[`TSLNode`](/api/type-aliases/tslnode/)

The UV coordinates

### edgeWidth

[`FloatInput`](/api/type-aliases/floatinput/) = `0.1`

Width of the fade region

## Returns

[`TSLNode`](/api/type-aliases/tslnode/)

Color with horizontally faded alpha
