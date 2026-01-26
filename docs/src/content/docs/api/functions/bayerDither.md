---
editUrl: false
next: false
prev: false
title: "bayerDither"
---

> **bayerDither**(`inputColor`, `levels`, `scale`, `screenCoord?`): [`TSLNode`](/api/type-aliases/tslnode/)

Defined in: packages/core/src/nodes/retro/bayerDither.ts:295

Apply Bayer matrix ordered dithering (defaults to 4x4).
Alias for bayerDither4x4 as it's the most commonly used pattern.

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

## Examples

```ts
// Binary dithering (2-color)
bayerDither(texture(tex, uv()), 2, 1, screenUV.mul(resolution))
```

```ts
// 4-level dithering for retro look
bayerDither(color, 4)
```
