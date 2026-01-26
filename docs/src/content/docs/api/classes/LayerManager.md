---
editUrl: false
next: false
prev: false
title: "LayerManager"
---

Defined in: [packages/core/src/pipeline/LayerManager.ts:148](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/pipeline/LayerManager.ts#L148)

Manages render layers for 2D scenes.

Provides a higher-level API for organizing sprites into layers.
Use with Renderer2D for automatic batching and sorting.

## Example

```typescript
const layers = new LayerManager()

// Create layers
const entities = layers.createLayer({ name: 'entities', value: Layers.ENTITIES })
const effects = layers.createLayer({ name: 'effects', value: Layers.EFFECTS })

// Add sprites to layers
layers.addToLayer('entities', playerSprite)
layers.addToLayer('effects', particleSprite)

// Toggle layer visibility
layers.setLayerVisible('effects', false)
```

## Constructors

### Constructor

> **new LayerManager**(): `LayerManager`

#### Returns

`LayerManager`

## Accessors

### count

#### Get Signature

> **get** **count**(): `number`

Defined in: [packages/core/src/pipeline/LayerManager.ts:312](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/pipeline/LayerManager.ts#L312)

Get the number of layers.

##### Returns

`number`

## Methods

### \[iterator\]()

> **\[iterator\]**(): `Iterator`\<[`Layer`](/api/classes/layer/)\>

Defined in: [packages/core/src/pipeline/LayerManager.ts:330](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/pipeline/LayerManager.ts#L330)

Iterate over layers.

#### Returns

`Iterator`\<[`Layer`](/api/classes/layer/)\>

***

### addToLayer()

> **addToLayer**(`layerName`, `sprite`): `void`

Defined in: [packages/core/src/pipeline/LayerManager.ts:221](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/pipeline/LayerManager.ts#L221)

Add a sprite to a layer.

#### Parameters

##### layerName

`string`

##### sprite

[`Sprite2D`](/api/classes/sprite2d/)

#### Returns

`void`

***

### clear()

> **clear**(): `void`

Defined in: [packages/core/src/pipeline/LayerManager.ts:319](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/pipeline/LayerManager.ts#L319)

Clear all layers.

#### Returns

`void`

***

### createLayer()

> **createLayer**(`config`): [`Layer`](/api/classes/layer/)

Defined in: [packages/core/src/pipeline/LayerManager.ts:179](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/pipeline/LayerManager.ts#L179)

Create a new layer.

#### Parameters

##### config

[`LayerConfig`](/api/interfaces/layerconfig/)

#### Returns

[`Layer`](/api/classes/layer/)

***

### getLayer()

> **getLayer**(`name`): [`Layer`](/api/classes/layer/) \| `undefined`

Defined in: [packages/core/src/pipeline/LayerManager.ts:194](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/pipeline/LayerManager.ts#L194)

Get a layer by name.

#### Parameters

##### name

`string`

#### Returns

[`Layer`](/api/classes/layer/) \| `undefined`

***

### getLayerByValue()

> **getLayerByValue**(`value`): [`Layer`](/api/classes/layer/) \| `undefined`

Defined in: [packages/core/src/pipeline/LayerManager.ts:201](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/pipeline/LayerManager.ts#L201)

Get a layer by value.

#### Parameters

##### value

`number`

#### Returns

[`Layer`](/api/classes/layer/) \| `undefined`

***

### getLayerNames()

> **getLayerNames**(): `string`[]

Defined in: [packages/core/src/pipeline/LayerManager.ts:291](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/pipeline/LayerManager.ts#L291)

Get all layer names.

#### Returns

`string`[]

***

### getLayers()

> **getLayers**(): [`Layer`](/api/classes/layer/)[]

Defined in: [packages/core/src/pipeline/LayerManager.ts:298](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/pipeline/LayerManager.ts#L298)

Get all layers.

#### Returns

[`Layer`](/api/classes/layer/)[]

***

### hasLayer()

> **hasLayer**(`name`): `boolean`

Defined in: [packages/core/src/pipeline/LayerManager.ts:305](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/pipeline/LayerManager.ts#L305)

Check if a layer exists.

#### Parameters

##### name

`string`

#### Returns

`boolean`

***

### isLayerVisible()

> **isLayerVisible**(`name`): `boolean`

Defined in: [packages/core/src/pipeline/LayerManager.ts:268](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/pipeline/LayerManager.ts#L268)

Get layer visibility.

#### Parameters

##### name

`string`

#### Returns

`boolean`

***

### moveToLayer()

> **moveToLayer**(`sprite`, `newLayerName`): `void`

Defined in: [packages/core/src/pipeline/LayerManager.ts:242](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/pipeline/LayerManager.ts#L242)

Move a sprite to a different layer.

#### Parameters

##### sprite

[`Sprite2D`](/api/classes/sprite2d/)

##### newLayerName

`string`

#### Returns

`void`

***

### removeFromLayer()

> **removeFromLayer**(`sprite`): `void`

Defined in: [packages/core/src/pipeline/LayerManager.ts:232](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/pipeline/LayerManager.ts#L232)

Remove a sprite from its current layer.

#### Parameters

##### sprite

[`Sprite2D`](/api/classes/sprite2d/)

#### Returns

`void`

***

### removeLayer()

> **removeLayer**(`name`): `boolean`

Defined in: [packages/core/src/pipeline/LayerManager.ts:208](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/pipeline/LayerManager.ts#L208)

Remove a layer.

#### Parameters

##### name

`string`

#### Returns

`boolean`

***

### setLayerVisible()

> **setLayerVisible**(`name`, `visible`): `void`

Defined in: [packages/core/src/pipeline/LayerManager.ts:257](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/pipeline/LayerManager.ts#L257)

Set layer visibility.

#### Parameters

##### name

`string`

##### visible

`boolean`

#### Returns

`void`

***

### toggleLayerVisible()

> **toggleLayerVisible**(`name`): `boolean`

Defined in: [packages/core/src/pipeline/LayerManager.ts:279](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/pipeline/LayerManager.ts#L279)

Toggle layer visibility.

#### Parameters

##### name

`string`

#### Returns

`boolean`

***

### withDefaults()

> `static` **withDefaults**(): `LayerManager`

Defined in: [packages/core/src/pipeline/LayerManager.ts:162](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/pipeline/LayerManager.ts#L162)

Create default layers based on the Layers constant.

#### Returns

`LayerManager`
