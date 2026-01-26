---
editUrl: false
next: false
prev: false
title: "TileDefinition"
---

Defined in: [packages/core/src/tilemap/types.ts:6](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/tilemap/types.ts#L6)

A single tile definition in a tileset.

## Properties

### animation?

> `optional` **animation**: [`TileAnimationFrame`](/api/interfaces/tileanimationframe/)[]

Defined in: [packages/core/src/tilemap/types.ts:16](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/tilemap/types.ts#L16)

Animation frames (if animated)

***

### collision?

> `optional` **collision**: [`CollisionShape`](/api/type-aliases/collisionshape/)[]

Defined in: [packages/core/src/tilemap/types.ts:12](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/tilemap/types.ts#L12)

Collision shapes (if any)

***

### id

> **id**: `number`

Defined in: [packages/core/src/tilemap/types.ts:8](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/tilemap/types.ts#L8)

Global tile ID (GID)

***

### properties?

> `optional` **properties**: `Record`\<`string`, `unknown`\>

Defined in: [packages/core/src/tilemap/types.ts:14](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/tilemap/types.ts#L14)

Custom properties

***

### uv

> **uv**: `object`

Defined in: [packages/core/src/tilemap/types.ts:10](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/tilemap/types.ts#L10)

UV coordinates in atlas (normalized 0-1)

#### height

> **height**: `number`

#### width

> **width**: `number`

#### x

> **x**: `number`

#### y

> **y**: `number`
