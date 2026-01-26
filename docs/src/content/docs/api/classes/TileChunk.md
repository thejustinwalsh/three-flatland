---
editUrl: false
next: false
prev: false
title: "TileChunk"
---

Defined in: [packages/core/src/tilemap/TileChunk.ts:36](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/tilemap/TileChunk.ts#L36)

A chunk of tiles rendered as an InstancedMesh.

Each chunk manages a fixed region of tiles for efficient
culling and GPU upload. Chunks use instanced rendering where
each tile is an instance with its own UV coordinates.

## Example

```typescript
const chunk = new TileChunk({
  coord: { x: 0, y: 0 },
  size: 16,
  tileWidth: 16,
  tileHeight: 16,
  tileset: myTileset,
})

chunk.setTiles(tiles, tileset)
chunk.upload()
scene.add(chunk.mesh)
```

## Constructors

### Constructor

> **new TileChunk**(`coord`, `size`, `tileWidth`, `tileHeight`, `tileset`): `TileChunk`

Defined in: [packages/core/src/tilemap/TileChunk.ts:72](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/tilemap/TileChunk.ts#L72)

#### Parameters

##### coord

[`ChunkCoord`](/api/interfaces/chunkcoord/)

##### size

`number`

##### tileWidth

`number`

##### tileHeight

`number`

##### tileset

[`Tileset`](/api/classes/tileset/)

#### Returns

`TileChunk`

## Properties

### bounds

> `readonly` **bounds**: [`Box3`](https://github.com/mrdoob/three.js/blob/dev/src/math/Box3.js)

Defined in: [packages/core/src/tilemap/TileChunk.ts:54](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/tilemap/TileChunk.ts#L54)

Bounding box for frustum culling (in world space)

***

### coord

> `readonly` **coord**: [`ChunkCoord`](/api/interfaces/chunkcoord/)

Defined in: [packages/core/src/tilemap/TileChunk.ts:38](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/tilemap/TileChunk.ts#L38)

Chunk coordinates (in chunk units)

***

### material

> `readonly` **material**: [`TileChunkMaterial`](/api/classes/tilechunkmaterial/)

Defined in: [packages/core/src/tilemap/TileChunk.ts:51](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/tilemap/TileChunk.ts#L51)

The material used by this chunk

***

### mesh

> `readonly` **mesh**: [`InstancedMesh`](https://github.com/mrdoob/three.js/blob/dev/src/objects/InstancedMesh.js)

Defined in: [packages/core/src/tilemap/TileChunk.ts:48](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/tilemap/TileChunk.ts#L48)

The instanced mesh for rendering

***

### size

> `readonly` **size**: `number`

Defined in: [packages/core/src/tilemap/TileChunk.ts:41](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/tilemap/TileChunk.ts#L41)

Chunk size in tiles (e.g., 16 means 16x16 tiles)

***

### tileHeight

> `readonly` **tileHeight**: `number`

Defined in: [packages/core/src/tilemap/TileChunk.ts:45](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/tilemap/TileChunk.ts#L45)

***

### tileWidth

> `readonly` **tileWidth**: `number`

Defined in: [packages/core/src/tilemap/TileChunk.ts:44](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/tilemap/TileChunk.ts#L44)

Tile dimensions in pixels/world units

## Accessors

### dirty

#### Get Signature

> **get** **dirty**(): `boolean`

Defined in: [packages/core/src/tilemap/TileChunk.ts:249](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/tilemap/TileChunk.ts#L249)

Check if chunk needs GPU upload.

##### Returns

`boolean`

***

### tileCount

#### Get Signature

> **get** **tileCount**(): `number`

Defined in: [packages/core/src/tilemap/TileChunk.ts:242](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/tilemap/TileChunk.ts#L242)

Get current tile count.

##### Returns

`number`

## Methods

### clear()

> **clear**(): `void`

Defined in: [packages/core/src/tilemap/TileChunk.ts:133](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/tilemap/TileChunk.ts#L133)

Clear all tiles from the chunk.

#### Returns

`void`

***

### containsWorldPosition()

> **containsWorldPosition**(`x`, `y`): `boolean`

Defined in: [packages/core/src/tilemap/TileChunk.ts:121](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/tilemap/TileChunk.ts#L121)

Check if chunk contains a world position.

#### Parameters

##### x

`number`

##### y

`number`

#### Returns

`boolean`

***

### dispose()

> **dispose**(): `void`

Defined in: [packages/core/src/tilemap/TileChunk.ts:256](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/tilemap/TileChunk.ts#L256)

Dispose of resources.

#### Returns

`void`

***

### setTiles()

> **setTiles**(`tiles`, `tileset`): `void`

Defined in: [packages/core/src/tilemap/TileChunk.ts:141](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/tilemap/TileChunk.ts#L141)

Set tiles from an array of tile instances.

#### Parameters

##### tiles

[`TileInstance`](/api/interfaces/tileinstance/)[]

##### tileset

[`Tileset`](/api/classes/tileset/)

#### Returns

`void`

***

### updateAnimatedTiles()

> **updateAnimatedTiles**(`animatedPositions`, `tileset`): `void`

Defined in: [packages/core/src/tilemap/TileChunk.ts:199](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/tilemap/TileChunk.ts#L199)

Update specific tiles for animation.

#### Parameters

##### animatedPositions

`Map`\<`number`, \{ `gid`: `number`; `index`: `number`; \}\>

##### tileset

[`Tileset`](/api/classes/tileset/)

#### Returns

`void`

***

### upload()

> **upload**(): `void`

Defined in: [packages/core/src/tilemap/TileChunk.ts:222](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/tilemap/TileChunk.ts#L222)

Upload buffer data to GPU.
Call after adding/modifying tiles and before rendering.

#### Returns

`void`
