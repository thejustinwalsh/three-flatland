---
editUrl: false
next: false
prev: false
title: "posterize"
---

> **posterize**(`inputColor`, `bands`): [`TSLNode`](/api/type-aliases/tslnode/)

Defined in: packages/core/src/nodes/retro/posterize.ts:24

Posterize color to create flat, comic-book style bands.
This is semantically equivalent to quantize but with artist-friendly naming.

## Parameters

### inputColor

[`TSLNode`](/api/type-aliases/tslnode/)

The input color (vec4 with alpha)

### bands

[`FloatInput`](/api/type-aliases/floatinput/)

Number of color bands (2-16 typical)

## Returns

[`TSLNode`](/api/type-aliases/tslnode/)

Posterized color

## Examples

```ts
// Create comic-book style with 4 bands
posterize(texture(tex, uv()), 4)
```

```ts
// Subtle posterization with 8 bands
posterize(color, 8)
```

```ts
// Dynamic posterization with uniform
posterize(color, bandsUniform)
```
