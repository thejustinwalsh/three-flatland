---
editUrl: false
next: false
prev: false
title: "colorRemapCustom"
---

> **colorRemapCustom**(`inputColor`, `gradientTex`, `lookupValue`, `strength`): [`TSLNode`](/api/type-aliases/tslnode/)

Defined in: [packages/core/src/nodes/color/colorRemap.ts:61](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/nodes/color/colorRemap.ts#L61)

Remap colors using a custom channel for lookup instead of luminance.

## Parameters

### inputColor

[`TSLNode`](/api/type-aliases/tslnode/)

The input color (vec4 with alpha)

### gradientTex

[`Texture`](https://github.com/mrdoob/three.js/blob/dev/src/textures/Texture.js)

Horizontal gradient texture for color lookup

### lookupValue

[`FloatInput`](/api/type-aliases/floatinput/)

Custom value for gradient lookup (0-1)

### strength

[`FloatInput`](/api/type-aliases/floatinput/) = `1`

Effect strength (0 = original, 1 = fully remapped)

## Returns

[`TSLNode`](/api/type-aliases/tslnode/)

Color remapped through gradient

## Example

```ts
// Remap based on red channel
colorRemapCustom(texture(tex, uv()), gradientTex, inputColor.r)
```
