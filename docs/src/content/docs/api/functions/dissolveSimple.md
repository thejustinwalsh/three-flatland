---
editUrl: false
next: false
prev: false
title: "dissolveSimple"
---

> **dissolveSimple**(`inputColor`, `inputUV`, `progress`, `noiseTex`): [`TSLNode`](/api/type-aliases/tslnode/)

Defined in: [packages/core/src/nodes/alpha/dissolve.ts:97](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/nodes/alpha/dissolve.ts#L97)

Simple dissolve without edge glow.
More performant when edge effect isn't needed.

## Parameters

### inputColor

[`TSLNode`](/api/type-aliases/tslnode/)

The input color (vec4 with alpha)

### inputUV

[`TSLNode`](/api/type-aliases/tslnode/)

The UV coordinates

### progress

[`FloatInput`](/api/type-aliases/floatinput/)

Dissolve progress (0-1)

### noiseTex

[`Texture`](https://github.com/mrdoob/three.js/blob/dev/src/textures/Texture.js)

Noise texture for dissolve pattern

## Returns

[`TSLNode`](/api/type-aliases/tslnode/)

Color with simple dissolve effect
