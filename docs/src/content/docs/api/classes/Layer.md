---
editUrl: false
next: false
prev: false
title: "Layer"
---

Defined in: [packages/core/src/pipeline/LayerManager.ts:8](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/pipeline/LayerManager.ts#L8)

A managed layer containing sprites.

## Constructors

### Constructor

> **new Layer**(`config`): `Layer`

Defined in: [packages/core/src/pipeline/LayerManager.ts:44](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/pipeline/LayerManager.ts#L44)

#### Parameters

##### config

[`LayerConfig`](/api/interfaces/layerconfig/)

#### Returns

`Layer`

## Properties

### blendMode

> **blendMode**: [`BlendMode`](/api/type-aliases/blendmode/)

Defined in: [packages/core/src/pipeline/LayerManager.ts:27](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/pipeline/LayerManager.ts#L27)

Blend mode for this layer.

***

### name

> `readonly` **name**: `string`

Defined in: [packages/core/src/pipeline/LayerManager.ts:12](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/pipeline/LayerManager.ts#L12)

Layer name.

***

### onVisibilityChange()?

> `optional` **onVisibilityChange**: (`visible`) => `void`

Defined in: [packages/core/src/pipeline/LayerManager.ts:42](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/pipeline/LayerManager.ts#L42)

Callback when visibility changes.

#### Parameters

##### visible

`boolean`

#### Returns

`void`

***

### sortMode

> **sortMode**: [`SortMode`](/api/type-aliases/sortmode/)

Defined in: [packages/core/src/pipeline/LayerManager.ts:32](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/pipeline/LayerManager.ts#L32)

Sort mode for sprites in this layer.

***

### value

> `readonly` **value**: `number`

Defined in: [packages/core/src/pipeline/LayerManager.ts:17](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/pipeline/LayerManager.ts#L17)

Layer value (render order).

## Accessors

### count

#### Get Signature

> **get** **count**(): `number`

Defined in: [packages/core/src/pipeline/LayerManager.ts:62](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/pipeline/LayerManager.ts#L62)

Get sprite count.

##### Returns

`number`

***

### sprites

#### Get Signature

> **get** **sprites**(): `ReadonlySet`\<[`Sprite2D`](/api/classes/sprite2d/)\>

Defined in: [packages/core/src/pipeline/LayerManager.ts:55](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/pipeline/LayerManager.ts#L55)

Get sprites in this layer.

##### Returns

`ReadonlySet`\<[`Sprite2D`](/api/classes/sprite2d/)\>

***

### visible

#### Get Signature

> **get** **visible**(): `boolean`

Defined in: [packages/core/src/pipeline/LayerManager.ts:69](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/pipeline/LayerManager.ts#L69)

Get visibility.

##### Returns

`boolean`

#### Set Signature

> **set** **visible**(`value`): `void`

Defined in: [packages/core/src/pipeline/LayerManager.ts:76](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/pipeline/LayerManager.ts#L76)

Set visibility.

##### Parameters

###### value

`boolean`

##### Returns

`void`

## Methods

### \[iterator\]()

> **\[iterator\]**(): `Iterator`\<[`Sprite2D`](/api/classes/sprite2d/)\>

Defined in: [packages/core/src/pipeline/LayerManager.ts:121](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/pipeline/LayerManager.ts#L121)

Iterate over sprites in this layer.

#### Returns

`Iterator`\<[`Sprite2D`](/api/classes/sprite2d/)\>

***

### add()

> **add**(`sprite`): `void`

Defined in: [packages/core/src/pipeline/LayerManager.ts:91](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/pipeline/LayerManager.ts#L91)

Add a sprite to this layer.

#### Parameters

##### sprite

[`Sprite2D`](/api/classes/sprite2d/)

#### Returns

`void`

***

### clear()

> **clear**(): `void`

Defined in: [packages/core/src/pipeline/LayerManager.ts:114](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/pipeline/LayerManager.ts#L114)

Clear all sprites from this layer.

#### Returns

`void`

***

### has()

> **has**(`sprite`): `boolean`

Defined in: [packages/core/src/pipeline/LayerManager.ts:107](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/pipeline/LayerManager.ts#L107)

Check if layer contains a sprite.

#### Parameters

##### sprite

[`Sprite2D`](/api/classes/sprite2d/)

#### Returns

`boolean`

***

### remove()

> **remove**(`sprite`): `void`

Defined in: [packages/core/src/pipeline/LayerManager.ts:100](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/pipeline/LayerManager.ts#L100)

Remove a sprite from this layer.

#### Parameters

##### sprite

[`Sprite2D`](/api/classes/sprite2d/)

#### Returns

`void`
