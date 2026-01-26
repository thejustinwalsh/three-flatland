---
editUrl: false
next: false
prev: false
title: "tintAdditive"
---

> **tintAdditive**(`inputColor`, `addColor`, `strength`): [`TSLNode`](/api/type-aliases/tslnode/)

Defined in: [packages/core/src/nodes/color/tint.ts:48](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/nodes/color/tint.ts#L48)

Apply an additive color tint (adds color rather than multiplying).
Useful for "flash" effects like damage feedback.

## Parameters

### inputColor

[`TSLNode`](/api/type-aliases/tslnode/)

The input color (vec4 with alpha)

### addColor

[`Vec3Input`](/api/type-aliases/vec3input/)

Color to add as [r, g, b] (0-1 range) or TSL node

### strength

[`FloatInput`](/api/type-aliases/floatinput/) = `1`

Effect strength (0 = no effect, 1 = full effect)

## Returns

[`TSLNode`](/api/type-aliases/tslnode/)

Color with additive tint

## Example

```ts
// Flash white on hit
tintAdditive(texture(tex, uv()), [1, 1, 1], hitFlashUniform)
```
