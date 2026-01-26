---
editUrl: false
next: false
prev: false
title: "quantize"
---

> **quantize**(`inputColor`, `levels`): [`TSLNode`](/api/type-aliases/tslnode/)

Defined in: packages/core/src/nodes/retro/quantize.ts:24

Quantize color to discrete levels per channel.
Creates a retro/pixel art look by reducing the number of possible colors.

## Parameters

### inputColor

[`TSLNode`](/api/type-aliases/tslnode/)

The input color (vec4 with alpha)

### levels

[`FloatInput`](/api/type-aliases/floatinput/)

Number of levels per channel (2-256)

## Returns

[`TSLNode`](/api/type-aliases/tslnode/)

Quantized color

## Examples

```ts
// 8 levels per channel (512 colors)
quantize(texture(tex, uv()), 8)
```

```ts
// Binary colors per channel (8 colors total)
quantize(color, 2)
```

```ts
// Using a uniform for dynamic control
quantize(color, levelsUniform)
```
