---
editUrl: false
next: false
prev: false
title: "dissolve"
---

> **dissolve**(`inputColor`, `inputUV`, `options`): [`TSLNode`](/api/type-aliases/tslnode/)

Defined in: [packages/core/src/nodes/alpha/dissolve.ts:43](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/nodes/alpha/dissolve.ts#L43)

Dissolve effect using a noise texture.
Creates a burning/disintegration effect with a glowing edge.

## Parameters

### inputColor

[`TSLNode`](/api/type-aliases/tslnode/)

The input color (vec4 with alpha)

### inputUV

[`TSLNode`](/api/type-aliases/tslnode/)

The UV coordinates

### options

[`DissolveOptions`](/api/interfaces/dissolveoptions/)

Dissolve configuration

## Returns

[`TSLNode`](/api/type-aliases/tslnode/)

Color with dissolve effect applied

## Examples

```ts
// Basic dissolve
dissolve(texture(tex, uv()), uv(), {
  progress: 0.5,
  noiseTex: noiseTexture,
})
```

```ts
// Dissolve with custom edge color
dissolve(texture(tex, uv()), uv(), {
  progress: dissolveUniform,
  noiseTex: noiseTexture,
  edgeColor: [0, 1, 0.5],
  edgeWidth: 0.15,
})
```
