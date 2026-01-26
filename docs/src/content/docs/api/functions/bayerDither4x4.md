---
editUrl: false
next: false
prev: false
title: "bayerDither4x4"
---

> **bayerDither4x4**(`inputColor`, `levels`, `scale`, `screenCoord?`): [`TSLNode`](/api/type-aliases/tslnode/)

Defined in: packages/core/src/nodes/retro/bayerDither.ts:213

Apply 4x4 Bayer matrix ordered dithering.
Standard dither pattern - good balance of quality and retro aesthetic.

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
// 4-level dithering for retro look
bayerDither4x4(color, 4, 1, uv().mul(textureSize))
```
