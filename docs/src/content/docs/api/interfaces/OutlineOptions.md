---
editUrl: false
next: false
prev: false
title: "OutlineOptions"
---

Defined in: [packages/core/src/nodes/sprite/outline.ts:5](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/nodes/sprite/outline.ts#L5)

## Properties

### color?

> `optional` **color**: [`Vec4Input`](/api/type-aliases/vec4input/)

Defined in: [packages/core/src/nodes/sprite/outline.ts:7](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/nodes/sprite/outline.ts#L7)

Outline color as [r, g, b, a] (0-1 range) or TSL node

***

### textureSize?

> `optional` **textureSize**: \[`number`, `number`\] \| [`TSLNode`](/api/type-aliases/tslnode/)

Defined in: [packages/core/src/nodes/sprite/outline.ts:11](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/nodes/sprite/outline.ts#L11)

Texture size for proper UV offset calculation as [width, height]

***

### thickness?

> `optional` **thickness**: [`FloatInput`](/api/type-aliases/floatinput/)

Defined in: [packages/core/src/nodes/sprite/outline.ts:9](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/nodes/sprite/outline.ts#L9)

Outline thickness in UV space (default: 0.01)
