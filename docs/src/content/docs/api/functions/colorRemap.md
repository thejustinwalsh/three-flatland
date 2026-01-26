---
editUrl: false
next: false
prev: false
title: "colorRemap"
---

> **colorRemap**(`inputColor`, `gradientTex`, `strength`): [`TSLNode`](/api/type-aliases/tslnode/)

Defined in: [packages/core/src/nodes/color/colorRemap.ts:27](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/nodes/color/colorRemap.ts#L27)

Remap colors using a gradient texture (LUT) based on luminance.
The gradient texture should be a horizontal strip where left = dark, right = bright.

## Parameters

### inputColor

[`TSLNode`](/api/type-aliases/tslnode/)

The input color (vec4 with alpha)

### gradientTex

[`Texture`](https://github.com/mrdoob/three.js/blob/dev/src/textures/Texture.js)

Horizontal gradient texture for color lookup

### strength

[`FloatInput`](/api/type-aliases/floatinput/) = `1`

Effect strength (0 = original, 1 = fully remapped)

## Returns

[`TSLNode`](/api/type-aliases/tslnode/)

Color remapped through gradient

## Examples

```ts
// Remap colors through a fire gradient
colorRemap(texture(tex, uv()), fireGradientTexture)
```

```ts
// Partial remap with uniform
colorRemap(texture(tex, uv()), gradientTex, strengthUniform)
```
