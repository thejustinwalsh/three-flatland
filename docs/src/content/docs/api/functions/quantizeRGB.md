---
editUrl: false
next: false
prev: false
title: "quantizeRGB"
---

> **quantizeRGB**(`inputColor`, `rLevels`, `gLevels`, `bLevels`): [`TSLNode`](/api/type-aliases/tslnode/)

Defined in: packages/core/src/nodes/retro/quantize.ts:53

Quantize color with different levels for each RGB channel.
Useful for specific retro palettes like 3-3-2 (8-bit color).

## Parameters

### inputColor

[`TSLNode`](/api/type-aliases/tslnode/)

The input color (vec4 with alpha)

### rLevels

[`FloatInput`](/api/type-aliases/floatinput/)

Number of levels for red channel

### gLevels

[`FloatInput`](/api/type-aliases/floatinput/)

Number of levels for green channel

### bLevels

[`FloatInput`](/api/type-aliases/floatinput/)

Number of levels for blue channel

## Returns

[`TSLNode`](/api/type-aliases/tslnode/)

Quantized color

## Examples

```ts
// 8-bit color (3-3-2 format: 8R, 8G, 4B)
quantizeRGB(color, 8, 8, 4)
```

```ts
// 16-bit high color (5-6-5 format)
quantizeRGB(color, 32, 64, 32)
```
