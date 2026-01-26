---
editUrl: false
next: false
prev: false
title: "palettizeNearest"
---

> **palettizeNearest**(`inputColor`, `paletteTex`, `paletteSize`): [`TSLNode`](/api/type-aliases/tslnode/)

Defined in: packages/core/src/nodes/retro/palettize.ts:150

Find nearest color in palette by comparing RGB distance.
More accurate than luminance-based but more expensive.

## Parameters

### inputColor

[`TSLNode`](/api/type-aliases/tslnode/)

The input color (vec4 with alpha)

### paletteTex

[`Texture`](https://github.com/mrdoob/three.js/blob/dev/src/textures/Texture.js)

Palette texture (horizontal strip)

### paletteSize

`number`

Number of colors in palette (max 16)

## Returns

[`TSLNode`](/api/type-aliases/tslnode/)

Color snapped to nearest palette color

## Example

```ts
// Find nearest color in 8-color palette
palettizeNearest(color, palette8, 8)
```
