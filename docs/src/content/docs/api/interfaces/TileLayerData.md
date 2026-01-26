---
editUrl: false
next: false
prev: false
title: "TileLayerData"
---

Defined in: [packages/core/src/tilemap/types.ts:71](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/tilemap/types.ts#L71)

Tile layer data.

## Properties

### data

> **data**: `Uint32Array`

Defined in: [packages/core/src/tilemap/types.ts:81](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/tilemap/types.ts#L81)

Tile data (GIDs, 0 = empty)

***

### height

> **height**: `number`

Defined in: [packages/core/src/tilemap/types.ts:79](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/tilemap/types.ts#L79)

Layer height in tiles

***

### id

> **id**: `number`

Defined in: [packages/core/src/tilemap/types.ts:75](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/tilemap/types.ts#L75)

Layer ID

***

### name

> **name**: `string`

Defined in: [packages/core/src/tilemap/types.ts:73](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/tilemap/types.ts#L73)

Layer name

***

### offset?

> `optional` **offset**: `object`

Defined in: [packages/core/src/tilemap/types.ts:83](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/tilemap/types.ts#L83)

Layer offset in pixels

#### x

> **x**: `number`

#### y

> **y**: `number`

***

### opacity?

> `optional` **opacity**: `number`

Defined in: [packages/core/src/tilemap/types.ts:85](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/tilemap/types.ts#L85)

Layer opacity (0-1)

***

### parallax?

> `optional` **parallax**: `object`

Defined in: [packages/core/src/tilemap/types.ts:89](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/tilemap/types.ts#L89)

Parallax factor

#### x

> **x**: `number`

#### y

> **y**: `number`

***

### properties?

> `optional` **properties**: `Record`\<`string`, `unknown`\>

Defined in: [packages/core/src/tilemap/types.ts:93](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/tilemap/types.ts#L93)

Custom properties

***

### tint?

> `optional` **tint**: `number`

Defined in: [packages/core/src/tilemap/types.ts:91](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/tilemap/types.ts#L91)

Tint color

***

### visible?

> `optional` **visible**: `boolean`

Defined in: [packages/core/src/tilemap/types.ts:87](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/tilemap/types.ts#L87)

Layer visibility

***

### width

> **width**: `number`

Defined in: [packages/core/src/tilemap/types.ts:77](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/tilemap/types.ts#L77)

Layer width in tiles
