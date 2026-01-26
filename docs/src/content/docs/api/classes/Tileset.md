---
editUrl: false
next: false
prev: false
title: "Tileset"
---

Defined in: [packages/core/src/tilemap/Tileset.ts:27](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/tilemap/Tileset.ts#L27)

Represents a tileset with tile definitions and texture atlas.

Handles UV coordinate calculation and animated tile management.

## Example

```typescript
const tileset = new Tileset({
  name: 'dungeon',
  firstGid: 1,
  tileWidth: 16,
  tileHeight: 16,
  imageWidth: 256,
  imageHeight: 256,
  columns: 16,
  tileCount: 256,
  tiles: new Map(),
  texture: myTexture,
})

const uv = tileset.getUV(5) // Get UV for tile GID 5
```

## Constructors

### Constructor

> **new Tileset**(`data`): `Tileset`

Defined in: [packages/core/src/tilemap/Tileset.ts:57](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/tilemap/Tileset.ts#L57)

#### Parameters

##### data

[`TilesetData`](/api/interfaces/tilesetdata/)

#### Returns

`Tileset`

## Properties

### columns

> `readonly` **columns**: `number`

Defined in: [packages/core/src/tilemap/Tileset.ts:43](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/tilemap/Tileset.ts#L43)

Grid info

***

### firstGid

> `readonly` **firstGid**: `number`

Defined in: [packages/core/src/tilemap/Tileset.ts:32](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/tilemap/Tileset.ts#L32)

First GID

***

### imageHeight

> `readonly` **imageHeight**: `number`

Defined in: [packages/core/src/tilemap/Tileset.ts:40](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/tilemap/Tileset.ts#L40)

***

### imageWidth

> `readonly` **imageWidth**: `number`

Defined in: [packages/core/src/tilemap/Tileset.ts:39](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/tilemap/Tileset.ts#L39)

Atlas dimensions

***

### margin

> `readonly` **margin**: `number`

Defined in: [packages/core/src/tilemap/Tileset.ts:46](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/tilemap/Tileset.ts#L46)

***

### name

> `readonly` **name**: `string`

Defined in: [packages/core/src/tilemap/Tileset.ts:29](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/tilemap/Tileset.ts#L29)

Tileset name

***

### spacing

> `readonly` **spacing**: `number`

Defined in: [packages/core/src/tilemap/Tileset.ts:45](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/tilemap/Tileset.ts#L45)

***

### tileCount

> `readonly` **tileCount**: `number`

Defined in: [packages/core/src/tilemap/Tileset.ts:44](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/tilemap/Tileset.ts#L44)

***

### tileHeight

> `readonly` **tileHeight**: `number`

Defined in: [packages/core/src/tilemap/Tileset.ts:36](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/tilemap/Tileset.ts#L36)

***

### tileWidth

> `readonly` **tileWidth**: `number`

Defined in: [packages/core/src/tilemap/Tileset.ts:35](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/tilemap/Tileset.ts#L35)

Tile dimensions

## Accessors

### texture

#### Get Signature

> **get** **texture**(): [`Texture`](https://github.com/mrdoob/three.js/blob/dev/src/textures/Texture.js)\<`unknown`\> \| `null`

Defined in: [packages/core/src/tilemap/Tileset.ts:85](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/tilemap/Tileset.ts#L85)

Get the texture atlas.

##### Returns

[`Texture`](https://github.com/mrdoob/three.js/blob/dev/src/textures/Texture.js)\<`unknown`\> \| `null`

#### Set Signature

> **set** **texture**(`value`): `void`

Defined in: [packages/core/src/tilemap/Tileset.ts:92](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/tilemap/Tileset.ts#L92)

Set the texture atlas.

##### Parameters

###### value

[`Texture`](https://github.com/mrdoob/three.js/blob/dev/src/textures/Texture.js)\<`unknown`\> | `null`

##### Returns

`void`

## Methods

### containsGid()

> **containsGid**(`gid`): `boolean`

Defined in: [packages/core/src/tilemap/Tileset.ts:107](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/tilemap/Tileset.ts#L107)

Check if a GID belongs to this tileset.

#### Parameters

##### gid

`number`

#### Returns

`boolean`

***

### dispose()

> **dispose**(): `void`

Defined in: [packages/core/src/tilemap/Tileset.ts:182](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/tilemap/Tileset.ts#L182)

Dispose of resources.

#### Returns

`void`

***

### getAnimatedTileIds()

> **getAnimatedTileIds**(): `number`[]

Defined in: [packages/core/src/tilemap/Tileset.ts:175](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/tilemap/Tileset.ts#L175)

Get all animated tile IDs (as GIDs).

#### Returns

`number`[]

***

### getAnimation()

> **getAnimation**(`gid`): [`TileAnimationFrame`](/api/interfaces/tileanimationframe/)[] \| `undefined`

Defined in: [packages/core/src/tilemap/Tileset.ts:167](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/tilemap/Tileset.ts#L167)

Get animation frames for a tile.

#### Parameters

##### gid

`number`

#### Returns

[`TileAnimationFrame`](/api/interfaces/tileanimationframe/)[] \| `undefined`

***

### getLocalId()

> **getLocalId**(`gid`): `number`

Defined in: [packages/core/src/tilemap/Tileset.ts:115](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/tilemap/Tileset.ts#L115)

Get local ID from GID.

#### Parameters

##### gid

`number`

#### Returns

`number`

***

### getTile()

> **getTile**(`gid`): [`TileDefinition`](/api/interfaces/tiledefinition/) \| `undefined`

Defined in: [packages/core/src/tilemap/Tileset.ts:151](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/tilemap/Tileset.ts#L151)

Get tile definition.

#### Parameters

##### gid

`number`

#### Returns

[`TileDefinition`](/api/interfaces/tiledefinition/) \| `undefined`

***

### getUV()

> **getUV**(`gid`): `object`

Defined in: [packages/core/src/tilemap/Tileset.ts:124](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/tilemap/Tileset.ts#L124)

Get UV coordinates for a tile.
Returns normalized UV coordinates (0-1) for the tile in the atlas.
Note: Y is NOT flipped here - the material handles coordinate space conversion.

#### Parameters

##### gid

`number`

#### Returns

`object`

##### height

> **height**: `number`

##### width

> **width**: `number`

##### x

> **x**: `number`

##### y

> **y**: `number`

***

### isAnimated()

> **isAnimated**(`gid`): `boolean`

Defined in: [packages/core/src/tilemap/Tileset.ts:159](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/tilemap/Tileset.ts#L159)

Check if a tile is animated.

#### Parameters

##### gid

`number`

#### Returns

`boolean`
