---
editUrl: false
next: false
prev: false
title: "AnimationFrame"
---

Defined in: [packages/core/src/animation/types.ts:6](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/animation/types.ts#L6)

A single frame in an animation sequence.

## Properties

### data?

> `optional` **data**: `Record`\<`string`, `unknown`\>

Defined in: [packages/core/src/animation/types.ts:14](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/animation/types.ts#L14)

Custom data attached to this frame

***

### duration?

> `optional` **duration**: `number`

Defined in: [packages/core/src/animation/types.ts:10](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/animation/types.ts#L10)

Duration of this frame in milliseconds (overrides animation fps)

***

### event?

> `optional` **event**: `string`

Defined in: [packages/core/src/animation/types.ts:12](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/animation/types.ts#L12)

Event to fire when this frame is reached

***

### frame

> **frame**: [`SpriteFrame`](/api/interfaces/spriteframe/)

Defined in: [packages/core/src/animation/types.ts:8](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/animation/types.ts#L8)

Reference to the sprite frame
