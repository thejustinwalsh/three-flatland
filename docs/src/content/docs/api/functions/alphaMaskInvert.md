---
editUrl: false
next: false
prev: false
title: "alphaMaskInvert"
---

> **alphaMaskInvert**(`inputColor`, `maskTex`, `maskUV`, `strength`): [`TSLNode`](/api/type-aliases/tslnode/)

Defined in: [packages/core/src/nodes/alpha/alphaMask.ts:67](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/nodes/alpha/alphaMask.ts#L67)

Invert mask and apply to alpha (areas with high mask value become transparent).

## Parameters

### inputColor

[`TSLNode`](/api/type-aliases/tslnode/)

The input color (vec4 with alpha)

### maskTex

[`Texture`](https://github.com/mrdoob/three.js/blob/dev/src/textures/Texture.js)

Mask texture (uses red channel, inverted)

### maskUV

[`TSLNode`](/api/type-aliases/tslnode/)

UV coordinates for mask sampling

### strength

[`FloatInput`](/api/type-aliases/floatinput/) = `1`

Mask strength

## Returns

[`TSLNode`](/api/type-aliases/tslnode/)

Color with inverted mask applied to alpha
