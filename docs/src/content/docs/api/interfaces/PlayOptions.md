---
editUrl: false
next: false
prev: false
title: "PlayOptions"
---

Defined in: [packages/core/src/animation/types.ts:38](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/animation/types.ts#L38)

Options for playing an animation.

## Properties

### loop?

> `optional` **loop**: `boolean`

Defined in: [packages/core/src/animation/types.ts:42](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/animation/types.ts#L42)

Override loop setting

***

### onComplete()?

> `optional` **onComplete**: () => `void`

Defined in: [packages/core/src/animation/types.ts:46](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/animation/types.ts#L46)

Callback when animation completes (non-looping)

#### Returns

`void`

***

### onEvent()?

> `optional` **onEvent**: (`event`, `frameIndex`) => `void`

Defined in: [packages/core/src/animation/types.ts:52](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/animation/types.ts#L52)

Callback on frame event

#### Parameters

##### event

`string`

##### frameIndex

`number`

#### Returns

`void`

***

### onFrame()?

> `optional` **onFrame**: (`frameIndex`, `frame`) => `void`

Defined in: [packages/core/src/animation/types.ts:50](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/animation/types.ts#L50)

Callback on frame change

#### Parameters

##### frameIndex

`number`

##### frame

[`AnimationFrame`](/api/interfaces/animationframe/)

#### Returns

`void`

***

### onLoop()?

> `optional` **onLoop**: (`loopCount`) => `void`

Defined in: [packages/core/src/animation/types.ts:48](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/animation/types.ts#L48)

Callback on each loop

#### Parameters

##### loopCount

`number`

#### Returns

`void`

***

### speed?

> `optional` **speed**: `number`

Defined in: [packages/core/src/animation/types.ts:44](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/animation/types.ts#L44)

Override speed multiplier

***

### startFrame?

> `optional` **startFrame**: `number`

Defined in: [packages/core/src/animation/types.ts:40](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/animation/types.ts#L40)

Start from a specific frame
