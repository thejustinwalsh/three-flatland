---
editUrl: false
next: false
prev: false
title: "colorReplaceHard"
---

> **colorReplaceHard**(`inputColor`, `targetColor`, `replaceColor`, `tolerance`): [`TSLNode`](/api/type-aliases/tslnode/)

Defined in: packages/core/src/nodes/retro/colorReplace.ts:63

Replace a target color with a new color using hard cutoff (no blending).
Good for pixel art with exact color matching.

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

[`FloatInput`](/api/type-aliases/floatinput/) = `0.01`

Match tolerance (default: 0.01)

## Returns

[`TSLNode`](/api/type-aliases/tslnode/)

Color with replacement applied

## Example

```ts
// Exact color swap for pixel art
colorReplaceHard(color, [1, 0, 0], [0, 0, 1], 0.01)
```
