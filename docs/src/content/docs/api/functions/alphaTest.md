---
editUrl: false
next: false
prev: false
title: "alphaTest"
---

> **alphaTest**(`inputColor`, `threshold`): [`TSLNode`](/api/type-aliases/tslnode/)

Defined in: [packages/core/src/nodes/alpha/alphaTest.ts:20](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/nodes/alpha/alphaTest.ts#L20)

Discard pixels with alpha below a threshold.
Useful for hard-edged transparency (pixel art, text).

## Parameters

### inputColor

[`TSLNode`](/api/type-aliases/tslnode/)

The input color (vec4 with alpha)

### threshold

[`FloatInput`](/api/type-aliases/floatinput/)

Alpha threshold (pixels below this are discarded)

## Returns

[`TSLNode`](/api/type-aliases/tslnode/)

Color unchanged, or discarded if below threshold

## Examples

```ts
// Discard nearly transparent pixels
alphaTest(texture(tex, uv()), 0.5)
```

```ts
// Animated alpha cutoff
alphaTest(texture(tex, uv()), thresholdUniform)
```
