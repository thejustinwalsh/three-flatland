---
editUrl: false
next: false
prev: false
title: "contrast"
---

> **contrast**(`inputColor`, `amount`, `midpoint`): [`TSLNode`](/api/type-aliases/tslnode/)

Defined in: [packages/core/src/nodes/color/contrast.ts:20](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/nodes/color/contrast.ts#L20)

Adjust contrast by scaling color values around a midpoint.

## Parameters

### inputColor

[`TSLNode`](/api/type-aliases/tslnode/)

The input color (vec4 with alpha)

### amount

[`FloatInput`](/api/type-aliases/floatinput/)

Contrast factor (1 = no change, >1 = more contrast, <1 = less contrast)

### midpoint

[`FloatInput`](/api/type-aliases/floatinput/) = `0.5`

Center point for scaling (default: 0.5)

## Returns

[`TSLNode`](/api/type-aliases/tslnode/)

Color with adjusted contrast

## Examples

```ts
// Increase contrast
contrast(texture(tex, uv()), 1.5)
```

```ts
// Decrease contrast (flatten)
contrast(texture(tex, uv()), 0.5)
```
