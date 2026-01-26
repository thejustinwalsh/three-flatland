---
editUrl: false
next: false
prev: false
title: "ObjectLayerData"
---

Defined in: [packages/core/src/tilemap/types.ts:99](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/tilemap/types.ts#L99)

Object layer data (for entities, spawn points, etc.).

## Properties

### id

> **id**: `number`

Defined in: [packages/core/src/tilemap/types.ts:103](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/tilemap/types.ts#L103)

Layer ID

***

### name

> **name**: `string`

Defined in: [packages/core/src/tilemap/types.ts:101](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/tilemap/types.ts#L101)

Layer name

***

### objects

> **objects**: [`TileMapObject`](/api/interfaces/tilemapobject/)[]

Defined in: [packages/core/src/tilemap/types.ts:105](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/tilemap/types.ts#L105)

Objects in this layer

***

### offset?

> `optional` **offset**: `object`

Defined in: [packages/core/src/tilemap/types.ts:107](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/tilemap/types.ts#L107)

Layer offset in pixels

#### x

> **x**: `number`

#### y

> **y**: `number`

***

### properties?

> `optional` **properties**: `Record`\<`string`, `unknown`\>

Defined in: [packages/core/src/tilemap/types.ts:111](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/tilemap/types.ts#L111)

Custom properties

***

### visible?

> `optional` **visible**: `boolean`

Defined in: [packages/core/src/tilemap/types.ts:109](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/tilemap/types.ts#L109)

Layer visibility
