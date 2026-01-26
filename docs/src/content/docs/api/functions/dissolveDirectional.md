---
editUrl: false
next: false
prev: false
title: "dissolveDirectional"
---

> **dissolveDirectional**(`inputColor`, `inputUV`, `progress`, `noiseTex`, `direction`, `noiseStrength`): [`TSLNode`](/api/type-aliases/tslnode/)

Defined in: [packages/core/src/nodes/alpha/dissolve.ts:172](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/nodes/alpha/dissolve.ts#L172)

Directional dissolve (wipe effect with noise).
Combines a directional gradient with noise for a more organic wipe.

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

Noise texture

### direction

Wipe direction: 'left', 'right', 'up', 'down'

`"left"` | `"right"` | `"up"` | `"down"`

### noiseStrength

[`FloatInput`](/api/type-aliases/floatinput/) = `0.3`

How much noise affects the wipe (0-1)

## Returns

[`TSLNode`](/api/type-aliases/tslnode/)

Color with directional dissolve effect
