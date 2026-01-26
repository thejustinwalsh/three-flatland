---
editUrl: false
next: false
prev: false
title: "Animation"
---

Defined in: [packages/core/src/animation/types.ts:20](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/animation/types.ts#L20)

Animation definition.

## Properties

### fps?

> `optional` **fps**: `number`

Defined in: [packages/core/src/animation/types.ts:26](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/animation/types.ts#L26)

Frames per second (default: 12)

***

### frames

> **frames**: [`AnimationFrame`](/api/interfaces/animationframe/)[]

Defined in: [packages/core/src/animation/types.ts:24](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/animation/types.ts#L24)

Sequence of frames

***

### loop?

> `optional` **loop**: `boolean`

Defined in: [packages/core/src/animation/types.ts:28](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/animation/types.ts#L28)

Whether to loop (default: true)

***

### loopCount?

> `optional` **loopCount**: `number`

Defined in: [packages/core/src/animation/types.ts:32](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/animation/types.ts#L32)

Number of times to loop (-1 for infinite, default)

***

### name

> **name**: `string`

Defined in: [packages/core/src/animation/types.ts:22](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/animation/types.ts#L22)

Animation name

***

### pingPong?

> `optional` **pingPong**: `boolean`

Defined in: [packages/core/src/animation/types.ts:30](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/animation/types.ts#L30)

Ping-pong animation (play forward then backward)
