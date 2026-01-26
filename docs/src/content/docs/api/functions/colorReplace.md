---
editUrl: false
next: false
prev: false
title: "colorReplace"
---

> **colorReplace**(`inputColor`, `targetColor`, `replaceColor`, `tolerance`): [`TSLNode`](/api/type-aliases/tslnode/)

Defined in: packages/core/src/nodes/retro/colorReplace.ts:22

Replace a target color with a new color.
Uses smooth tolerance for anti-aliased sprites (smooth falloff at edges).

## Parameters

### inputColor

[`TSLNode`](/api/type-aliases/tslnode/)

The input color (vec4 with alpha)

### targetColor

[`Vec3Input`](/api/type-aliases/vec3input/)

Color to find and replace (RGB tuple or vec3 node)

### replaceColor

[`Vec3Input`](/api/type-aliases/vec3input/)

Color to replace with (RGB tuple or vec3 node)

### tolerance

[`FloatInput`](/api/type-aliases/floatinput/) = `0.1`

Match tolerance (default: 0.1)

## Returns

[`TSLNode`](/api/type-aliases/tslnode/)

Color with replacement applied

## Examples

```ts
// Swap red for blue
colorReplace(color, [1, 0, 0], [0, 0, 1], 0.1)
```

```ts
// Create team color variants with uniform
colorReplace(color, baseColor, teamColorUniform, 0.15)
```
