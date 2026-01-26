---
editUrl: false
next: false
prev: false
title: "SpriteEntry"
---

Defined in: [packages/core/src/pipeline/types.ts:91](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/pipeline/types.ts#L91)

Internal sprite entry for batch management.

## Properties

### dirty

> **dirty**: `boolean`

Defined in: [packages/core/src/pipeline/types.ts:97](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/pipeline/types.ts#L97)

Whether the sprite needs re-upload

***

### sortKey

> **sortKey**: `number`

Defined in: [packages/core/src/pipeline/types.ts:95](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/pipeline/types.ts#L95)

Computed sort key: (layer << 24) | (batchId << 12) | zIndex

***

### sprite

> **sprite**: [`Sprite2D`](/api/classes/sprite2d/)

Defined in: [packages/core/src/pipeline/types.ts:93](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/pipeline/types.ts#L93)

The sprite instance
