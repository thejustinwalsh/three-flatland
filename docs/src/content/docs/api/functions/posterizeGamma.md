---
editUrl: false
next: false
prev: false
title: "posterizeGamma"
---

> **posterizeGamma**(`inputColor`, `bands`, `gamma`): [`TSLNode`](/api/type-aliases/tslnode/)

Defined in: packages/core/src/nodes/retro/posterize.ts:51

Posterize with gamma correction for more perceptually uniform bands.
Applies gamma before quantization and inverse gamma after.

## Parameters

### inputColor

[`TSLNode`](/api/type-aliases/tslnode/)

The input color (vec4 with alpha)

### bands

[`FloatInput`](/api/type-aliases/floatinput/)

Number of color bands (2-16 typical)

### gamma

[`FloatInput`](/api/type-aliases/floatinput/) = `2.2`

Gamma value (default: 2.2 for sRGB)

## Returns

[`TSLNode`](/api/type-aliases/tslnode/)

Posterized color with gamma correction

## Examples

```ts
// Gamma-corrected posterization
posterizeGamma(color, 4)
```

```ts
// Custom gamma
posterizeGamma(color, 4, 1.8)
```
