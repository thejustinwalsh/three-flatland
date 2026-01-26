---
editUrl: false
next: false
prev: false
title: "brightness"
---

> **brightness**(`inputColor`, `amount`): [`TSLNode`](/api/type-aliases/tslnode/)

Defined in: [packages/core/src/nodes/color/brightness.ts:19](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/nodes/color/brightness.ts#L19)

Adjust brightness by adding a value to all color channels.

## Parameters

### inputColor

[`TSLNode`](/api/type-aliases/tslnode/)

The input color (vec4 with alpha)

### amount

[`FloatInput`](/api/type-aliases/floatinput/)

Brightness adjustment (-1 to 1, 0 = no change)

## Returns

[`TSLNode`](/api/type-aliases/tslnode/)

Color with adjusted brightness

## Examples

```ts
// Brighten by 20%
brightness(texture(tex, uv()), 0.2)
```

```ts
// Darken
brightness(texture(tex, uv()), -0.3)
```
