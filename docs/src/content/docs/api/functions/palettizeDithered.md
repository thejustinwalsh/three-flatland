---
editUrl: false
next: false
prev: false
title: "palettizeDithered"
---

> **palettizeDithered**(`inputColor`, `paletteTex`, `paletteSize`, `dither`, `screenCoord?`): [`TSLNode`](/api/type-aliases/tslnode/)

Defined in: packages/core/src/nodes/retro/palettize.ts:105

Map colors to palette with dithering for smoother transitions.
Uses Bayer matrix dithering to blend between palette colors.

## Parameters

### inputColor

[`TSLNode`](/api/type-aliases/tslnode/)

The input color (vec4 with alpha)

### paletteTex

[`Texture`](https://github.com/mrdoob/three.js/blob/dev/src/textures/Texture.js)

Palette texture (horizontal strip)

### paletteSize

[`FloatInput`](/api/type-aliases/floatinput/)

Number of colors in palette

### dither

[`FloatInput`](/api/type-aliases/floatinput/) = `0.5`

Dither strength between palette colors (0-1, default: 0.5)

### screenCoord?

[`TSLNode`](/api/type-aliases/tslnode/)

Screen coordinates for dithering pattern

## Returns

[`TSLNode`](/api/type-aliases/tslnode/)

Color snapped to palette with dithering

## Examples

```ts
// GameBoy 4-color palette with dithering
palettizeDithered(color, gbPalette, 4, 0.5, uv().mul(textureSize))
```

```ts
// C64 palette with strong dithering
palettizeDithered(color, c64Palette, 16, 0.8, screenCoord)
```
