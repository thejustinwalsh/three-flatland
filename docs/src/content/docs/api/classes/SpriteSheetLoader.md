---
editUrl: false
next: false
prev: false
title: "SpriteSheetLoader"
---

Defined in: [packages/core/src/loaders/SpriteSheetLoader.ts:22](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/loaders/SpriteSheetLoader.ts#L22)

Loader for spritesheet JSON files.

Supports:
- JSON Hash format (TexturePacker default)
- JSON Array format

## Example

```typescript
const sheet = await SpriteSheetLoader.load('/sprites/player.json');
const frame = sheet.getFrame('player_idle_0');
```

## Constructors

### Constructor

> **new SpriteSheetLoader**(): `SpriteSheetLoader`

#### Returns

`SpriteSheetLoader`

## Methods

### clearCache()

> `static` **clearCache**(): `void`

Defined in: [packages/core/src/loaders/SpriteSheetLoader.ts:207](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/loaders/SpriteSheetLoader.ts#L207)

Clear the cache.

#### Returns

`void`

***

### load()

> `static` **load**(`url`): `Promise`\<[`SpriteSheet`](/api/interfaces/spritesheet/)\>

Defined in: [packages/core/src/loaders/SpriteSheetLoader.ts:30](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/loaders/SpriteSheetLoader.ts#L30)

Load a spritesheet from a JSON file.
Results are cached by URL.

#### Parameters

##### url

`string`

#### Returns

`Promise`\<[`SpriteSheet`](/api/interfaces/spritesheet/)\>

***

### preload()

> `static` **preload**(`urls`): `Promise`\<[`SpriteSheet`](/api/interfaces/spritesheet/)[]\>

Defined in: [packages/core/src/loaders/SpriteSheetLoader.ts:214](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/loaders/SpriteSheetLoader.ts#L214)

Preload multiple spritesheets.

#### Parameters

##### urls

`string`[]

#### Returns

`Promise`\<[`SpriteSheet`](/api/interfaces/spritesheet/)[]\>
