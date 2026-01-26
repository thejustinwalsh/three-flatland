---
editUrl: false
next: false
prev: false
title: "dissolvePixelated"
---

> **dissolvePixelated**(`inputColor`, `inputUV`, `progress`, `noiseTex`, `pixelCount`): [`TSLNode`](/api/type-aliases/tslnode/)

Defined in: [packages/core/src/nodes/alpha/dissolve.ts:135](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/nodes/alpha/dissolve.ts#L135)

Pixelated dissolve effect - blocks disappear together in a pixel grid.
Creates a retro/8-bit style dissolve effect perfect for pixel art.

## Parameters

### inputColor

[`TSLNode`](/api/type-aliases/tslnode/)

The input color (vec4 with alpha)

### inputUV

[`TSLNode`](/api/type-aliases/tslnode/)

The UV coordinates (raw, not frame-mapped)

### progress

[`FloatInput`](/api/type-aliases/floatinput/)

Dissolve progress (0-1)

### noiseTex

[`Texture`](https://github.com/mrdoob/three.js/blob/dev/src/textures/Texture.js)

Noise texture for dissolve pattern

### pixelCount

[`FloatInput`](/api/type-aliases/floatinput/) = `16`

Number of pixels in the grid (default: 16)

## Returns

[`TSLNode`](/api/type-aliases/tslnode/)

Color with pixelated dissolve effect

## Examples

```ts
// Basic pixelated dissolve
dissolvePixelated(color, uv(), dissolveProgress, noiseTexture)
```

```ts
// Coarser 8x8 pixel grid
dissolvePixelated(color, uv(), dissolveProgress, noiseTexture, 8)
```
