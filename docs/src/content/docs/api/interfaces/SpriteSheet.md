---
editUrl: false
next: false
prev: false
title: "SpriteSheet"
---

Defined in: [packages/core/src/sprites/types.ts:63](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/sprites/types.ts#L63)

Spritesheet data structure.

## Properties

### frames

> **frames**: `Map`\<`string`, [`SpriteFrame`](/api/interfaces/spriteframe/)\>

Defined in: [packages/core/src/sprites/types.ts:67](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/sprites/types.ts#L67)

Map of frame name to frame data

***

### height

> **height**: `number`

Defined in: [packages/core/src/sprites/types.ts:71](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/sprites/types.ts#L71)

Atlas height in pixels

***

### texture

> **texture**: [`Texture`](https://github.com/mrdoob/three.js/blob/dev/src/textures/Texture.js)

Defined in: [packages/core/src/sprites/types.ts:65](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/sprites/types.ts#L65)

The texture atlas

***

### width

> **width**: `number`

Defined in: [packages/core/src/sprites/types.ts:69](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/sprites/types.ts#L69)

Atlas width in pixels

## Methods

### getFrame()

> **getFrame**(`name`): [`SpriteFrame`](/api/interfaces/spriteframe/)

Defined in: [packages/core/src/sprites/types.ts:73](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/sprites/types.ts#L73)

Get a frame by name

#### Parameters

##### name

`string`

#### Returns

[`SpriteFrame`](/api/interfaces/spriteframe/)

***

### getFrameNames()

> **getFrameNames**(): `string`[]

Defined in: [packages/core/src/sprites/types.ts:75](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/sprites/types.ts#L75)

Get all frame names

#### Returns

`string`[]
