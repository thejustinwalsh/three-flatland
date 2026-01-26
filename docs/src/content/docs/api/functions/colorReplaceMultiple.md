---
editUrl: false
next: false
prev: false
title: "colorReplaceMultiple"
---

> **colorReplaceMultiple**(`inputColor`, `sourceColors`, `targetColors`, `tolerance`): [`TSLNode`](/api/type-aliases/tslnode/)

Defined in: packages/core/src/nodes/retro/colorReplace.ts:109

Replace multiple colors at once (palette swap).
Each source color maps to a corresponding target color.

## Parameters

### inputColor

[`TSLNode`](/api/type-aliases/tslnode/)

The input color (vec4 with alpha)

### sourceColors

\[`number`, `number`, `number`\][]

Array of colors to find (RGB tuples)

### targetColors

\[`number`, `number`, `number`\][]

Array of colors to replace with (RGB tuples)

### tolerance

[`FloatInput`](/api/type-aliases/floatinput/) = `0.1`

Match tolerance (default: 0.1)

## Returns

[`TSLNode`](/api/type-aliases/tslnode/)

Color with all replacements applied

## Example

```ts
// Swap entire character palette
colorReplaceMultiple(
  color,
  [[1, 0, 0], [0, 1, 0], [0, 0, 1]],  // Source: red, green, blue
  [[1, 0.5, 0], [0, 0.5, 0], [0.5, 0, 1]],  // Target: orange, dark green, purple
  0.15
)
```
