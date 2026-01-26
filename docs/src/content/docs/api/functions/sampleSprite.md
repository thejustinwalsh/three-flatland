---
editUrl: false
next: false
prev: false
title: "sampleSprite"
---

> **sampleSprite**(`tex`, `frame`, `options`): [`TSLNode`](/api/type-aliases/tslnode/)

Defined in: [packages/core/src/nodes/sprite/sampleSprite.ts:32](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/nodes/sprite/sampleSprite.ts#L32)

Sample a sprite from a texture with frame-based UV mapping.
Works with both animated sprites (pass uniform) and static sprites (pass fixed frame).

## Parameters

### tex

[`Texture`](https://github.com/mrdoob/three.js/blob/dev/src/textures/Texture.js)

The sprite texture to sample

### frame

[`Vec4Input`](/api/type-aliases/vec4input/)

Frame bounds as [x, y, width, height] in UV space (0-1), or a vec4 uniform

### options

Optional settings

#### alphaTest?

[`FloatInput`](/api/type-aliases/floatinput/)

## Returns

[`TSLNode`](/api/type-aliases/tslnode/)

Sampled color (vec4)

## Examples

```ts
// Static sprite (full texture)
const color = sampleSprite(texture, [0, 0, 1, 1])
```

```ts
// Static sprite (specific frame)
const frame = spriteSheet.getFrame('idle_0')
const color = sampleSprite(texture, [frame.x, frame.y, frame.width, frame.height])
```

```ts
// Animated sprite (frame uniform updates each tick)
const frameUniform = uniform(new Vector4(0, 0, 0.125, 0.125))
const color = sampleSprite(texture, frameUniform)
```

```ts
// With alpha discard
const color = sampleSprite(texture, frame, { alphaTest: 0.01 })
```
