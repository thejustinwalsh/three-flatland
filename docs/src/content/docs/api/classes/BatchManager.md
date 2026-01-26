---
editUrl: false
next: false
prev: false
title: "BatchManager"
---

Defined in: [packages/core/src/pipeline/BatchManager.ts:13](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/pipeline/BatchManager.ts#L13)

Manages sprite batching and sorting.

Groups sprites by material identity, sorts by layer/material/zIndex,
and maintains batch pools for efficient reuse.

## Constructors

### Constructor

> **new BatchManager**(`maxBatchSize`): `BatchManager`

Defined in: [packages/core/src/pipeline/BatchManager.ts:54](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/pipeline/BatchManager.ts#L54)

#### Parameters

##### maxBatchSize

`number` = `DEFAULT_BATCH_SIZE`

#### Returns

`BatchManager`

## Accessors

### batchCount

#### Get Signature

> **get** **batchCount**(): `number`

Defined in: [packages/core/src/pipeline/BatchManager.ts:280](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/pipeline/BatchManager.ts#L280)

Get the number of active batches.

##### Returns

`number`

***

### isEmpty

#### Get Signature

> **get** **isEmpty**(): `boolean`

Defined in: [packages/core/src/pipeline/BatchManager.ts:266](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/pipeline/BatchManager.ts#L266)

Check if the manager has any sprites.

##### Returns

`boolean`

***

### spriteCount

#### Get Signature

> **get** **spriteCount**(): `number`

Defined in: [packages/core/src/pipeline/BatchManager.ts:273](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/pipeline/BatchManager.ts#L273)

Get the total number of sprites.

##### Returns

`number`

## Methods

### add()

> **add**(`sprite`): `void`

Defined in: [packages/core/src/pipeline/BatchManager.ts:61](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/pipeline/BatchManager.ts#L61)

Add a sprite to the batch manager.

#### Parameters

##### sprite

[`Sprite2D`](/api/classes/sprite2d/)

#### Returns

`void`

***

### clear()

> **clear**(): `void`

Defined in: [packages/core/src/pipeline/BatchManager.ts:287](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/pipeline/BatchManager.ts#L287)

Clear all sprites and batches.

#### Returns

`void`

***

### dispose()

> **dispose**(): `void`

Defined in: [packages/core/src/pipeline/BatchManager.ts:304](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/pipeline/BatchManager.ts#L304)

Dispose of all resources.

#### Returns

`void`

***

### getBatches()

> **getBatches**(): readonly [`SpriteBatch`](/api/classes/spritebatch/)[]

Defined in: [packages/core/src/pipeline/BatchManager.ts:242](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/pipeline/BatchManager.ts#L242)

Get active batches for rendering.
Batches are already sorted by layer/material/zIndex.

#### Returns

readonly [`SpriteBatch`](/api/classes/spritebatch/)[]

***

### getStats()

> **getStats**(): [`RenderStats`](/api/interfaces/renderstats/)

Defined in: [packages/core/src/pipeline/BatchManager.ts:249](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/pipeline/BatchManager.ts#L249)

Get render statistics.

#### Returns

[`RenderStats`](/api/interfaces/renderstats/)

***

### invalidate()

> **invalidate**(`sprite`): `void`

Defined in: [packages/core/src/pipeline/BatchManager.ts:88](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/pipeline/BatchManager.ts#L88)

Mark a sprite as needing update.
Call when sprite transform, layer, zIndex, or appearance changes.

#### Parameters

##### sprite

[`Sprite2D`](/api/classes/sprite2d/)

#### Returns

`void`

***

### invalidateAll()

> **invalidateAll**(): `void`

Defined in: [packages/core/src/pipeline/BatchManager.ts:103](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/pipeline/BatchManager.ts#L103)

Mark all sprites as needing update.

#### Returns

`void`

***

### prepare()

> **prepare**(): `void`

Defined in: [packages/core/src/pipeline/BatchManager.ts:123](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/pipeline/BatchManager.ts#L123)

Prepare batches for rendering.
Sorts sprites and rebuilds batches if dirty.

#### Returns

`void`

***

### remove()

> **remove**(`sprite`): `void`

Defined in: [packages/core/src/pipeline/BatchManager.ts:77](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/pipeline/BatchManager.ts#L77)

Remove a sprite from the batch manager.

#### Parameters

##### sprite

[`Sprite2D`](/api/classes/sprite2d/)

#### Returns

`void`

***

### upload()

> **upload**(): `void`

Defined in: [packages/core/src/pipeline/BatchManager.ts:232](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/pipeline/BatchManager.ts#L232)

Upload all batch data to GPU.

#### Returns

`void`
