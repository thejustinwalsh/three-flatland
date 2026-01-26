---
editUrl: false
next: false
prev: false
title: "bayerDither8x8"
---

> **bayerDither8x8**(`inputColor`, `levels`, `scale`, `screenCoord?`): [`TSLNode`](/api/type-aliases/tslnode/)

Defined in: packages/core/src/nodes/retro/bayerDither.ts:252

Apply 8x8 Bayer matrix ordered dithering.
Fine dither pattern - smoother gradients while maintaining retro feel.

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
// 8-level dithering for smoother retro effect
bayerDither8x8(color, 8, 1, uv().mul(textureSize))
```
