---
editUrl: false
next: false
prev: false
title: "AnimatedSprite2D"
---

Defined in: [packages/core/src/sprites/AnimatedSprite2D.ts:62](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/sprites/AnimatedSprite2D.ts#L62)

A 2D sprite with animation support.

## Example

```typescript
const player = new AnimatedSprite2D({
  spriteSheet: sheet,
  animationSet: {
    animations: {
      idle: { frames: ['player_idle_0', 'player_idle_1'], fps: 8 },
      walk: { frames: ['player_walk_0', 'player_walk_1', 'player_walk_2'], fps: 12 },
    }
  },
  animation: 'idle',
});

// In update loop
player.update(deltaMs);

// Change animation
player.play('walk');
```

## Extends

- [`Sprite2D`](/api/classes/sprite2d/)

## Constructors

### Constructor

> **new AnimatedSprite2D**(`options?`): `AnimatedSprite2D`

Defined in: [packages/core/src/sprites/AnimatedSprite2D.ts:73](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/sprites/AnimatedSprite2D.ts#L73)

Create a new AnimatedSprite2D.
Can be called with no arguments for R3F compatibility - set spriteSheet via property.

#### Parameters

##### options?

[`AnimatedSprite2DOptions`](/api/interfaces/animatedsprite2doptions/)

#### Returns

`AnimatedSprite2D`

#### Overrides

[`Sprite2D`](/api/classes/sprite2d/).[`constructor`](/api/classes/sprite2d/#constructor)

## Properties

### animations

> **animations**: [`AnimationClip`](https://github.com/mrdoob/three.js/tree/dev/src)[]

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/Object3D.d.ts:266

Array with object's animation clips.

#### Default Value

`[]`

#### Inherited from

[`TileMap2D`](/api/classes/tilemap2d/).[`animations`](/api/classes/tilemap2d/#animations)

***

### castShadow

> **castShadow**: `boolean`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/Object3D.d.ts:238

Whether the object gets rendered into shadow map.

#### Default Value

`false`

#### Inherited from

[`TileMap2D`](/api/classes/tilemap2d/).[`castShadow`](/api/classes/tilemap2d/#castshadow)

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

[`TileMap2D`](/api/classes/tilemap2d/).[`children`](/api/classes/tilemap2d/#children)

***

### controller

> `readonly` **controller**: [`AnimationController`](/api/classes/animationcontroller/)

Defined in: [packages/core/src/sprites/AnimatedSprite2D.ts:64](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/sprites/AnimatedSprite2D.ts#L64)

Animation controller

***

### count

> **count**: `number`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/objects/Mesh.d.ts:85

The number of instances of this mesh.
Can only be used with WebGPURenderer.

#### Default

```ts
1
```

#### Inherited from

[`Sprite2D`](/api/classes/sprite2d/).[`count`](/api/classes/sprite2d/#count)

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

[`TileMap2D`](/api/classes/tilemap2d/).[`customDepthMaterial`](/api/classes/tilemap2d/#customdepthmaterial)

***

### customDistanceMaterial?

> `optional` **customDistanceMaterial**: [`Material`](https://github.com/mrdoob/three.js/blob/dev/src/materials/Material.js)

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/Object3D.d.ts:288

Same as [customDepthMaterial](/api/classes/tilemap2d/#customdepthmaterial), but used with THREE.Object3DPointLight \| PointLight.

#### Default Value

`undefined`

#### Inherited from

[`TileMap2D`](/api/classes/tilemap2d/).[`customDistanceMaterial`](/api/classes/tilemap2d/#customdistancematerial)

***

### frustumCulled

> **frustumCulled**: `boolean`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/Object3D.d.ts:251

When this is set, it checks every frame if the object is in the frustum of the camera before rendering the object.
If set to `false` the object gets rendered every frame even if it is not in the frustum of the camera.

#### Default Value

`true`

#### Inherited from

[`Sprite2D`](/api/classes/sprite2d/).[`frustumCulled`](/api/classes/sprite2d/#frustumculled)

***

### geometry

> **geometry**: [`PlaneGeometry`](https://github.com/mrdoob/three.js/blob/dev/src/geometries/PlaneGeometry.js)

Defined in: [packages/core/src/sprites/Sprite2D.ts:33](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/sprites/Sprite2D.ts#L33)

An instance of THREE.BufferGeometry \| BufferGeometry (or derived classes), defining the object's structure.

#### Default Value

THREE.BufferGeometry \| \`new THREE.BufferGeometry()\`.

#### Inherited from

[`Sprite2D`](/api/classes/sprite2d/).[`geometry`](/api/classes/sprite2d/#geometry)

***

### id

> `readonly` **id**: `number`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/Object3D.d.ts:109

Unique number for this [Object3D](https://github.com/mrdoob/three.js/blob/dev/src/core/Object3D.js) instance.

#### Remarks

Note that ids are assigned in chronological order: 1, 2, 3, ..., incrementing by one for each new object.
Expects a `Integer`

#### Inherited from

[`TileMap2D`](/api/classes/tilemap2d/).[`id`](/api/classes/tilemap2d/#id)

***

### isMesh

> `readonly` **isMesh**: `true`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/objects/Mesh.d.ts:47

Read-only flag to check if a given object is of type [Mesh](https://github.com/mrdoob/three.js/blob/dev/src/objects/Mesh.js).

#### Remarks

This is a _constant_ value

#### Default Value

`true`

#### Inherited from

[`Sprite2D`](/api/classes/sprite2d/).[`isMesh`](/api/classes/sprite2d/#ismesh)

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

[`TileMap2D`](/api/classes/tilemap2d/).[`isObject3D`](/api/classes/tilemap2d/#isobject3d)

***

### layer

> **layer**: `number` = `0`

Defined in: [packages/core/src/sprites/Sprite2D.ts:36](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/sprites/Sprite2D.ts#L36)

Render layer (primary sort key for Renderer2D)

#### Inherited from

[`Sprite2D`](/api/classes/sprite2d/).[`layer`](/api/classes/sprite2d/#layer)

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

[`TileMap2D`](/api/classes/tilemap2d/).[`layers`](/api/classes/tilemap2d/#layers)

***

### material

> **material**: [`Sprite2DMaterial`](/api/classes/sprite2dmaterial/)

Defined in: [packages/core/src/sprites/Sprite2D.ts:34](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/sprites/Sprite2D.ts#L34)

An instance of material derived from the THREE.Material \| Material base class or an array of materials, defining the object's appearance.

#### Default Value

THREE.MeshBasicMaterial \| \`new THREE.MeshBasicMaterial()\`.

#### Inherited from

[`Sprite2D`](/api/classes/sprite2d/).[`material`](/api/classes/sprite2d/#material)

***

### matrix

> **matrix**: [`Matrix4`](https://github.com/mrdoob/three.js/blob/dev/src/math/Matrix4.js)

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/Object3D.d.ts:191

The local transform matrix.

#### Default Value

`new THREE.Matrix4()`

#### Inherited from

[`Renderer2D`](/api/classes/renderer2d/).[`matrix`](/api/classes/renderer2d/#matrix)

***

### matrixAutoUpdate

> **matrixAutoUpdate**: `boolean`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/Object3D.d.ts:205

When this is set, it calculates the matrix of position, (rotation or quaternion) and
scale every frame and also recalculates the matrixWorld property.

#### Default Value

[DEFAULT\_MATRIX\_AUTO\_UPDATE](/api/classes/sprite2d/#default_matrix_auto_update) - that is `(true)`.

#### Inherited from

[`TileMap2D`](/api/classes/tilemap2d/).[`matrixAutoUpdate`](/api/classes/tilemap2d/#matrixautoupdate)

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

[`TileMap2D`](/api/classes/tilemap2d/).[`matrixWorld`](/api/classes/tilemap2d/#matrixworld)

***

### matrixWorldAutoUpdate

> **matrixWorldAutoUpdate**: `boolean`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/Object3D.d.ts:212

If set, then the renderer checks every frame if the object and its children need matrix updates.
When it isn't, then you have to maintain all matrices in the object and its children yourself.

#### Default Value

[DEFAULT\_MATRIX\_WORLD\_AUTO\_UPDATE](/api/classes/sprite2d/#default_matrix_world_auto_update) - that is `(true)`.

#### Inherited from

[`TileMap2D`](/api/classes/tilemap2d/).[`matrixWorldAutoUpdate`](/api/classes/tilemap2d/#matrixworldautoupdate)

***

### matrixWorldNeedsUpdate

> **matrixWorldNeedsUpdate**: `boolean`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/Object3D.d.ts:218

When this is set, it calculates the matrixWorld in that frame and resets this property to false.

#### Default Value

`false`

#### Inherited from

[`TileMap2D`](/api/classes/tilemap2d/).[`matrixWorldNeedsUpdate`](/api/classes/tilemap2d/#matrixworldneedsupdate)

***

### modelViewMatrix

> `readonly` **modelViewMatrix**: [`Matrix4`](https://github.com/mrdoob/three.js/blob/dev/src/math/Matrix4.js)

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/Object3D.d.ts:180

#### Default Value

`new THREE.Matrix4()`

#### Inherited from

[`TileMap2D`](/api/classes/tilemap2d/).[`modelViewMatrix`](/api/classes/tilemap2d/#modelviewmatrix)

***

### morphTargetDictionary?

> `optional` **morphTargetDictionary**: `object`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/objects/Mesh.d.ts:77

A dictionary of morphTargets based on the `morphTarget.name` property.

#### Index Signature

\[`key`: `string`\]: `number`

#### Default Value

`undefined`, _but rebuilt by [.updateMorphTargets()](https://github.com/mrdoob/three.js/tree/dev/src)._

#### Inherited from

[`Sprite2D`](/api/classes/sprite2d/).[`morphTargetDictionary`](/api/classes/sprite2d/#morphtargetdictionary)

***

### morphTargetInfluences?

> `optional` **morphTargetInfluences**: `number`[]

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/objects/Mesh.d.ts:71

An array of weights typically from `0-1` that specify how much of the morph is applied.

#### Default Value

`undefined`, _but reset to a blank array by [.updateMorphTargets()](https://github.com/mrdoob/three.js/tree/dev/src)._

#### Inherited from

[`Sprite2D`](/api/classes/sprite2d/).[`morphTargetInfluences`](/api/classes/sprite2d/#morphtargetinfluences)

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

[`Sprite2D`](/api/classes/sprite2d/).[`name`](/api/classes/sprite2d/#name)

***

### normalMatrix

> `readonly` **normalMatrix**: [`Matrix3`](https://github.com/mrdoob/three.js/blob/dev/src/math/Matrix3.js)

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/Object3D.d.ts:185

#### Default Value

`new THREE.Matrix3()`

#### Inherited from

[`TileMap2D`](/api/classes/tilemap2d/).[`normalMatrix`](/api/classes/tilemap2d/#normalmatrix)

***

### occlusionTest?

> `optional` **occlusionTest**: `boolean`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/renderers/common/Backend.d.ts:9

#### Inherited from

[`TileMap2D`](/api/classes/tilemap2d/).[`occlusionTest`](/api/classes/tilemap2d/#occlusiontest)

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

[`TileMap2D`](/api/classes/tilemap2d/).[`parent`](/api/classes/tilemap2d/#parent)

***

### pixelPerfect

> **pixelPerfect**: `boolean` = `false`

Defined in: [packages/core/src/sprites/Sprite2D.ts:67](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/sprites/Sprite2D.ts#L67)

Pixel-perfect mode

#### Inherited from

[`Sprite2D`](/api/classes/sprite2d/).[`pixelPerfect`](/api/classes/sprite2d/#pixelperfect)

***

### position

> `readonly` **position**: [`Vector3`](https://github.com/mrdoob/three.js/blob/dev/src/math/Vector3.js)

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/Object3D.d.ts:157

Object's local position.

#### Default Value

`new THREE.Vector3()` - that is `(0, 0, 0)`.

#### Inherited from

[`Sprite2D`](/api/classes/sprite2d/).[`position`](/api/classes/sprite2d/#position)

***

### quaternion

> `readonly` **quaternion**: [`Quaternion`](https://github.com/mrdoob/three.js/blob/dev/src/math/Quaternion.js)

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/Object3D.d.ts:169

Object's local rotation as a THREE.Quaternion \| Quaternion.

#### Default Value

`new THREE.Quaternion()` - that is `(0,  0, 0, 1)`.

#### Inherited from

[`TileMap2D`](/api/classes/tilemap2d/).[`quaternion`](/api/classes/tilemap2d/#quaternion)

***

### receiveShadow

> **receiveShadow**: `boolean`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/Object3D.d.ts:244

Whether the material receives shadows.

#### Default Value

`false`

#### Inherited from

[`TileMap2D`](/api/classes/tilemap2d/).[`receiveShadow`](/api/classes/tilemap2d/#receiveshadow)

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

[`TileMap2D`](/api/classes/tilemap2d/).[`renderOrder`](/api/classes/tilemap2d/#renderorder)

***

### rotation

> `readonly` **rotation**: [`Euler`](https://github.com/mrdoob/three.js/blob/dev/src/math/Euler.js)

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/Object3D.d.ts:163

Object's local rotation ([Euler angles](https://en.wikipedia.org/wiki/Euler_angles)), in radians.

#### Default Value

`new THREE.Euler()` - that is `(0, 0, 0, Euler.DEFAULT_ORDER)`.

#### Inherited from

[`Sprite2D`](/api/classes/sprite2d/).[`rotation`](/api/classes/sprite2d/#rotation)

***

### scale

> `readonly` **scale**: [`Vector3`](https://github.com/mrdoob/three.js/blob/dev/src/math/Vector3.js)

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/Object3D.d.ts:175

The object's local scale.

#### Default Value

`new THREE.Vector3( 1, 1, 1 )`

#### Inherited from

[`Sprite2D`](/api/classes/sprite2d/).[`scale`](/api/classes/sprite2d/#scale)

***

### static?

> `optional` **static**: `boolean`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/renderers/common/Backend.d.ts:11

#### Inherited from

[`TileMap2D`](/api/classes/tilemap2d/).[`static`](/api/classes/tilemap2d/#static)

***

### type

> `readonly` **type**: `string`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/objects/Mesh.d.ts:53

#### Default Value

`Mesh`

#### Inherited from

[`Sprite2D`](/api/classes/sprite2d/).[`type`](/api/classes/sprite2d/#type)

***

### up

> **up**: [`Vector3`](https://github.com/mrdoob/three.js/blob/dev/src/math/Vector3.js)

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/Object3D.d.ts:151

This is used by the [lookAt](https://github.com/mrdoob/three.js/tree/dev/src) method, for example, to determine the orientation of the result.

#### Default Value

[Object3D.DEFAULT\_UP](/api/classes/sprite2d/#default_up) - that is `(0, 1, 0)`.

#### Inherited from

[`TileMap2D`](/api/classes/tilemap2d/).[`up`](/api/classes/tilemap2d/#up)

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

[`TileMap2D`](/api/classes/tilemap2d/).[`userData`](/api/classes/tilemap2d/#userdata)

***

### uuid

> **uuid**: `string`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/Object3D.d.ts:115

[UUID](http://en.wikipedia.org/wiki/Universally_unique_identifier) of this object instance.

#### Remarks

This gets automatically assigned and shouldn't be edited.

#### Inherited from

[`TileMap2D`](/api/classes/tilemap2d/).[`uuid`](/api/classes/tilemap2d/#uuid)

***

### visible

> **visible**: `boolean`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/Object3D.d.ts:232

Object gets rendered if `true`.

#### Default Value

`true`

#### Inherited from

[`Sprite2D`](/api/classes/sprite2d/).[`visible`](/api/classes/sprite2d/#visible)

***

### zIndex

> **zIndex**: `number` = `0`

Defined in: [packages/core/src/sprites/Sprite2D.ts:39](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/sprites/Sprite2D.ts#L39)

Z-index within layer (secondary sort key)

#### Inherited from

[`Sprite2D`](/api/classes/sprite2d/).[`zIndex`](/api/classes/sprite2d/#zindex)

***

### DEFAULT\_MATRIX\_AUTO\_UPDATE

> `static` **DEFAULT\_MATRIX\_AUTO\_UPDATE**: `boolean`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/Object3D.d.ts:373

The default setting for [matrixAutoUpdate](/api/classes/tilemap2d/#matrixautoupdate) for newly created Object3Ds.

#### Default Value

`true`

#### Inherited from

[`Sprite2D`](/api/classes/sprite2d/).[`DEFAULT_MATRIX_AUTO_UPDATE`](/api/classes/sprite2d/#default_matrix_auto_update)

***

### DEFAULT\_MATRIX\_WORLD\_AUTO\_UPDATE

> `static` **DEFAULT\_MATRIX\_WORLD\_AUTO\_UPDATE**: `boolean`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/Object3D.d.ts:379

The default setting for [matrixWorldAutoUpdate](/api/classes/tilemap2d/#matrixworldautoupdate) for newly created Object3Ds.

#### Default Value

`true`

#### Inherited from

[`Sprite2D`](/api/classes/sprite2d/).[`DEFAULT_MATRIX_WORLD_AUTO_UPDATE`](/api/classes/sprite2d/#default_matrix_world_auto_update)

***

### DEFAULT\_UP

> `static` **DEFAULT\_UP**: [`Vector3`](https://github.com/mrdoob/three.js/blob/dev/src/math/Vector3.js)

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/Object3D.d.ts:367

The default [up](/api/classes/tilemap2d/#up) direction for objects, also used as the default position for THREE.DirectionalLight \| DirectionalLight,
THREE.HemisphereLight \| HemisphereLight and THREE.Spotlight \| Spotlight (which creates lights shining from the top down).

#### Default Value

`new THREE.Vector3( 0, 1, 0)`

#### Inherited from

[`Sprite2D`](/api/classes/sprite2d/).[`DEFAULT_UP`](/api/classes/sprite2d/#default_up)

## Accessors

### alpha

#### Get Signature

> **get** **alpha**(): `number`

Defined in: [packages/core/src/sprites/Sprite2D.ts:316](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/sprites/Sprite2D.ts#L316)

Get alpha/opacity.

##### Returns

`number`

#### Set Signature

> **set** **alpha**(`value`): `void`

Defined in: [packages/core/src/sprites/Sprite2D.ts:323](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/sprites/Sprite2D.ts#L323)

Set alpha/opacity (0-1).

##### Parameters

###### value

`number`

##### Returns

`void`

#### Inherited from

[`Sprite2D`](/api/classes/sprite2d/).[`alpha`](/api/classes/sprite2d/#alpha)

***

### anchor

#### Get Signature

> **get** **anchor**(): [`Vector2`](https://github.com/mrdoob/three.js/blob/dev/src/math/Vector2.js)

Defined in: [packages/core/src/sprites/Sprite2D.ts:267](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/sprites/Sprite2D.ts#L267)

Get the anchor point.

##### Returns

[`Vector2`](https://github.com/mrdoob/three.js/blob/dev/src/math/Vector2.js)

#### Set Signature

> **set** **anchor**(`value`): `void`

Defined in: [packages/core/src/sprites/Sprite2D.ts:274](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/sprites/Sprite2D.ts#L274)

Set the anchor point. Accepts [x, y] array or Vector2.

##### Parameters

###### value

\[`number`, `number`\] | [`Vector2`](https://github.com/mrdoob/three.js/blob/dev/src/math/Vector2.js)

##### Returns

`void`

#### Inherited from

[`Sprite2D`](/api/classes/sprite2d/).[`anchor`](/api/classes/sprite2d/#anchor)

***

### animation

#### Set Signature

> **set** **animation**(`value`): `void`

Defined in: [packages/core/src/sprites/AnimatedSprite2D.ts:157](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/sprites/AnimatedSprite2D.ts#L157)

Set the current animation by name (R3F compatible).
Plays the animation if found.

##### Parameters

###### value

`string` | `null`

##### Returns

`void`

***

### animationSet

#### Set Signature

> **set** **animationSet**(`value`): `void`

Defined in: [packages/core/src/sprites/AnimatedSprite2D.ts:147](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/sprites/AnimatedSprite2D.ts#L147)

Set animation set definition (R3F compatible).
Loads animations from the definition.

##### Parameters

###### value

[`AnimationSetDefinition`](/api/interfaces/animationsetdefinition/) | `null`

##### Returns

`void`

***

### currentAnimation

#### Get Signature

> **get** **currentAnimation**(): `string` \| `null`

Defined in: [packages/core/src/sprites/AnimatedSprite2D.ts:322](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/sprites/AnimatedSprite2D.ts#L322)

Get current animation name.

##### Returns

`string` \| `null`

***

### flipX

#### Get Signature

> **get** **flipX**(): `boolean`

Defined in: [packages/core/src/sprites/Sprite2D.ts:331](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/sprites/Sprite2D.ts#L331)

Get flipX state.

##### Returns

`boolean`

#### Set Signature

> **set** **flipX**(`value`): `void`

Defined in: [packages/core/src/sprites/Sprite2D.ts:338](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/sprites/Sprite2D.ts#L338)

Set flipX state.

##### Parameters

###### value

`boolean`

##### Returns

`void`

#### Inherited from

[`Sprite2D`](/api/classes/sprite2d/).[`flipX`](/api/classes/sprite2d/#flipx)

***

### flipY

#### Get Signature

> **get** **flipY**(): `boolean`

Defined in: [packages/core/src/sprites/Sprite2D.ts:346](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/sprites/Sprite2D.ts#L346)

Get flipY state.

##### Returns

`boolean`

#### Set Signature

> **set** **flipY**(`value`): `void`

Defined in: [packages/core/src/sprites/Sprite2D.ts:353](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/sprites/Sprite2D.ts#L353)

Set flipY state.

##### Parameters

###### value

`boolean`

##### Returns

`void`

#### Inherited from

[`Sprite2D`](/api/classes/sprite2d/).[`flipY`](/api/classes/sprite2d/#flipy)

***

### frame

#### Get Signature

> **get** **frame**(): [`SpriteFrame`](/api/interfaces/spriteframe/) \| `null`

Defined in: [packages/core/src/sprites/Sprite2D.ts:234](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/sprites/Sprite2D.ts#L234)

Get the current frame.

##### Returns

[`SpriteFrame`](/api/interfaces/spriteframe/) \| `null`

#### Set Signature

> **set** **frame**(`value`): `void`

Defined in: [packages/core/src/sprites/Sprite2D.ts:241](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/sprites/Sprite2D.ts#L241)

Set the current frame (R3F prop compatibility).

##### Parameters

###### value

[`SpriteFrame`](/api/interfaces/spriteframe/) | `null`

##### Returns

`void`

#### Inherited from

[`Sprite2D`](/api/classes/sprite2d/).[`frame`](/api/classes/sprite2d/#frame)

***

### height

#### Get Signature

> **get** **height**(): `number`

Defined in: [packages/core/src/sprites/Sprite2D.ts:378](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/sprites/Sprite2D.ts#L378)

Get the height of the sprite in world units.

##### Returns

`number`

#### Inherited from

[`Sprite2D`](/api/classes/sprite2d/).[`height`](/api/classes/sprite2d/#height)

***

### speed

#### Get Signature

> **get** **speed**(): `number`

Defined in: [packages/core/src/sprites/AnimatedSprite2D.ts:329](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/sprites/AnimatedSprite2D.ts#L329)

Get playback speed.

##### Returns

`number`

#### Set Signature

> **set** **speed**(`value`): `void`

Defined in: [packages/core/src/sprites/AnimatedSprite2D.ts:336](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/sprites/AnimatedSprite2D.ts#L336)

Set playback speed.

##### Parameters

###### value

`number`

##### Returns

`void`

***

### spriteSheet

#### Get Signature

> **get** **spriteSheet**(): [`SpriteSheet`](/api/interfaces/spritesheet/) \| `null`

Defined in: [packages/core/src/sprites/AnimatedSprite2D.ts:124](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/sprites/AnimatedSprite2D.ts#L124)

Get the spritesheet.

##### Returns

[`SpriteSheet`](/api/interfaces/spritesheet/) \| `null`

#### Set Signature

> **set** **spriteSheet**(`value`): `void`

Defined in: [packages/core/src/sprites/AnimatedSprite2D.ts:131](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/sprites/AnimatedSprite2D.ts#L131)

Set a new spritesheet.

##### Parameters

###### value

[`SpriteSheet`](/api/interfaces/spritesheet/) | `null`

##### Returns

`void`

***

### texture

#### Get Signature

> **get** **texture**(): [`Texture`](https://github.com/mrdoob/three.js/blob/dev/src/textures/Texture.js)\<`unknown`\> \| `null`

Defined in: [packages/core/src/sprites/Sprite2D.ts:201](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/sprites/Sprite2D.ts#L201)

Get the current texture.

##### Returns

[`Texture`](https://github.com/mrdoob/three.js/blob/dev/src/textures/Texture.js)\<`unknown`\> \| `null`

#### Set Signature

> **set** **texture**(`value`): `void`

Defined in: [packages/core/src/sprites/Sprite2D.ts:208](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/sprites/Sprite2D.ts#L208)

Set a new texture.

##### Parameters

###### value

[`Texture`](https://github.com/mrdoob/three.js/blob/dev/src/textures/Texture.js)\<`unknown`\> | `null`

##### Returns

`void`

#### Inherited from

[`Sprite2D`](/api/classes/sprite2d/).[`texture`](/api/classes/sprite2d/#texture)

***

### tint

#### Get Signature

> **get** **tint**(): [`Color`](https://github.com/mrdoob/three.js/blob/dev/src/math/Color.js)

Defined in: [packages/core/src/sprites/Sprite2D.ts:295](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/sprites/Sprite2D.ts#L295)

Get tint color.

##### Returns

[`Color`](https://github.com/mrdoob/three.js/blob/dev/src/math/Color.js)

#### Set Signature

> **set** **tint**(`value`): `void`

Defined in: [packages/core/src/sprites/Sprite2D.ts:302](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/sprites/Sprite2D.ts#L302)

Set tint color.

##### Parameters

###### value

`string` | `number` | [`Color`](https://github.com/mrdoob/three.js/blob/dev/src/math/Color.js)

##### Returns

`void`

#### Inherited from

[`Sprite2D`](/api/classes/sprite2d/).[`tint`](/api/classes/sprite2d/#tint)

***

### width

#### Get Signature

> **get** **width**(): `number`

Defined in: [packages/core/src/sprites/Sprite2D.ts:371](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/sprites/Sprite2D.ts#L371)

Get the width of the sprite in world units.

##### Returns

`number`

#### Inherited from

[`Sprite2D`](/api/classes/sprite2d/).[`width`](/api/classes/sprite2d/#width)

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

[`Sprite2D`](/api/classes/sprite2d/).[`add`](/api/classes/sprite2d/#add)

***

### addAnimation()

> **addAnimation**(`animation`): `this`

Defined in: [packages/core/src/sprites/AnimatedSprite2D.ts:206](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/sprites/AnimatedSprite2D.ts#L206)

Add an animation.

#### Parameters

##### animation

[`Animation`](/api/interfaces/animation/)

#### Returns

`this`

***

### addAnimationFromFrames()

> **addAnimationFromFrames**(`name`, `frameNames`, `options`): `this`

Defined in: [packages/core/src/sprites/AnimatedSprite2D.ts:214](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/sprites/AnimatedSprite2D.ts#L214)

Add animation from frame names.

#### Parameters

##### name

`string`

##### frameNames

`string`[]

##### options

###### fps?

`number`

###### loop?

`boolean`

###### pingPong?

`boolean`

#### Returns

`this`

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

[`EventListener`](https://github.com/mrdoob/three.js/tree/dev/src)\<[`Object3DEventMap`](https://github.com/mrdoob/three.js/tree/dev/src)\[`T`\], `T`, `AnimatedSprite2D`\>

The function that gets called when the event is fired.

#### Returns

`void`

#### Inherited from

[`Sprite2D`](/api/classes/sprite2d/).[`addEventListener`](/api/classes/sprite2d/#addeventlistener)

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

[`Sprite2D`](/api/classes/sprite2d/).[`applyMatrix4`](/api/classes/sprite2d/#applymatrix4)

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

[`Sprite2D`](/api/classes/sprite2d/).[`applyQuaternion`](/api/classes/sprite2d/#applyquaternion)

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

[`Sprite2D`](/api/classes/sprite2d/).[`attach`](/api/classes/sprite2d/#attach)

***

### clear()

> **clear**(): `this`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/Object3D.d.ts:533

Removes all child objects.

#### Returns

`this`

#### Inherited from

[`Sprite2D`](/api/classes/sprite2d/).[`clear`](/api/classes/sprite2d/#clear)

***

### clearInstanceValues()

> **clearInstanceValues**(): `this`

Defined in: [packages/core/src/sprites/Sprite2D.ts:556](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/sprites/Sprite2D.ts#L556)

Clear all instance values (reset to material defaults).

#### Returns

`this`

#### Inherited from

[`Sprite2D`](/api/classes/sprite2d/).[`clearInstanceValues`](/api/classes/sprite2d/#clearinstancevalues)

***

### clone()

> **clone**(`recursive?`): `this`

Defined in: [packages/core/src/sprites/AnimatedSprite2D.ts:352](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/sprites/AnimatedSprite2D.ts#L352)

Clone the animated sprite.

#### Parameters

##### recursive?

`boolean`

#### Returns

`this`

#### Overrides

[`Sprite2D`](/api/classes/sprite2d/).[`clone`](/api/classes/sprite2d/#clone)

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

[`Sprite2D`](/api/classes/sprite2d/).[`copy`](/api/classes/sprite2d/#copy)

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

[`Sprite2D`](/api/classes/sprite2d/).[`dispatchEvent`](/api/classes/sprite2d/#dispatchevent)

***

### dispose()

> **dispose**(): `void`

Defined in: [packages/core/src/sprites/AnimatedSprite2D.ts:396](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/sprites/AnimatedSprite2D.ts#L396)

Dispose of resources.

#### Returns

`void`

#### Overrides

[`Sprite2D`](/api/classes/sprite2d/).[`dispose`](/api/classes/sprite2d/#dispose)

***

### flip()

> **flip**(`horizontal`, `vertical`): `this`

Defined in: [packages/core/src/sprites/Sprite2D.ts:361](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/sprites/Sprite2D.ts#L361)

Flip the sprite.

#### Parameters

##### horizontal

`boolean`

##### vertical

`boolean`

#### Returns

`this`

#### Inherited from

[`Sprite2D`](/api/classes/sprite2d/).[`flip`](/api/classes/sprite2d/#flip)

***

### getAnimationDuration()

> **getAnimationDuration**(`name?`): `number`

Defined in: [packages/core/src/sprites/AnimatedSprite2D.ts:343](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/sprites/AnimatedSprite2D.ts#L343)

Get animation duration.

#### Parameters

##### name?

`string`

#### Returns

`number`

***

### getInstanceValue()

> **getInstanceValue**(`name`): `number` \| `number`[] \| `undefined`

Defined in: [packages/core/src/sprites/Sprite2D.ts:542](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/sprites/Sprite2D.ts#L542)

Get a per-instance attribute value.

#### Parameters

##### name

`string`

#### Returns

`number` \| `number`[] \| `undefined`

#### Inherited from

[`Sprite2D`](/api/classes/sprite2d/).[`getInstanceValue`](/api/classes/sprite2d/#getinstancevalue)

***

### getInstanceValues()

> **getInstanceValues**(): `Map`\<`string`, `number` \| `number`[]\>

Defined in: [packages/core/src/sprites/Sprite2D.ts:549](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/sprites/Sprite2D.ts#L549)

Get all instance values (for SpriteBatch).

#### Returns

`Map`\<`string`, `number` \| `number`[]\>

#### Inherited from

[`Sprite2D`](/api/classes/sprite2d/).[`getInstanceValues`](/api/classes/sprite2d/#getinstancevalues)

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

[`Sprite2D`](/api/classes/sprite2d/).[`getObjectById`](/api/classes/sprite2d/#getobjectbyid)

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

[`Sprite2D`](/api/classes/sprite2d/).[`getObjectByName`](/api/classes/sprite2d/#getobjectbyname)

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

[`Sprite2D`](/api/classes/sprite2d/).[`getObjectByProperty`](/api/classes/sprite2d/#getobjectbyproperty)

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

[`Sprite2D`](/api/classes/sprite2d/).[`getObjectsByProperty`](/api/classes/sprite2d/#getobjectsbyproperty)

***

### getVertexPosition()

> **getVertexPosition**(`index`, `target`): [`Vector3`](https://github.com/mrdoob/three.js/blob/dev/src/math/Vector3.js)

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/objects/Mesh.d.ts:99

Get the local-space position of the vertex at the given index,
taking into account the current animation state of both morph targets and skinning.

#### Parameters

##### index

`number`

Expects a `Integer`

##### target

[`Vector3`](https://github.com/mrdoob/three.js/blob/dev/src/math/Vector3.js)

#### Returns

[`Vector3`](https://github.com/mrdoob/three.js/blob/dev/src/math/Vector3.js)

#### Inherited from

[`Sprite2D`](/api/classes/sprite2d/).[`getVertexPosition`](/api/classes/sprite2d/#getvertexposition)

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

[`Sprite2D`](/api/classes/sprite2d/).[`getWorldDirection`](/api/classes/sprite2d/#getworlddirection)

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

[`Sprite2D`](/api/classes/sprite2d/).[`getWorldPosition`](/api/classes/sprite2d/#getworldposition)

***

### getWorldPosition2D()

> **getWorldPosition2D**(): [`Vector2`](https://github.com/mrdoob/three.js/blob/dev/src/math/Vector2.js)

Defined in: [packages/core/src/sprites/Sprite2D.ts:511](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/sprites/Sprite2D.ts#L511)

Get world position (convenience method).

#### Returns

[`Vector2`](https://github.com/mrdoob/three.js/blob/dev/src/math/Vector2.js)

#### Inherited from

[`Sprite2D`](/api/classes/sprite2d/).[`getWorldPosition2D`](/api/classes/sprite2d/#getworldposition2d)

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

[`Sprite2D`](/api/classes/sprite2d/).[`getWorldQuaternion`](/api/classes/sprite2d/#getworldquaternion)

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

[`Sprite2D`](/api/classes/sprite2d/).[`getWorldScale`](/api/classes/sprite2d/#getworldscale)

***

### gotoFrame()

> **gotoFrame**(`index`): `this`

Defined in: [packages/core/src/sprites/AnimatedSprite2D.ts:284](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/sprites/AnimatedSprite2D.ts#L284)

Go to a specific frame.

#### Parameters

##### index

`number`

#### Returns

`this`

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

[`EventListener`](https://github.com/mrdoob/three.js/tree/dev/src)\<[`Object3DEventMap`](https://github.com/mrdoob/three.js/tree/dev/src)\[`T`\], `T`, `AnimatedSprite2D`\>

The function that gets called when the event is fired.

#### Returns

`boolean`

#### Inherited from

[`Sprite2D`](/api/classes/sprite2d/).[`hasEventListener`](/api/classes/sprite2d/#haseventlistener)

***

### isPlaying()

> **isPlaying**(`name?`): `boolean`

Defined in: [packages/core/src/sprites/AnimatedSprite2D.ts:315](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/sprites/AnimatedSprite2D.ts#L315)

Check if an animation is playing.

#### Parameters

##### name?

`string`

#### Returns

`boolean`

***

### loadAnimationSet()

> **loadAnimationSet**(`definition`): `this`

Defined in: [packages/core/src/sprites/AnimatedSprite2D.ts:166](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/sprites/AnimatedSprite2D.ts#L166)

Load animations from an animation set definition.

#### Parameters

##### definition

[`AnimationSetDefinition`](/api/interfaces/animationsetdefinition/)

#### Returns

`this`

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

[`Sprite2D`](/api/classes/sprite2d/).[`localToWorld`](/api/classes/sprite2d/#localtoworld)

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

[`Sprite2D`](/api/classes/sprite2d/).[`lookAt`](/api/classes/sprite2d/#lookat)

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

[`Sprite2D`](/api/classes/sprite2d/).[`lookAt`](/api/classes/sprite2d/#lookat)

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

[`Sprite2D`](/api/classes/sprite2d/).[`onAfterRender`](/api/classes/sprite2d/#onafterrender)

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

[`Sprite2D`](/api/classes/sprite2d/).[`onAfterShadow`](/api/classes/sprite2d/#onaftershadow)

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

[`Sprite2D`](/api/classes/sprite2d/).[`onBeforeRender`](/api/classes/sprite2d/#onbeforerender)

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

[`Sprite2D`](/api/classes/sprite2d/).[`onBeforeShadow`](/api/classes/sprite2d/#onbeforeshadow)

***

### pause()

> **pause**(): `this`

Defined in: [packages/core/src/sprites/AnimatedSprite2D.ts:260](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/sprites/AnimatedSprite2D.ts#L260)

Pause the current animation.

#### Returns

`this`

***

### play()

> **play**(`name`, `options?`): `this`

Defined in: [packages/core/src/sprites/AnimatedSprite2D.ts:245](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/sprites/AnimatedSprite2D.ts#L245)

Play an animation.

#### Parameters

##### name

`string`

##### options?

[`PlayOptions`](/api/interfaces/playoptions/)

#### Returns

`this`

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

[`Sprite2D`](/api/classes/sprite2d/).[`raycast`](/api/classes/sprite2d/#raycast)

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

[`Sprite2D`](/api/classes/sprite2d/).[`remove`](/api/classes/sprite2d/#remove)

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

[`EventListener`](https://github.com/mrdoob/three.js/tree/dev/src)\<[`Object3DEventMap`](https://github.com/mrdoob/three.js/tree/dev/src)\[`T`\], `T`, `AnimatedSprite2D`\>

The listener function that gets removed.

#### Returns

`void`

#### Inherited from

[`Sprite2D`](/api/classes/sprite2d/).[`removeEventListener`](/api/classes/sprite2d/#removeeventlistener)

***

### removeFromParent()

> **removeFromParent**(): `this`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/Object3D.d.ts:528

Removes this object from its current parent.

#### Returns

`this`

#### Inherited from

[`Sprite2D`](/api/classes/sprite2d/).[`removeFromParent`](/api/classes/sprite2d/#removefromparent)

***

### resume()

> **resume**(): `this`

Defined in: [packages/core/src/sprites/AnimatedSprite2D.ts:268](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/sprites/AnimatedSprite2D.ts#L268)

Resume a paused animation.

#### Returns

`this`

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

[`Sprite2D`](/api/classes/sprite2d/).[`rotateOnAxis`](/api/classes/sprite2d/#rotateonaxis)

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

[`Sprite2D`](/api/classes/sprite2d/).[`rotateOnWorldAxis`](/api/classes/sprite2d/#rotateonworldaxis)

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

[`Sprite2D`](/api/classes/sprite2d/).[`rotateX`](/api/classes/sprite2d/#rotatex)

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

[`Sprite2D`](/api/classes/sprite2d/).[`rotateY`](/api/classes/sprite2d/#rotatey)

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

[`Sprite2D`](/api/classes/sprite2d/).[`rotateZ`](/api/classes/sprite2d/#rotatez)

***

### setAnchor()

> **setAnchor**(`x`, `y`): `this`

Defined in: [packages/core/src/sprites/Sprite2D.ts:286](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/sprites/Sprite2D.ts#L286)

Set the anchor point (0-1).
(0, 0) = top-left, (0.5, 0.5) = center, (0.5, 1) = bottom-center

#### Parameters

##### x

`number`

##### y

`number`

#### Returns

`this`

#### Inherited from

[`Sprite2D`](/api/classes/sprite2d/).[`setAnchor`](/api/classes/sprite2d/#setanchor)

***

### setFrame()

> **setFrame**(`frame`): `this`

Defined in: [packages/core/src/sprites/Sprite2D.ts:251](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/sprites/Sprite2D.ts#L251)

Set the current frame.
Note: Does not modify scale - call updateSize() manually if needed after first frame.

#### Parameters

##### frame

[`SpriteFrame`](/api/interfaces/spriteframe/)

#### Returns

`this`

#### Inherited from

[`Sprite2D`](/api/classes/sprite2d/).[`setFrame`](/api/classes/sprite2d/#setframe)

***

### setInstanceValue()

> **setInstanceValue**(`name`, `value`): `this`

Defined in: [packages/core/src/sprites/Sprite2D.ts:534](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/sprites/Sprite2D.ts#L534)

Set a per-instance attribute value.
The attribute must be defined on the material via addInstanceFloat(), etc.

#### Parameters

##### name

`string`

##### value

`number` | `number`[]

#### Returns

`this`

#### Example

```typescript
// Material defines the attribute
material.addInstanceFloat('dissolve', 0);

// Sprite sets its value
sprite.setInstanceValue('dissolve', 0.5);
```

#### Inherited from

[`Sprite2D`](/api/classes/sprite2d/).[`setInstanceValue`](/api/classes/sprite2d/#setinstancevalue)

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

[`Sprite2D`](/api/classes/sprite2d/).[`setRotationFromAxisAngle`](/api/classes/sprite2d/#setrotationfromaxisangle)

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

[`Sprite2D`](/api/classes/sprite2d/).[`setRotationFromEuler`](/api/classes/sprite2d/#setrotationfromeuler)

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

[`Sprite2D`](/api/classes/sprite2d/).[`setRotationFromMatrix`](/api/classes/sprite2d/#setrotationfrommatrix)

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

[`Sprite2D`](/api/classes/sprite2d/).[`setRotationFromQuaternion`](/api/classes/sprite2d/#setrotationfromquaternion)

***

### stop()

> **stop**(): `this`

Defined in: [packages/core/src/sprites/AnimatedSprite2D.ts:276](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/sprites/AnimatedSprite2D.ts#L276)

Stop the current animation.

#### Returns

`this`

***

### toJSON()

> **toJSON**(`meta?`): [`MeshJSON`](https://github.com/mrdoob/three.js/tree/dev/src)

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/objects/Mesh.d.ts:101

Convert the object to three.js [JSON Object/Scene format](https://github.com/mrdoob/three.js/wiki/JSON-Object-Scene-format-4).

#### Parameters

##### meta?

[`JSONMeta`](https://github.com/mrdoob/three.js/tree/dev/src)

Object containing metadata such as materials, textures or images for the object.

#### Returns

[`MeshJSON`](https://github.com/mrdoob/three.js/tree/dev/src)

#### Inherited from

[`Sprite2D`](/api/classes/sprite2d/).[`toJSON`](/api/classes/sprite2d/#tojson)

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

[`Sprite2D`](/api/classes/sprite2d/).[`translateOnAxis`](/api/classes/sprite2d/#translateonaxis)

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

[`Sprite2D`](/api/classes/sprite2d/).[`translateX`](/api/classes/sprite2d/#translatex)

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

[`Sprite2D`](/api/classes/sprite2d/).[`translateY`](/api/classes/sprite2d/#translatey)

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

[`Sprite2D`](/api/classes/sprite2d/).[`translateZ`](/api/classes/sprite2d/#translatez)

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

[`Sprite2D`](/api/classes/sprite2d/).[`traverse`](/api/classes/sprite2d/#traverse)

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

[`Sprite2D`](/api/classes/sprite2d/).[`traverseAncestors`](/api/classes/sprite2d/#traverseancestors)

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

[`Sprite2D`](/api/classes/sprite2d/).[`traverseVisible`](/api/classes/sprite2d/#traversevisible)

***

### update()

> **update**(`deltaMs`): `void`

Defined in: [packages/core/src/sprites/AnimatedSprite2D.ts:297](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/sprites/AnimatedSprite2D.ts#L297)

Update animation (call in render loop).

#### Parameters

##### deltaMs

`number`

Time since last frame in milliseconds

#### Returns

`void`

***

### updateMatrix()

> **updateMatrix**(): `void`

Defined in: [packages/core/src/sprites/Sprite2D.ts:568](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/sprites/Sprite2D.ts#L568)

Update the matrix with automatic Z offset for depth-based layer/zIndex sorting.
This ensures proper rendering order whether the sprite is standalone or batched.

Z offset formula: layer * 10 + zIndex * 0.001
Higher layer/zIndex = higher Z = closer to camera = renders in front

#### Returns

`void`

#### Inherited from

[`Sprite2D`](/api/classes/sprite2d/).[`updateMatrix`](/api/classes/sprite2d/#updatematrix)

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

[`Sprite2D`](/api/classes/sprite2d/).[`updateMatrixWorld`](/api/classes/sprite2d/#updatematrixworld)

***

### updateMorphTargets()

> **updateMorphTargets**(): `void`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/objects/Mesh.d.ts:91

Updates the morphTargets to have no influence on the object

#### Returns

`void`

#### Remarks

Resets the [morphTargetInfluences](https://github.com/mrdoob/three.js/tree/dev/src) and [morphTargetDictionary](https://github.com/mrdoob/three.js/tree/dev/src) properties.

#### Inherited from

[`Sprite2D`](/api/classes/sprite2d/).[`updateMorphTargets`](/api/classes/sprite2d/#updatemorphtargets)

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

[`Sprite2D`](/api/classes/sprite2d/).[`updateWorldMatrix`](/api/classes/sprite2d/#updateworldmatrix)

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

[`Sprite2D`](/api/classes/sprite2d/).[`worldToLocal`](/api/classes/sprite2d/#worldtolocal)
