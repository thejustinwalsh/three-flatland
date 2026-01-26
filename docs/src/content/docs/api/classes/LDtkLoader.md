---
editUrl: false
next: false
prev: false
title: "LDtkLoader"
---

Defined in: [packages/core/src/tilemap/LDtkLoader.ts:153](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/tilemap/LDtkLoader.ts#L153)

Loader for LDtk JSON format.

Supports:
- Single level or multi-level projects
- Tile layers (Tiles, AutoLayer, IntGrid)
- Entity layers
- IntGrid collision data
- Tile flip flags
- Custom field data

## Example

```typescript
// Load a specific level
const mapData = await LDtkLoader.load('/maps/world.ldtk', 'Level_0')
const tilemap = new TileMap2D({ data: mapData })

// Load entire project (all levels)
const allLevels = await LDtkLoader.loadProject('/maps/world.ldtk')
```

## Constructors

### Constructor

> **new LDtkLoader**(): `LDtkLoader`

#### Returns

`LDtkLoader`

## Methods

### clearCache()

> `static` **clearCache**(): `void`

Defined in: [packages/core/src/tilemap/LDtkLoader.ts:527](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/tilemap/LDtkLoader.ts#L527)

Clear the cache.

#### Returns

`void`

***

### getLevelIds()

> `static` **getLevelIds**(`url`): `Promise`\<`string`[]\>

Defined in: [packages/core/src/tilemap/LDtkLoader.ts:519](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/tilemap/LDtkLoader.ts#L519)

Get all level identifiers from a project.

#### Parameters

##### url

`string`

#### Returns

`Promise`\<`string`[]\>

***

### load()

> `static` **load**(`url`, `levelId?`): `Promise`\<[`TileMapData`](/api/interfaces/tilemapdata/)\>

Defined in: [packages/core/src/tilemap/LDtkLoader.ts:160](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/tilemap/LDtkLoader.ts#L160)

Load a single level from an LDtk project.

#### Parameters

##### url

`string`

##### levelId?

`string` | `number`

#### Returns

`Promise`\<[`TileMapData`](/api/interfaces/tilemapdata/)\>

***

### loadProject()

> `static` **loadProject**(`url`): `Promise`\<`LDtkProject`\>

Defined in: [packages/core/src/tilemap/LDtkLoader.ts:184](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/tilemap/LDtkLoader.ts#L184)

Load the LDtk project file.

#### Parameters

##### url

`string`

#### Returns

`Promise`\<`LDtkProject`\>
