---
editUrl: false
next: false
prev: false
title: "spriteUV"
---

> **spriteUV**(`frame`): [`TSLNode`](/api/type-aliases/tslnode/)

Defined in: [packages/core/src/nodes/sprite/sampleSprite.ts:89](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/nodes/sprite/sampleSprite.ts#L89)

Get the UV coordinates for a sprite frame.
Useful when you need the UV separately (e.g., for outline effects that sample neighbors).

## Parameters

### frame

[`Vec4Input`](/api/type-aliases/vec4input/)

Frame bounds as [x, y, width, height] in UV space (0-1), or a vec4 uniform

## Returns

[`TSLNode`](/api/type-aliases/tslnode/)

Transformed UV coordinates for the frame

## Example

```ts
const frameUV = spriteUV(frameUniform)
const color = texture(tex, frameUV)
return outline8(color, frameUV, tex, { color: [0, 1, 0, 1] })
```
