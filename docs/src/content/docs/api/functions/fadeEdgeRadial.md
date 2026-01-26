---
editUrl: false
next: false
prev: false
title: "fadeEdgeRadial"
---

> **fadeEdgeRadial**(`inputColor`, `inputUV`, `innerRadius`, `outerRadius`): [`TSLNode`](/api/type-aliases/tslnode/)

Defined in: [packages/core/src/nodes/alpha/fadeEdge.ts:56](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/nodes/alpha/fadeEdge.ts#L56)

Fade alpha in a circular pattern from center.

## Parameters

### inputColor

[`TSLNode`](/api/type-aliases/tslnode/)

The input color (vec4 with alpha)

### inputUV

[`TSLNode`](/api/type-aliases/tslnode/)

The UV coordinates

### innerRadius

[`FloatInput`](/api/type-aliases/floatinput/) = `0.3`

Radius where fade starts (0-1)

### outerRadius

[`FloatInput`](/api/type-aliases/floatinput/) = `0.5`

Radius where fully transparent (0-1)

## Returns

[`TSLNode`](/api/type-aliases/tslnode/)

Color with radial-faded alpha

## Example

```ts
// Circular fade from 0.3 to 0.5 radius
fadeEdgeRadial(texture(tex, uv()), uv(), 0.3, 0.5)
```
