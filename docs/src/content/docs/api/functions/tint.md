---
editUrl: false
next: false
prev: false
title: "tint"
---

> **tint**(`inputColor`, `tintColor`, `strength`): [`TSLNode`](/api/type-aliases/tslnode/)

Defined in: [packages/core/src/nodes/color/tint.ts:20](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/nodes/color/tint.ts#L20)

Apply a color tint by multiplying with the input color.

## Parameters

### inputColor

[`TSLNode`](/api/type-aliases/tslnode/)

The input color (vec4 with alpha)

### tintColor

[`Vec3Input`](/api/type-aliases/vec3input/)

Tint color as [r, g, b] (0-1 range) or TSL node

### strength

[`FloatInput`](/api/type-aliases/floatinput/) = `1`

Tint strength (0 = no tint, 1 = full tint, default: 1)

## Returns

[`TSLNode`](/api/type-aliases/tslnode/)

Tinted color

## Examples

```ts
// Apply red tint
tint(texture(tex, uv()), [1, 0, 0])
```

```ts
// Partial tint with uniform
tint(texture(tex, uv()), tintColorUniform, 0.5)
```
