---
editUrl: false
next: false
prev: false
title: "fadeEdge"
---

> **fadeEdge**(`inputColor`, `inputUV`, `edgeWidth`): [`TSLNode`](/api/type-aliases/tslnode/)

Defined in: [packages/core/src/nodes/alpha/fadeEdge.ts:20](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/nodes/alpha/fadeEdge.ts#L20)

Fade alpha towards the edges of UV space using smoothstep.

## Parameters

### inputColor

[`TSLNode`](/api/type-aliases/tslnode/)

The input color (vec4 with alpha)

### inputUV

[`TSLNode`](/api/type-aliases/tslnode/)

The UV coordinates

### edgeWidth

[`FloatInput`](/api/type-aliases/floatinput/) = `0.1`

Width of the fade region (0-0.5, default: 0.1)

## Returns

[`TSLNode`](/api/type-aliases/tslnode/)

Color with edge-faded alpha

## Examples

```ts
// Fade edges with default width
fadeEdge(texture(tex, uv()), uv())
```

```ts
// Wide fade edge
fadeEdge(texture(tex, uv()), uv(), 0.3)
```
