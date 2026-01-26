---
editUrl: false
next: false
prev: false
title: "TileMap2D"
---

Defined in: [packages/core/src/tilemap/TileMap2D.ts:47](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/tilemap/TileMap2D.ts#L47)

Main tilemap class for rendering 2D tile-based maps.

Supports:
- Multiple tile layers
- Animated tiles
- Chunked rendering for large maps
- Collision data extraction
- Object layer access (spawn points, triggers, etc.)

Follows R3F-compatible constructor pattern with optional parameters.

## Examples

```typescript
// Vanilla Three.js
const mapData = await TiledLoader.load('/maps/level1.json')
const tilemap = new TileMap2D({ data: mapData })
scene.add(tilemap)

// In update loop
tilemap.update(deltaMs)
```

```tsx
// React Three Fiber (after extending)
extend({ TileMap2D })

function Level() {
  const mapData = use(TiledLoader.load('/maps/level1.json'))
  return <tileMap2D data={mapData} />
}
```

## Extends

- [`Group`](https://github.com/mrdoob/three.js/blob/dev/src/objects/Group.js)

## Constructors

### Constructor

> **new TileMap2D**(`options?`): `TileMap2D`

Defined in: [packages/core/src/tilemap/TileMap2D.ts:90](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/tilemap/TileMap2D.ts#L90)

Create a new TileMap2D.

#### Parameters

##### options?

[`TileMap2DOptions`](/api/interfaces/tilemap2doptions/)

Optional configuration. If not provided (R3F path),
                 the tilemap will be initialized when `data` is set.

#### Returns

`TileMap2D`

#### Overrides

`Group.constructor`

## Properties

### animations

> **animations**: [`AnimationClip`](https://github.com/mrdoob/three.js/tree/dev/src)[]

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/Object3D.d.ts:266

Array with object's animation clips.

#### Default Value

`[]`

#### Inherited from

`Group.animations`

***

### castShadow

> **castShadow**: `boolean`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/Object3D.d.ts:238

Whether the object gets rendered into shadow map.

#### Default Value

`false`

#### Inherited from

`Group.castShadow`

***

### children

> **children**: [`Object3D`](https://github.com/mrdoob/three.js/blob/dev/src/core/Object3D.js)\<[`Object3DEventMap`](https://github.com/mrdoob/three.js/tree/dev/src)\>[]

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/Object3D.d.ts:145

Array with object's children.

#### See

THREE.Object3DGroup \| Group for info on manually grouping objects.

#### Default Value

`[]`

#### Inherited from

`Group.children`

***

### count?

> `optional` **count**: `number`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/renderers/common/Backend.d.ts:7

#### Inherited from

`Group.count`

***

### customDepthMaterial?

> `optional` **customDepthMaterial**: [`Material`](https://github.com/mrdoob/three.js/blob/dev/src/materials/Material.js)

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/Object3D.d.ts:282

Custom depth material to be used when rendering to the depth map.

#### Remarks

Can only be used in context of meshes.
When shadow-casting with a THREE.DirectionalLight \| DirectionalLight or THREE.SpotLight \| SpotLight,
if you are modifying vertex positions in the vertex shader you must specify a customDepthMaterial for proper shadows.

#### Default Value

`undefined`

#### Inherited from

`Group.customDepthMaterial`

***

### customDistanceMaterial?

> `optional` **customDistanceMaterial**: [`Material`](https://github.com/mrdoob/three.js/blob/dev/src/materials/Material.js)

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/Object3D.d.ts:288

Same as [customDepthMaterial](/api/classes/tilemap2d/#customdepthmaterial), but used with THREE.Object3DPointLight \| PointLight.

#### Default Value

`undefined`

#### Inherited from

`Group.customDistanceMaterial`

***

### frustumCulled

> **frustumCulled**: `boolean`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/Object3D.d.ts:251

When this is set, it checks every frame if the object is in the frustum of the camera before rendering the object.
If set to `false` the object gets rendered every frame even if it is not in the frustum of the camera.

#### Default Value

`true`

#### Inherited from

`Group.frustumCulled`

***

### id

> `readonly` **id**: `number`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/Object3D.d.ts:109

Unique number for this [Object3D](https://github.com/mrdoob/three.js/blob/dev/src/core/Object3D.js) instance.

#### Remarks

Note that ids are assigned in chronological order: 1, 2, 3, ..., incrementing by one for each new object.
Expects a `Integer`

#### Inherited from

`Group.id`

***

### isGroup

> `readonly` **isGroup**: `true`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/objects/Group.d.ts:36

Read-only flag to check if a given object is of type [Group](https://github.com/mrdoob/three.js/blob/dev/src/objects/Group.js).

#### Remarks

This is a _constant_ value

#### Default Value

`true`

#### Inherited from

`Group.isGroup`

***

### isObject3D

> `readonly` **isObject3D**: `true`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/Object3D.d.ts:102

Flag to check if a given object is of type [Object3D](https://github.com/mrdoob/three.js/blob/dev/src/core/Object3D.js).

#### Remarks

This is a _constant_ value

#### Default Value

`true`

#### Inherited from

`Group.isObject3D`

***

### layers

> **layers**: [`Layers`](https://github.com/mrdoob/three.js/blob/dev/src/core/Layers.js)

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/Object3D.d.ts:226

The layer membership of the object.

#### Remarks

The object is only visible if it has at least one layer in common with the THREE.Object3DCamera \| Camera in use.
This property can also be used to filter out unwanted objects in ray-intersection tests when using THREE.Raycaster \| Raycaster.

#### Default Value

`new THREE.Layers()`

#### Inherited from

`Group.layers`

***

### matrix

> **matrix**: [`Matrix4`](https://github.com/mrdoob/three.js/blob/dev/src/math/Matrix4.js)

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/Object3D.d.ts:191

The local transform matrix.

#### Default Value

`new THREE.Matrix4()`

#### Inherited from

`Group.matrix`

***

### matrixAutoUpdate

> **matrixAutoUpdate**: `boolean`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/Object3D.d.ts:205

When this is set, it calculates the matrix of position, (rotation or quaternion) and
scale every frame and also recalculates the matrixWorld property.

#### Default Value

[DEFAULT\_MATRIX\_AUTO\_UPDATE](/api/classes/sprite2d/#default_matrix_auto_update) - that is `(true)`.

#### Inherited from

`Group.matrixAutoUpdate`

***

### matrixWorld

> **matrixWorld**: [`Matrix4`](https://github.com/mrdoob/three.js/blob/dev/src/math/Matrix4.js)

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/Object3D.d.ts:198

The global transform of the object.

#### Remarks

If the [Object3D](https://github.com/mrdoob/three.js/blob/dev/src/core/Object3D.js) has no parent, then it's identical to the local transform THREE.Object3D.matrix \| .matrix.

#### Default Value

`new THREE.Matrix4()`

#### Inherited from

`Group.matrixWorld`

***

### matrixWorldAutoUpdate

> **matrixWorldAutoUpdate**: `boolean`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/Object3D.d.ts:212

If set, then the renderer checks every frame if the object and its children need matrix updates.
When it isn't, then you have to maintain all matrices in the object and its children yourself.

#### Default Value

[DEFAULT\_MATRIX\_WORLD\_AUTO\_UPDATE](/api/classes/sprite2d/#default_matrix_world_auto_update) - that is `(true)`.

#### Inherited from

`Group.matrixWorldAutoUpdate`

***

### matrixWorldNeedsUpdate

> **matrixWorldNeedsUpdate**: `boolean`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/Object3D.d.ts:218

When this is set, it calculates the matrixWorld in that frame and resets this property to false.

#### Default Value

`false`

#### Inherited from

`Group.matrixWorldNeedsUpdate`

***

### modelViewMatrix

> `readonly` **modelViewMatrix**: [`Matrix4`](https://github.com/mrdoob/three.js/blob/dev/src/math/Matrix4.js)

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/Object3D.d.ts:180

#### Default Value

`new THREE.Matrix4()`

#### Inherited from

`Group.modelViewMatrix`

***

### name

> **name**: `string`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/Object3D.d.ts:122

Optional name of the object

#### Remarks

_(doesn't need to be unique)_.

#### Default Value

`""`

#### Inherited from

`Group.name`

***

### normalMatrix

> `readonly` **normalMatrix**: [`Matrix3`](https://github.com/mrdoob/three.js/blob/dev/src/math/Matrix3.js)

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/Object3D.d.ts:185

#### Default Value

`new THREE.Matrix3()`

#### Inherited from

`Group.normalMatrix`

***

### occlusionTest?

> `optional` **occlusionTest**: `boolean`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/renderers/common/Backend.d.ts:9

#### Inherited from

`Group.occlusionTest`

***

### parent

> **parent**: [`Object3D`](https://github.com/mrdoob/three.js/blob/dev/src/core/Object3D.js)\<[`Object3DEventMap`](https://github.com/mrdoob/three.js/tree/dev/src)\> \| `null`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/Object3D.d.ts:137

Object's parent in the [scene graph](https://en.wikipedia.org/wiki/Scene_graph).

#### Remarks

An object can have at most one parent.

#### Default Value

`null`

#### Inherited from

`Group.parent`

***

### position

> `readonly` **position**: [`Vector3`](https://github.com/mrdoob/three.js/blob/dev/src/math/Vector3.js)

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/Object3D.d.ts:157

Object's local position.

#### Default Value

`new THREE.Vector3()` - that is `(0, 0, 0)`.

#### Inherited from

`Group.position`

***

### quaternion

> `readonly` **quaternion**: [`Quaternion`](https://github.com/mrdoob/three.js/blob/dev/src/math/Quaternion.js)

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/Object3D.d.ts:169

Object's local rotation as a THREE.Quaternion \| Quaternion.

#### Default Value

`new THREE.Quaternion()` - that is `(0,  0, 0, 1)`.

#### Inherited from

`Group.quaternion`

***

### receiveShadow

> **receiveShadow**: `boolean`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/Object3D.d.ts:244

Whether the material receives shadows.

#### Default Value

`false`

#### Inherited from

`Group.receiveShadow`

***

### renderOrder

> **renderOrder**: `number`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/Object3D.d.ts:260

This value allows the default rendering order of [scene graph](https://en.wikipedia.org/wiki/Scene_graph)
objects to be overridden although opaque and transparent objects remain sorted independently.

#### Remarks

When this property is set for an instance of [Group](https://github.com/mrdoob/three.js/blob/dev/src/objects/Group.js), all descendants objects will be sorted and rendered together.
Sorting is from lowest to highest renderOrder.

#### Default Value

`0`

#### Inherited from

`Group.renderOrder`

***

### rotation

> `readonly` **rotation**: [`Euler`](https://github.com/mrdoob/three.js/blob/dev/src/math/Euler.js)

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/Object3D.d.ts:163

Object's local rotation ([Euler angles](https://en.wikipedia.org/wiki/Euler_angles)), in radians.

#### Default Value

`new THREE.Euler()` - that is `(0, 0, 0, Euler.DEFAULT_ORDER)`.

#### Inherited from

`Group.rotation`

***

### scale

> `readonly` **scale**: [`Vector3`](https://github.com/mrdoob/three.js/blob/dev/src/math/Vector3.js)

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/Object3D.d.ts:175

The object's local scale.

#### Default Value

`new THREE.Vector3( 1, 1, 1 )`

#### Inherited from

`Group.scale`

***

### static?

> `optional` **static**: `boolean`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/renderers/common/Backend.d.ts:11

#### Inherited from

`Group.static`

***

### type

> `readonly` **type**: `string`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/Object3D.d.ts:130

A Read-only _string_ to check `this` object type.

#### Remarks

This can be used to find a specific type of Object3D in a scene.
Sub-classes will update this value.

#### Default Value

`Object3D`

#### Inherited from

`Group.type`

***

### up

> **up**: [`Vector3`](https://github.com/mrdoob/three.js/blob/dev/src/math/Vector3.js)

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/Object3D.d.ts:151

This is used by the [lookAt](https://github.com/mrdoob/three.js/tree/dev/src) method, for example, to determine the orientation of the result.

#### Default Value

[Object3D.DEFAULT\_UP](/api/classes/sprite2d/#default_up) - that is `(0, 1, 0)`.

#### Inherited from

`Group.up`

***

### userData

> **userData**: `Record`\<`string`, `any`\>

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/Object3D.d.ts:273

An object that can be used to store custom data about the [Object3D](https://github.com/mrdoob/three.js/blob/dev/src/core/Object3D.js).

#### Remarks

It should not hold references to _functions_ as these **will not** be cloned.

#### Default

`{}`

#### Inherited from

`Group.userData`

***

### uuid

> **uuid**: `string`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/Object3D.d.ts:115

[UUID](http://en.wikipedia.org/wiki/Universally_unique_identifier) of this object instance.

#### Remarks

This gets automatically assigned and shouldn't be edited.

#### Inherited from

`Group.uuid`

***

### visible

> **visible**: `boolean`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/Object3D.d.ts:232

Object gets rendered if `true`.

#### Default Value

`true`

#### Inherited from

`Group.visible`

***

### DEFAULT\_MATRIX\_AUTO\_UPDATE

> `static` **DEFAULT\_MATRIX\_AUTO\_UPDATE**: `boolean`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/Object3D.d.ts:373

The default setting for [matrixAutoUpdate](/api/classes/tilemap2d/#matrixautoupdate) for newly created Object3Ds.

#### Default Value

`true`

#### Inherited from

`Group.DEFAULT_MATRIX_AUTO_UPDATE`

***

### DEFAULT\_MATRIX\_WORLD\_AUTO\_UPDATE

> `static` **DEFAULT\_MATRIX\_WORLD\_AUTO\_UPDATE**: `boolean`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/Object3D.d.ts:379

The default setting for [matrixWorldAutoUpdate](/api/classes/tilemap2d/#matrixworldautoupdate) for newly created Object3Ds.

#### Default Value

`true`

#### Inherited from

`Group.DEFAULT_MATRIX_WORLD_AUTO_UPDATE`

***

### DEFAULT\_UP

> `static` **DEFAULT\_UP**: [`Vector3`](https://github.com/mrdoob/three.js/blob/dev/src/math/Vector3.js)

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/Object3D.d.ts:367

The default [up](/api/classes/tilemap2d/#up) direction for objects, also used as the default position for THREE.DirectionalLight \| DirectionalLight,
THREE.HemisphereLight \| HemisphereLight and THREE.Spotlight \| Spotlight (which creates lights shining from the top down).

#### Default Value

`new THREE.Vector3( 0, 1, 0)`

#### Inherited from

`Group.DEFAULT_UP`

## Accessors

### bounds

#### Get Signature

> **get** **bounds**(): [`Box3`](https://github.com/mrdoob/three.js/blob/dev/src/math/Box3.js)

Defined in: [packages/core/src/tilemap/TileMap2D.ts:502](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/tilemap/TileMap2D.ts#L502)

Get map bounds.

##### Returns

[`Box3`](https://github.com/mrdoob/three.js/blob/dev/src/math/Box3.js)

***

### chunkSize

#### Get Signature

> **get** **chunkSize**(): `number`

Defined in: [packages/core/src/tilemap/TileMap2D.ts:129](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/tilemap/TileMap2D.ts#L129)

Get/set chunk size.

##### Returns

`number`

#### Set Signature

> **set** **chunkSize**(`value`): `void`

Defined in: [packages/core/src/tilemap/TileMap2D.ts:133](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/tilemap/TileMap2D.ts#L133)

##### Parameters

###### value

`number`

##### Returns

`void`

***

### data

#### Get Signature

> **get** **data**(): [`TileMapData`](/api/interfaces/tilemapdata/) \| `null`

Defined in: [packages/core/src/tilemap/TileMap2D.ts:106](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/tilemap/TileMap2D.ts#L106)

Get the tilemap data.

##### Returns

[`TileMapData`](/api/interfaces/tilemapdata/) \| `null`

#### Set Signature

> **set** **data**(`value`): `void`

Defined in: [packages/core/src/tilemap/TileMap2D.ts:113](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/tilemap/TileMap2D.ts#L113)

Set the tilemap data and rebuild the map.

##### Parameters

###### value

[`TileMapData`](/api/interfaces/tilemapdata/) | `null`

##### Returns

`void`

***

### enableCollision

#### Get Signature

> **get** **enableCollision**(): `boolean`

Defined in: [packages/core/src/tilemap/TileMap2D.ts:146](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/tilemap/TileMap2D.ts#L146)

Get/set collision extraction flag.

##### Returns

`boolean`

#### Set Signature

> **set** **enableCollision**(`value`): `void`

Defined in: [packages/core/src/tilemap/TileMap2D.ts:150](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/tilemap/TileMap2D.ts#L150)

##### Parameters

###### value

`boolean`

##### Returns

`void`

***

### heightInPixels

#### Get Signature

> **get** **heightInPixels**(): `number`

Defined in: [packages/core/src/tilemap/TileMap2D.ts:176](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/tilemap/TileMap2D.ts#L176)

##### Returns

`number`

***

### heightInTiles

#### Get Signature

> **get** **heightInTiles**(): `number`

Defined in: [packages/core/src/tilemap/TileMap2D.ts:164](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/tilemap/TileMap2D.ts#L164)

##### Returns

`number`

***

### layerCount

#### Get Signature

> **get** **layerCount**(): `number`

Defined in: [packages/core/src/tilemap/TileMap2D.ts:436](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/tilemap/TileMap2D.ts#L436)

Get layer count.

##### Returns

`number`

***

### tileHeight

#### Get Signature

> **get** **tileHeight**(): `number`

Defined in: [packages/core/src/tilemap/TileMap2D.ts:170](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/tilemap/TileMap2D.ts#L170)

##### Returns

`number`

***

### tileWidth

#### Get Signature

> **get** **tileWidth**(): `number`

Defined in: [packages/core/src/tilemap/TileMap2D.ts:167](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/tilemap/TileMap2D.ts#L167)

##### Returns

`number`

***

### totalChunkCount

#### Get Signature

> **get** **totalChunkCount**(): `number`

Defined in: [packages/core/src/tilemap/TileMap2D.ts:523](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/tilemap/TileMap2D.ts#L523)

Get total chunk count across all layers.

##### Returns

`number`

***

### totalTileCount

#### Get Signature

> **get** **totalTileCount**(): `number`

Defined in: [packages/core/src/tilemap/TileMap2D.ts:530](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/tilemap/TileMap2D.ts#L530)

Get total tile count across all layers.

##### Returns

`number`

***

### widthInPixels

#### Get Signature

> **get** **widthInPixels**(): `number`

Defined in: [packages/core/src/tilemap/TileMap2D.ts:173](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/tilemap/TileMap2D.ts#L173)

##### Returns

`number`

***

### widthInTiles

#### Get Signature

> **get** **widthInTiles**(): `number`

Defined in: [packages/core/src/tilemap/TileMap2D.ts:161](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/tilemap/TileMap2D.ts#L161)

##### Returns

`number`

## Methods

### add()

> **add**(...`object`): `this`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/Object3D.d.ts:515

Adds another [Object3D](https://github.com/mrdoob/three.js/blob/dev/src/core/Object3D.js) as child of this [Object3D](https://github.com/mrdoob/three.js/blob/dev/src/core/Object3D.js).

#### Parameters

##### object

...[`Object3D`](https://github.com/mrdoob/three.js/blob/dev/src/core/Object3D.js)\<[`Object3DEventMap`](https://github.com/mrdoob/three.js/tree/dev/src)\>[]

#### Returns

`this`

#### Remarks

An arbitrary number of objects may be added
Any current parent on an object passed in here will be removed, since an [Object3D](https://github.com/mrdoob/three.js/blob/dev/src/core/Object3D.js) can have at most one parent.

#### See

 - [attach](https://github.com/mrdoob/three.js/tree/dev/src)
 - THREE.Group \| Group for info on manually grouping objects.

#### Inherited from

`Group.add`

***

### addEventListener()

> **addEventListener**\<`T`\>(`type`, `listener`): `void`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/EventDispatcher.d.ts:52

Adds a listener to an event type.

#### Type Parameters

##### T

`T` *extends* keyof [`Object3DEventMap`](https://github.com/mrdoob/three.js/tree/dev/src)

#### Parameters

##### type

`T`

The type of event to listen to.

##### listener

[`EventListener`](https://github.com/mrdoob/three.js/tree/dev/src)\<[`Object3DEventMap`](https://github.com/mrdoob/three.js/tree/dev/src)\[`T`\], `T`, `TileMap2D`\>

The function that gets called when the event is fired.

#### Returns

`void`

#### Inherited from

`Group.addEventListener`

***

### applyMatrix4()

> **applyMatrix4**(`matrix`): `void`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/Object3D.d.ts:385

Applies the matrix transform to the object and updates the object's position, rotation and scale.

#### Parameters

##### matrix

[`Matrix4`](https://github.com/mrdoob/three.js/blob/dev/src/math/Matrix4.js)

#### Returns

`void`

#### Inherited from

`Group.applyMatrix4`

***

### applyQuaternion()

> **applyQuaternion**(`quaternion`): `this`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/Object3D.d.ts:391

Applies the rotation represented by the quaternion to the object.

#### Parameters

##### quaternion

[`Quaternion`](https://github.com/mrdoob/three.js/blob/dev/src/math/Quaternion.js)

#### Returns

`this`

#### Inherited from

`Group.applyQuaternion`

***

### attach()

> **attach**(`object`): `this`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/Object3D.d.ts:541

Adds a [Object3D](https://github.com/mrdoob/three.js/blob/dev/src/core/Object3D.js) as a child of this, while maintaining the object's world transform.

#### Parameters

##### object

[`Object3D`](https://github.com/mrdoob/three.js/blob/dev/src/core/Object3D.js)

#### Returns

`this`

#### Remarks

Note: This method does not support scene graphs having non-uniformly-scaled nodes(s).

#### See

[add](https://github.com/mrdoob/three.js/tree/dev/src)

#### Inherited from

`Group.attach`

***

### clear()

> **clear**(): `this`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/Object3D.d.ts:533

Removes all child objects.

#### Returns

`this`

#### Inherited from

`Group.clear`

***

### clone()

> **clone**(`recursive?`): `this`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/Object3D.d.ts:664

Returns a clone of `this` object and optionally all descendants.

#### Parameters

##### recursive?

`boolean`

If true, descendants of the object are also cloned. Default `true`

#### Returns

`this`

#### Inherited from

`Group.clone`

***

### copy()

> **copy**(`object`, `recursive?`): `this`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/Object3D.d.ts:673

Copies the given object into this object.

#### Parameters

##### object

[`Object3D`](https://github.com/mrdoob/three.js/blob/dev/src/core/Object3D.js)

##### recursive?

`boolean`

If set to `true`, descendants of the object are copied next to the existing ones. If set to
`false`, descendants are left unchanged. Default is `true`.

#### Returns

`this`

#### Remarks

Event listeners and user-defined callbacks (.onAfterRender and .onBeforeRender) are not copied.

#### Inherited from

`Group.copy`

***

### dispatchEvent()

> **dispatchEvent**\<`T`\>(`event`): `void`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/EventDispatcher.d.ts:81

Fire an event type.

#### Type Parameters

##### T

`T` *extends* keyof [`Object3DEventMap`](https://github.com/mrdoob/three.js/tree/dev/src)

#### Parameters

##### event

[`BaseEvent`](https://github.com/mrdoob/three.js/tree/dev/src)\<`T`\> & [`Object3DEventMap`](https://github.com/mrdoob/three.js/tree/dev/src)\[`T`\]

The event that gets fired.

#### Returns

`void`

#### Inherited from

`Group.dispatchEvent`

***

### dispose()

> **dispose**(): `void`

Defined in: [packages/core/src/tilemap/TileMap2D.ts:554](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/tilemap/TileMap2D.ts#L554)

Dispose of all resources.

#### Returns

`void`

***

### getCollisionShapes()

> **getCollisionShapes**(): readonly [`CollisionShape`](/api/type-aliases/collisionshape/)[]

Defined in: [packages/core/src/tilemap/TileMap2D.ts:495](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/tilemap/TileMap2D.ts#L495)

Get collision shapes.

#### Returns

readonly [`CollisionShape`](/api/type-aliases/collisionshape/)[]

***

### getLayer()

> **getLayer**(`name`): [`TileLayer`](/api/classes/tilelayer/) \| `undefined`

Defined in: [packages/core/src/tilemap/TileMap2D.ts:415](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/tilemap/TileMap2D.ts#L415)

Get tile layer by name.

#### Parameters

##### name

`string`

#### Returns

[`TileLayer`](/api/classes/tilelayer/) \| `undefined`

***

### getLayerAt()

> **getLayerAt**(`index`): [`TileLayer`](/api/classes/tilelayer/) \| `undefined`

Defined in: [packages/core/src/tilemap/TileMap2D.ts:422](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/tilemap/TileMap2D.ts#L422)

Get tile layer by index.

#### Parameters

##### index

`number`

#### Returns

[`TileLayer`](/api/classes/tilelayer/) \| `undefined`

***

### getLayers()

> **getLayers**(): readonly [`TileLayer`](/api/classes/tilelayer/)[]

Defined in: [packages/core/src/tilemap/TileMap2D.ts:429](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/tilemap/TileMap2D.ts#L429)

Get all tile layers.

#### Returns

readonly [`TileLayer`](/api/classes/tilelayer/)[]

***

### getObjectById()

> **getObjectById**(`id`): [`Object3D`](https://github.com/mrdoob/three.js/blob/dev/src/core/Object3D.js)\<[`Object3DEventMap`](https://github.com/mrdoob/three.js/tree/dev/src)\> \| `undefined`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/Object3D.d.ts:549

Searches through an object and its children, starting with the object itself, and returns the first with a matching id.

#### Parameters

##### id

`number`

Unique number of the object instance. Expects a `Integer`

#### Returns

[`Object3D`](https://github.com/mrdoob/three.js/blob/dev/src/core/Object3D.js)\<[`Object3DEventMap`](https://github.com/mrdoob/three.js/tree/dev/src)\> \| `undefined`

#### Remarks

Note that ids are assigned in chronological order: 1, 2, 3, ..., incrementing by one for each new object.

#### See

id

#### Inherited from

`Group.getObjectById`

***

### getObjectByName()

> **getObjectByName**(`name`): [`Object3D`](https://github.com/mrdoob/three.js/blob/dev/src/core/Object3D.js)\<[`Object3DEventMap`](https://github.com/mrdoob/three.js/tree/dev/src)\> \| `undefined`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/Object3D.d.ts:557

Searches through an object and its children, starting with the object itself, and returns the first with a matching name.

#### Parameters

##### name

`string`

String to match to the children's Object3D.name property.

#### Returns

[`Object3D`](https://github.com/mrdoob/three.js/blob/dev/src/core/Object3D.js)\<[`Object3DEventMap`](https://github.com/mrdoob/three.js/tree/dev/src)\> \| `undefined`

#### Remarks

Note that for most objects the name is an empty string by default
You will have to set it manually to make use of this method.

#### Inherited from

`Group.getObjectByName`

***

### getObjectByProperty()

> **getObjectByProperty**(`name`, `value`): [`Object3D`](https://github.com/mrdoob/three.js/blob/dev/src/core/Object3D.js)\<[`Object3DEventMap`](https://github.com/mrdoob/three.js/tree/dev/src)\> \| `undefined`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/Object3D.d.ts:566

Searches through an object and its children, starting with the object itself,
and returns the first with a property that matches the value given.

#### Parameters

##### name

`string`

the property name to search for.

##### value

`any`

value of the given property.

#### Returns

[`Object3D`](https://github.com/mrdoob/three.js/blob/dev/src/core/Object3D.js)\<[`Object3DEventMap`](https://github.com/mrdoob/three.js/tree/dev/src)\> \| `undefined`

#### Inherited from

`Group.getObjectByProperty`

***

### getObjectLayer()

> **getObjectLayer**(`name`): [`ObjectLayerData`](/api/interfaces/objectlayerdata/) \| `undefined`

Defined in: [packages/core/src/tilemap/TileMap2D.ts:443](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/tilemap/TileMap2D.ts#L443)

Get object layer by name.

#### Parameters

##### name

`string`

#### Returns

[`ObjectLayerData`](/api/interfaces/objectlayerdata/) \| `undefined`

***

### getObjectsByProperty()

> **getObjectsByProperty**(`name`, `value`, `optionalTarget?`): [`Object3D`](https://github.com/mrdoob/three.js/blob/dev/src/core/Object3D.js)\<[`Object3DEventMap`](https://github.com/mrdoob/three.js/tree/dev/src)\>[]

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/Object3D.d.ts:576

Searches through an object and its children, starting with the object itself,
and returns the first with a property that matches the value given.

#### Parameters

##### name

`string`

The property name to search for.

##### value

`any`

Value of the given property.

##### optionalTarget?

[`Object3D`](https://github.com/mrdoob/three.js/blob/dev/src/core/Object3D.js)\<[`Object3DEventMap`](https://github.com/mrdoob/three.js/tree/dev/src)\>[]

target to set the result. Otherwise a new Array is instantiated. If set, you must clear
this array prior to each call (i.e., array.length = 0;).

#### Returns

[`Object3D`](https://github.com/mrdoob/three.js/blob/dev/src/core/Object3D.js)\<[`Object3DEventMap`](https://github.com/mrdoob/three.js/tree/dev/src)\>[]

#### Inherited from

`Group.getObjectsByProperty`

***

### getObjectsByType()

> **getObjectsByType**(`type`): [`TileMapObject`](/api/interfaces/tilemapobject/)[]

Defined in: [packages/core/src/tilemap/TileMap2D.ts:450](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/tilemap/TileMap2D.ts#L450)

Get all objects of a specific type.

#### Parameters

##### type

`string`

#### Returns

[`TileMapObject`](/api/interfaces/tilemapobject/)[]

***

### getProperty()

> **getProperty**\<`T`\>(`name`): `T` \| `undefined`

Defined in: [packages/core/src/tilemap/TileMap2D.ts:516](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/tilemap/TileMap2D.ts#L516)

Get custom property from map data.

#### Type Parameters

##### T

`T`

#### Parameters

##### name

`string`

#### Returns

`T` \| `undefined`

***

### getTileAtWorld()

> **getTileAtWorld**(`worldX`, `worldY`, `layerIndex`): `number`

Defined in: [packages/core/src/tilemap/TileMap2D.ts:465](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/tilemap/TileMap2D.ts#L465)

Get tile GID at world position.

#### Parameters

##### worldX

`number`

##### worldY

`number`

##### layerIndex

`number` = `0`

#### Returns

`number`

***

### getTileset()

> **getTileset**(`name`): [`Tileset`](/api/classes/tileset/) \| `undefined`

Defined in: [packages/core/src/tilemap/TileMap2D.ts:509](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/tilemap/TileMap2D.ts#L509)

Get tileset by name.

#### Parameters

##### name

`string`

#### Returns

[`Tileset`](/api/classes/tileset/) \| `undefined`

***

### getWorldDirection()

> **getWorldDirection**(`target`): [`Vector3`](https://github.com/mrdoob/three.js/blob/dev/src/math/Vector3.js)

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/Object3D.d.ts:600

Returns a vector representing the direction of object's positive z-axis in world space.

#### Parameters

##### target

[`Vector3`](https://github.com/mrdoob/three.js/blob/dev/src/math/Vector3.js)

The result will be copied into this Vector3.

#### Returns

[`Vector3`](https://github.com/mrdoob/three.js/blob/dev/src/math/Vector3.js)

#### Inherited from

`Group.getWorldDirection`

***

### getWorldPosition()

> **getWorldPosition**(`target`): [`Vector3`](https://github.com/mrdoob/three.js/blob/dev/src/math/Vector3.js)

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/Object3D.d.ts:582

Returns a vector representing the position of the object in world space.

#### Parameters

##### target

[`Vector3`](https://github.com/mrdoob/three.js/blob/dev/src/math/Vector3.js)

The result will be copied into this Vector3.

#### Returns

[`Vector3`](https://github.com/mrdoob/three.js/blob/dev/src/math/Vector3.js)

#### Inherited from

`Group.getWorldPosition`

***

### getWorldQuaternion()

> **getWorldQuaternion**(`target`): [`Quaternion`](https://github.com/mrdoob/three.js/blob/dev/src/math/Quaternion.js)

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/Object3D.d.ts:588

Returns a quaternion representing the rotation of the object in world space.

#### Parameters

##### target

[`Quaternion`](https://github.com/mrdoob/three.js/blob/dev/src/math/Quaternion.js)

The result will be copied into this Quaternion.

#### Returns

[`Quaternion`](https://github.com/mrdoob/three.js/blob/dev/src/math/Quaternion.js)

#### Inherited from

`Group.getWorldQuaternion`

***

### getWorldScale()

> **getWorldScale**(`target`): [`Vector3`](https://github.com/mrdoob/three.js/blob/dev/src/math/Vector3.js)

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/Object3D.d.ts:594

Returns a vector of the scaling factors applied to the object for each axis in world space.

#### Parameters

##### target

[`Vector3`](https://github.com/mrdoob/three.js/blob/dev/src/math/Vector3.js)

The result will be copied into this Vector3.

#### Returns

[`Vector3`](https://github.com/mrdoob/three.js/blob/dev/src/math/Vector3.js)

#### Inherited from

`Group.getWorldScale`

***

### hasEventListener()

> **hasEventListener**\<`T`\>(`type`, `listener`): `boolean`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/EventDispatcher.d.ts:62

Checks if listener is added to an event type.

#### Type Parameters

##### T

`T` *extends* keyof [`Object3DEventMap`](https://github.com/mrdoob/three.js/tree/dev/src)

#### Parameters

##### type

`T`

The type of event to listen to.

##### listener

[`EventListener`](https://github.com/mrdoob/three.js/tree/dev/src)\<[`Object3DEventMap`](https://github.com/mrdoob/three.js/tree/dev/src)\[`T`\], `T`, `TileMap2D`\>

The function that gets called when the event is fired.

#### Returns

`boolean`

#### Inherited from

`Group.hasEventListener`

***

### localToWorld()

> **localToWorld**(`vector`): [`Vector3`](https://github.com/mrdoob/three.js/blob/dev/src/math/Vector3.js)

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/Object3D.d.ts:484

Converts the vector from this object's local space to world space.

#### Parameters

##### vector

[`Vector3`](https://github.com/mrdoob/three.js/blob/dev/src/math/Vector3.js)

A vector representing a position in this object's local space.

#### Returns

[`Vector3`](https://github.com/mrdoob/three.js/blob/dev/src/math/Vector3.js)

#### Inherited from

`Group.localToWorld`

***

### lookAt()

#### Call Signature

> **lookAt**(`vector`): `void`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/Object3D.d.ts:497

Rotates the object to face a point in world space.

##### Parameters

###### vector

[`Vector3`](https://github.com/mrdoob/three.js/blob/dev/src/math/Vector3.js)

A vector representing a position in world space to look at.

##### Returns

`void`

##### Remarks

This method does not support objects having non-uniformly-scaled parent(s).

##### Inherited from

`Group.lookAt`

#### Call Signature

> **lookAt**(`x`, `y`, `z`): `void`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/Object3D.d.ts:505

Rotates the object to face a point in world space.

##### Parameters

###### x

`number`

Expects a `Float`

###### y

`number`

Expects a `Float`

###### z

`number`

Expects a `Float`

##### Returns

`void`

##### Remarks

This method does not support objects having non-uniformly-scaled parent(s).

##### Inherited from

`Group.lookAt`

***

### onAfterRender()

> **onAfterRender**(`renderer`, `scene`, `camera`, `geometry`, `material`, `group`): `void`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/Object3D.d.ts:353

An optional callback that is executed immediately after a 3D object is rendered.

#### Parameters

##### renderer

[`WebGLRenderer`](https://github.com/mrdoob/three.js/blob/dev/src/renderers/WebGLRenderer.js)

##### scene

[`Scene`](https://github.com/mrdoob/three.js/blob/dev/src/scenes/Scene.js)

##### camera

[`Camera`](https://github.com/mrdoob/three.js/blob/dev/src/cameras/Camera.js)

##### geometry

[`BufferGeometry`](https://github.com/mrdoob/three.js/blob/dev/src/core/BufferGeometry.js)

##### material

[`Material`](https://github.com/mrdoob/three.js/blob/dev/src/materials/Material.js)

##### group

[`Group`](https://github.com/mrdoob/three.js/blob/dev/src/objects/Group.js)

#### Returns

`void`

#### Remarks

This function is called with the following parameters: renderer, scene, camera, geometry, material, group.
Please notice that this callback is only executed for `renderable` 3D objects. Meaning 3D objects which
define their visual appearance with geometries and materials like instances of Mesh, Line,
Points or Sprite. Instances of [Object3D](https://github.com/mrdoob/three.js/blob/dev/src/core/Object3D.js), [Group](https://github.com/mrdoob/three.js/blob/dev/src/objects/Group.js) or Bone are not renderable
and thus this callback is not executed for such objects.

#### Inherited from

`Group.onAfterRender`

***

### onAfterShadow()

> **onAfterShadow**(`renderer`, `scene`, `camera`, `shadowCamera`, `geometry`, `depthMaterial`, `group`): `void`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/Object3D.d.ts:318

An optional callback that is executed immediately after a 3D object is rendered to a shadow map.

#### Parameters

##### renderer

[`WebGLRenderer`](https://github.com/mrdoob/three.js/blob/dev/src/renderers/WebGLRenderer.js)

##### scene

[`Scene`](https://github.com/mrdoob/three.js/blob/dev/src/scenes/Scene.js)

##### camera

[`Camera`](https://github.com/mrdoob/three.js/blob/dev/src/cameras/Camera.js)

##### shadowCamera

[`Camera`](https://github.com/mrdoob/three.js/blob/dev/src/cameras/Camera.js)

##### geometry

[`BufferGeometry`](https://github.com/mrdoob/three.js/blob/dev/src/core/BufferGeometry.js)

##### depthMaterial

[`Material`](https://github.com/mrdoob/three.js/blob/dev/src/materials/Material.js)

##### group

[`Group`](https://github.com/mrdoob/three.js/blob/dev/src/objects/Group.js)

#### Returns

`void`

#### Remarks

This function is called with the following parameters: renderer, scene, camera, shadowCamera, geometry,
depthMaterial, group.
Please notice that this callback is only executed for `renderable` 3D objects. Meaning 3D objects which
define their visual appearance with geometries and materials like instances of Mesh, Line,
Points or Sprite. Instances of [Object3D](https://github.com/mrdoob/three.js/blob/dev/src/core/Object3D.js), [Group](https://github.com/mrdoob/three.js/blob/dev/src/objects/Group.js) or Bone are not renderable
and thus this callback is not executed for such objects.

#### Inherited from

`Group.onAfterShadow`

***

### onBeforeRender()

> **onBeforeRender**(`renderer`, `scene`, `camera`, `geometry`, `material`, `group`): `void`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/Object3D.d.ts:336

An optional callback that is executed immediately before a 3D object is rendered.

#### Parameters

##### renderer

[`WebGLRenderer`](https://github.com/mrdoob/three.js/blob/dev/src/renderers/WebGLRenderer.js)

##### scene

[`Scene`](https://github.com/mrdoob/three.js/blob/dev/src/scenes/Scene.js)

##### camera

[`Camera`](https://github.com/mrdoob/three.js/blob/dev/src/cameras/Camera.js)

##### geometry

[`BufferGeometry`](https://github.com/mrdoob/three.js/blob/dev/src/core/BufferGeometry.js)

##### material

[`Material`](https://github.com/mrdoob/three.js/blob/dev/src/materials/Material.js)

##### group

[`Group`](https://github.com/mrdoob/three.js/blob/dev/src/objects/Group.js)

#### Returns

`void`

#### Remarks

This function is called with the following parameters: renderer, scene, camera, geometry, material, group.
Please notice that this callback is only executed for `renderable` 3D objects. Meaning 3D objects which
define their visual appearance with geometries and materials like instances of Mesh, Line,
Points or Sprite. Instances of [Object3D](https://github.com/mrdoob/three.js/blob/dev/src/core/Object3D.js), [Group](https://github.com/mrdoob/three.js/blob/dev/src/objects/Group.js) or Bone are not renderable
and thus this callback is not executed for such objects.

#### Inherited from

`Group.onBeforeRender`

***

### onBeforeShadow()

> **onBeforeShadow**(`renderer`, `scene`, `camera`, `shadowCamera`, `geometry`, `depthMaterial`, `group`): `void`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/Object3D.d.ts:299

An optional callback that is executed immediately before a 3D object is rendered to a shadow map.

#### Parameters

##### renderer

[`WebGLRenderer`](https://github.com/mrdoob/three.js/blob/dev/src/renderers/WebGLRenderer.js)

##### scene

[`Scene`](https://github.com/mrdoob/three.js/blob/dev/src/scenes/Scene.js)

##### camera

[`Camera`](https://github.com/mrdoob/three.js/blob/dev/src/cameras/Camera.js)

##### shadowCamera

[`Camera`](https://github.com/mrdoob/three.js/blob/dev/src/cameras/Camera.js)

##### geometry

[`BufferGeometry`](https://github.com/mrdoob/three.js/blob/dev/src/core/BufferGeometry.js)

##### depthMaterial

[`Material`](https://github.com/mrdoob/three.js/blob/dev/src/materials/Material.js)

##### group

[`Group`](https://github.com/mrdoob/three.js/blob/dev/src/objects/Group.js)

#### Returns

`void`

#### Remarks

This function is called with the following parameters: renderer, scene, camera, shadowCamera, geometry,
depthMaterial, group.
Please notice that this callback is only executed for `renderable` 3D objects. Meaning 3D objects which
define their visual appearance with geometries and materials like instances of Mesh, Line,
Points or Sprite. Instances of [Object3D](https://github.com/mrdoob/three.js/blob/dev/src/core/Object3D.js), [Group](https://github.com/mrdoob/three.js/blob/dev/src/objects/Group.js) or Bone are not renderable
and thus this callback is not executed for such objects.

#### Inherited from

`Group.onBeforeShadow`

***

### raycast()

> **raycast**(`raycaster`, `intersects`): `void`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/Object3D.d.ts:610

Abstract (empty) method to get intersections between a casted ray and this object

#### Parameters

##### raycaster

[`Raycaster`](https://github.com/mrdoob/three.js/blob/dev/src/core/Raycaster.js)

##### intersects

[`Intersection`](https://github.com/mrdoob/three.js/tree/dev/src)\<[`Object3D`](https://github.com/mrdoob/three.js/blob/dev/src/core/Object3D.js)\<[`Object3DEventMap`](https://github.com/mrdoob/three.js/tree/dev/src)\>\>[]

#### Returns

`void`

#### Remarks

Subclasses such as THREE.Mesh \| Mesh, THREE.Line \| Line, and THREE.Points \| Points implement this method in order to use raycasting.

#### See

THREE.Raycaster \| Raycaster

#### Default Value

`() => {}`

#### Inherited from

`Group.raycast`

***

### remove()

> **remove**(...`object`): `this`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/Object3D.d.ts:523

Removes a [Object3D](https://github.com/mrdoob/three.js/blob/dev/src/core/Object3D.js) as child of this [Object3D](https://github.com/mrdoob/three.js/blob/dev/src/core/Object3D.js).

#### Parameters

##### object

...[`Object3D`](https://github.com/mrdoob/three.js/blob/dev/src/core/Object3D.js)\<[`Object3DEventMap`](https://github.com/mrdoob/three.js/tree/dev/src)\>[]

#### Returns

`this`

#### Remarks

An arbitrary number of objects may be removed.

#### See

THREE.Group \| Group for info on manually grouping objects.

#### Inherited from

`Group.remove`

***

### removeEventListener()

> **removeEventListener**\<`T`\>(`type`, `listener`): `void`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/EventDispatcher.d.ts:72

Removes a listener from an event type.

#### Type Parameters

##### T

`T` *extends* keyof [`Object3DEventMap`](https://github.com/mrdoob/three.js/tree/dev/src)

#### Parameters

##### type

`T`

The type of the listener that gets removed.

##### listener

[`EventListener`](https://github.com/mrdoob/three.js/tree/dev/src)\<[`Object3DEventMap`](https://github.com/mrdoob/three.js/tree/dev/src)\[`T`\], `T`, `TileMap2D`\>

The listener function that gets removed.

#### Returns

`void`

#### Inherited from

`Group.removeEventListener`

***

### removeFromParent()

> **removeFromParent**(): `this`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/Object3D.d.ts:528

Removes this object from its current parent.

#### Returns

`this`

#### Inherited from

`Group.removeFromParent`

***

### rotateOnAxis()

> **rotateOnAxis**(`axis`, `angle`): `this`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/Object3D.d.ts:425

Rotate an object along an axis in object space.

#### Parameters

##### axis

[`Vector3`](https://github.com/mrdoob/three.js/blob/dev/src/math/Vector3.js)

A normalized vector in object space.

##### angle

`number`

The angle in radians. Expects a `Float`

#### Returns

`this`

#### Remarks

The axis is assumed to be normalized.

#### Inherited from

`Group.rotateOnAxis`

***

### rotateOnWorldAxis()

> **rotateOnWorldAxis**(`axis`, `angle`): `this`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/Object3D.d.ts:434

Rotate an object along an axis in world space.

#### Parameters

##### axis

[`Vector3`](https://github.com/mrdoob/three.js/blob/dev/src/math/Vector3.js)

A normalized vector in world space.

##### angle

`number`

The angle in radians. Expects a `Float`

#### Returns

`this`

#### Remarks

The axis is assumed to be normalized
Method Assumes no rotated parent.

#### Inherited from

`Group.rotateOnWorldAxis`

***

### rotateX()

> **rotateX**(`angle`): `this`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/Object3D.d.ts:440

Rotates the object around _x_ axis in local space.

#### Parameters

##### angle

`number`

#### Returns

`this`

#### Inherited from

`Group.rotateX`

***

### rotateY()

> **rotateY**(`angle`): `this`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/Object3D.d.ts:446

Rotates the object around _y_ axis in local space.

#### Parameters

##### angle

`number`

#### Returns

`this`

#### Inherited from

`Group.rotateY`

***

### rotateZ()

> **rotateZ**(`angle`): `this`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/Object3D.d.ts:452

Rotates the object around _z_ axis in local space.

#### Parameters

##### angle

`number`

#### Returns

`this`

#### Inherited from

`Group.rotateZ`

***

### setRotationFromAxisAngle()

> **setRotationFromAxisAngle**(`axis`, `angle`): `void`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/Object3D.d.ts:398

Calls THREE.Quaternion.setFromAxisAngle \| setFromAxisAngle(axis, angle) on the [.quaternion](/api/classes/tilemap2d/#quaternion).

#### Parameters

##### axis

[`Vector3`](https://github.com/mrdoob/three.js/blob/dev/src/math/Vector3.js)

A normalized vector in object space.

##### angle

`number`

Angle in radians. Expects a `Float`

#### Returns

`void`

#### Inherited from

`Group.setRotationFromAxisAngle`

***

### setRotationFromEuler()

> **setRotationFromEuler**(`euler`): `void`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/Object3D.d.ts:404

Calls THREE.Quaternion.setFromEuler \| setFromEuler(euler) on the [.quaternion](/api/classes/tilemap2d/#quaternion).

#### Parameters

##### euler

[`Euler`](https://github.com/mrdoob/three.js/blob/dev/src/math/Euler.js)

Euler angle specifying rotation amount.

#### Returns

`void`

#### Inherited from

`Group.setRotationFromEuler`

***

### setRotationFromMatrix()

> **setRotationFromMatrix**(`m`): `void`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/Object3D.d.ts:411

Calls THREE.Quaternion.setFromRotationMatrix \| setFromRotationMatrix(m) on the [.quaternion](/api/classes/tilemap2d/#quaternion).

#### Parameters

##### m

[`Matrix4`](https://github.com/mrdoob/three.js/blob/dev/src/math/Matrix4.js)

Rotate the quaternion by the rotation component of the matrix.

#### Returns

`void`

#### Remarks

Note that this assumes that the upper 3x3 of m is a pure rotation matrix (i.e, unscaled).

#### Inherited from

`Group.setRotationFromMatrix`

***

### setRotationFromQuaternion()

> **setRotationFromQuaternion**(`q`): `void`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/Object3D.d.ts:417

Copy the given THREE.Quaternion \| Quaternion into [.quaternion](/api/classes/tilemap2d/#quaternion).

#### Parameters

##### q

[`Quaternion`](https://github.com/mrdoob/three.js/blob/dev/src/math/Quaternion.js)

Normalized Quaternion.

#### Returns

`void`

#### Inherited from

`Group.setRotationFromQuaternion`

***

### tileToWorld()

> **tileToWorld**(`tileX`, `tileY`): `object`

Defined in: [packages/core/src/tilemap/TileMap2D.ts:485](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/tilemap/TileMap2D.ts#L485)

Convert tile coordinates to world position (center of tile).

#### Parameters

##### tileX

`number`

##### tileY

`number`

#### Returns

`object`

##### x

> **x**: `number`

##### y

> **y**: `number`

***

### toJSON()

> **toJSON**(`meta?`): [`Object3DJSON`](https://github.com/mrdoob/three.js/tree/dev/src)

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/Object3D.d.ts:658

Convert the object to three.js [JSON Object/Scene format](https://github.com/mrdoob/three.js/wiki/JSON-Object-Scene-format-4).

#### Parameters

##### meta?

[`JSONMeta`](https://github.com/mrdoob/three.js/tree/dev/src)

Object containing metadata such as materials, textures or images for the object.

#### Returns

[`Object3DJSON`](https://github.com/mrdoob/three.js/tree/dev/src)

#### Inherited from

`Group.toJSON`

***

### translateOnAxis()

> **translateOnAxis**(`axis`, `distance`): `this`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/Object3D.d.ts:460

Translate an object by distance along an axis in object space

#### Parameters

##### axis

[`Vector3`](https://github.com/mrdoob/three.js/blob/dev/src/math/Vector3.js)

A normalized vector in object space.

##### distance

`number`

The distance to translate. Expects a `Float`

#### Returns

`this`

#### Remarks

The axis is assumed to be normalized.

#### Inherited from

`Group.translateOnAxis`

***

### translateX()

> **translateX**(`distance`): `this`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/Object3D.d.ts:466

Translates object along x axis in object space by distance units.

#### Parameters

##### distance

`number`

Expects a `Float`

#### Returns

`this`

#### Inherited from

`Group.translateX`

***

### translateY()

> **translateY**(`distance`): `this`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/Object3D.d.ts:472

Translates object along _y_ axis in object space by distance units.

#### Parameters

##### distance

`number`

Expects a `Float`

#### Returns

`this`

#### Inherited from

`Group.translateY`

***

### translateZ()

> **translateZ**(`distance`): `this`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/Object3D.d.ts:478

Translates object along _z_ axis in object space by distance units.

#### Parameters

##### distance

`number`

Expects a `Float`

#### Returns

`this`

#### Inherited from

`Group.translateZ`

***

### traverse()

> **traverse**(`callback`): `void`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/Object3D.d.ts:617

Executes the callback on this object and all descendants.

#### Parameters

##### callback

(`object`) => `any`

A function with as first argument an [Object3D](https://github.com/mrdoob/three.js/blob/dev/src/core/Object3D.js) object.

#### Returns

`void`

#### Remarks

Note: Modifying the scene graph inside the callback is discouraged.

#### Inherited from

`Group.traverse`

***

### traverseAncestors()

> **traverseAncestors**(`callback`): `void`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/Object3D.d.ts:632

Executes the callback on all ancestors.

#### Parameters

##### callback

(`object`) => `any`

A function with as first argument an [Object3D](https://github.com/mrdoob/three.js/blob/dev/src/core/Object3D.js) object.

#### Returns

`void`

#### Remarks

Note: Modifying the scene graph inside the callback is discouraged.

#### Inherited from

`Group.traverseAncestors`

***

### traverseVisible()

> **traverseVisible**(`callback`): `void`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/Object3D.d.ts:625

Like traverse, but the callback will only be executed for visible objects

#### Parameters

##### callback

(`object`) => `any`

A function with as first argument an [Object3D](https://github.com/mrdoob/three.js/blob/dev/src/core/Object3D.js) object.

#### Returns

`void`

#### Remarks

Descendants of invisible objects are not traversed.
Note: Modifying the scene graph inside the callback is discouraged.

#### Inherited from

`Group.traverseVisible`

***

### update()

> **update**(`deltaMs`): `void`

Defined in: [packages/core/src/tilemap/TileMap2D.ts:406](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/tilemap/TileMap2D.ts#L406)

Update animated tiles.
Call this in your animation loop with delta time in milliseconds.

#### Parameters

##### deltaMs

`number`

#### Returns

`void`

***

### updateMatrix()

> **updateMatrix**(): `void`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/Object3D.d.ts:637

Updates local transform.

#### Returns

`void`

#### Inherited from

`Group.updateMatrix`

***

### updateMatrixWorld()

> **updateMatrixWorld**(`force?`): `void`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/Object3D.d.ts:645

Updates the global transform of the object.
And will update the object descendants if [.matrixWorldNeedsUpdate](/api/classes/tilemap2d/#matrixworldneedsupdate) is set to true or if the force parameter is set to `true`.

#### Parameters

##### force?

`boolean`

A boolean that can be used to bypass [.matrixWorldAutoUpdate](/api/classes/tilemap2d/#matrixworldautoupdate), to recalculate the world matrix of the object and descendants on the current frame.
Useful if you cannot wait for the renderer to update it on the next frame, assuming [.matrixWorldAutoUpdate](/api/classes/tilemap2d/#matrixworldautoupdate) set to `true`.

#### Returns

`void`

#### Inherited from

`Group.updateMatrixWorld`

***

### updateWorldMatrix()

> **updateWorldMatrix**(`updateParents`, `updateChildren`): `void`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/Object3D.d.ts:652

Updates the global transform of the object.

#### Parameters

##### updateParents

`boolean`

Recursively updates global transform of ancestors.

##### updateChildren

`boolean`

Recursively updates global transform of descendants.

#### Returns

`void`

#### Inherited from

`Group.updateWorldMatrix`

***

### worldToLocal()

> **worldToLocal**(`vector`): [`Vector3`](https://github.com/mrdoob/three.js/blob/dev/src/math/Vector3.js)

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/Object3D.d.ts:490

Converts the vector from world space to this object's local space.

#### Parameters

##### vector

[`Vector3`](https://github.com/mrdoob/three.js/blob/dev/src/math/Vector3.js)

A vector representing a position in world space.

#### Returns

[`Vector3`](https://github.com/mrdoob/three.js/blob/dev/src/math/Vector3.js)

#### Inherited from

`Group.worldToLocal`

***

### worldToTile()

> **worldToTile**(`worldX`, `worldY`): `object`

Defined in: [packages/core/src/tilemap/TileMap2D.ts:475](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/tilemap/TileMap2D.ts#L475)

Convert world position to tile coordinates (in Tiled's Y-down system).

#### Parameters

##### worldX

`number`

##### worldY

`number`

#### Returns

`object`

##### x

> **x**: `number`

##### y

> **y**: `number`
