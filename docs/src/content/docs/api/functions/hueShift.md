---
editUrl: false
next: false
prev: false
title: "hueShift"
---

> **hueShift**(`inputColor`, `angle`): [`TSLNode`](/api/type-aliases/tslnode/)

Defined in: [packages/core/src/nodes/color/hueShift.ts:20](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/nodes/color/hueShift.ts#L20)

Shift the hue of a color using a rotation matrix in RGB space.
This is more efficient than RGB->HSV->RGB conversion.

## Parameters

### inputColor

[`TSLNode`](/api/type-aliases/tslnode/)

The input color (vec4 with alpha)

### angle

[`FloatInput`](/api/type-aliases/floatinput/)

Hue shift angle in radians (0 to 2*PI for full cycle)

## Returns

[`TSLNode`](/api/type-aliases/tslnode/)

Color with shifted hue

## Examples

```ts
// Shift hue by 90 degrees
hueShift(texture(tex, uv()), Math.PI / 2)
```

```ts
// Animate rainbow effect
hueShift(texture(tex, uv()), timeUniform)
```
