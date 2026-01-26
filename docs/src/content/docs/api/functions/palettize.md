---
editUrl: false
next: false
prev: false
title: "palettize"
---

> **palettize**(`inputColor`, `paletteTex`, `strength`): [`TSLNode`](/api/type-aliases/tslnode/)

Defined in: packages/core/src/nodes/retro/palettize.ts:30

Map colors to nearest match in a palette texture.
Palette should be a 1D horizontal texture (Nx1 pixels).

This function samples the palette by computing the luminance of the input color
and using it to index into the palette texture.

## Parameters

### inputColor

[`TSLNode`](/api/type-aliases/tslnode/)

The input color (vec4 with alpha)

### paletteTex

[`Texture`](https://github.com/mrdoob/three.js/blob/dev/src/textures/Texture.js)

Palette texture (horizontal strip)

### strength

[`FloatInput`](/api/type-aliases/floatinput/) = `1`

Effect strength (0 = original, 1 = fully palettized)

## Returns

[`TSLNode`](/api/type-aliases/tslnode/)

Color snapped to palette

## Examples

```ts
// Apply GameBoy palette
palettize(color, gbPaletteTexture)
```

```ts
// Partial palette effect
palettize(color, retroPalette, 0.5)
```
