---
editUrl: false
next: false
prev: false
title: "alphaMask"
---

> **alphaMask**(`inputColor`, `maskTex`, `maskUV`, `strength`): [`TSLNode`](/api/type-aliases/tslnode/)

Defined in: [packages/core/src/nodes/alpha/alphaMask.ts:23](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/nodes/alpha/alphaMask.ts#L23)

Multiply alpha by a mask texture's value.
The mask texture's red channel (or luminance) is used as the mask value.

## Parameters

### inputColor

[`TSLNode`](/api/type-aliases/tslnode/)

The input color (vec4 with alpha)

### maskTex

[`Texture`](https://github.com/mrdoob/three.js/blob/dev/src/textures/Texture.js)

Mask texture (uses red channel)

### maskUV

[`TSLNode`](/api/type-aliases/tslnode/)

UV coordinates for mask sampling

### strength

[`FloatInput`](/api/type-aliases/floatinput/) = `1`

Mask strength (0 = no mask, 1 = full mask)

## Returns

[`TSLNode`](/api/type-aliases/tslnode/)

Color with masked alpha

## Examples

```ts
// Apply mask texture
alphaMask(texture(tex, uv()), maskTexture, uv())
```

```ts
// Partial mask effect
alphaMask(texture(tex, uv()), maskTexture, uv(), 0.5)
```
