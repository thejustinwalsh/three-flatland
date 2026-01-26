---
editUrl: false
next: false
prev: false
title: "TiledLoader"
---

Defined in: [packages/core/src/tilemap/TiledLoader.ts:125](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/tilemap/TiledLoader.ts#L125)

Loader for Tiled JSON format (.tmj/.json).

Supports:
- Standard JSON map format
- Embedded and external tilesets
- Tile layers with data arrays
- Infinite maps with chunks
- Object layers
- Tile animations
- Tile collision data

## Example

```typescript
const mapData = await TiledLoader.load('/maps/level1.json')
const tilemap = new TileMap2D({ data: mapData })
scene.add(tilemap)
```

## Constructors

### Constructor

> **new TiledLoader**(): `TiledLoader`

#### Returns

`TiledLoader`

## Methods

### clearCache()

> `static` **clearCache**(): `void`

Defined in: [packages/core/src/tilemap/TiledLoader.ts:479](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/tilemap/TiledLoader.ts#L479)

Clear the cache.

#### Returns

`void`

***

### load()

> `static` **load**(`url`): `Promise`\<[`TileMapData`](/api/interfaces/tilemapdata/)\>

Defined in: [packages/core/src/tilemap/TiledLoader.ts:133](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/tilemap/TiledLoader.ts#L133)

Load a Tiled JSON map.
Results are cached by URL.

#### Parameters

##### url

`string`

#### Returns

`Promise`\<[`TileMapData`](/api/interfaces/tilemapdata/)\>

***

### preload()

> `static` **preload**(`urls`): `Promise`\<[`TileMapData`](/api/interfaces/tilemapdata/)[]\>

Defined in: [packages/core/src/tilemap/TiledLoader.ts:486](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/tilemap/TiledLoader.ts#L486)

Preload multiple maps.

#### Parameters

##### urls

`string`[]

#### Returns

`Promise`\<[`TileMapData`](/api/interfaces/tilemapdata/)[]\>
