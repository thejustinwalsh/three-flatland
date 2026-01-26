---
editUrl: false
next: false
prev: false
title: "bayerDither2x2"
---

> **bayerDither2x2**(`inputColor`, `levels`, `scale`, `screenCoord?`): [`TSLNode`](/api/type-aliases/tslnode/)

Defined in: packages/core/src/nodes/retro/bayerDither.ts:172

Apply 2x2 Bayer matrix ordered dithering.
Creates a coarse dither pattern - good for very low resolution retro effects.

## Parameters

### inputColor

[`TSLNode`](/api/type-aliases/tslnode/)

The input color (vec4 with alpha)

### levels

[`FloatInput`](/api/type-aliases/floatinput/) = `2`

Number of color levels per channel (default: 2 = binary)

### scale

[`FloatInput`](/api/type-aliases/floatinput/) = `1`

Scale of dither pattern (default: 1)

### screenCoord?

[`TSLNode`](/api/type-aliases/tslnode/)

Screen coordinates (use UV * textureSize for per-sprite)

## Returns

[`TSLNode`](/api/type-aliases/tslnode/)

Dithered color

## Example

```ts
// Binary dithering on sprite
bayerDither2x2(color, 2, 1, uv().mul(textureSize))
```
