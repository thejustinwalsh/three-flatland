---
editUrl: false
next: false
prev: false
title: "SpriteBatch"
---

Defined in: [packages/core/src/pipeline/SpriteBatch.ts:26](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/pipeline/SpriteBatch.ts#L26)

A batch of sprites rendered with a single draw call.

Uses InstancedMesh with per-instance attributes for:
- Transform (via instanceMatrix)
- Frame UV (instanceUV)
- Color (instanceColor)
- Flip (instanceFlip)
- Custom attributes from material schema

## Extends

- [`InstancedMesh`](https://github.com/mrdoob/three.js/blob/dev/src/objects/InstancedMesh.js)

## Constructors

### Constructor

> **new SpriteBatch**(`material`, `maxSize`): `SpriteBatch`

Defined in: [packages/core/src/pipeline/SpriteBatch.ts:64](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/pipeline/SpriteBatch.ts#L64)

#### Parameters

##### material

[`Sprite2DMaterial`](/api/classes/sprite2dmaterial/)

##### maxSize

`number` = `DEFAULT_BATCH_SIZE`

#### Returns

`SpriteBatch`

#### Overrides

`InstancedMesh.constructor`

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

### boundingBox

> **boundingBox**: [`Box3`](https://github.com/mrdoob/three.js/blob/dev/src/math/Box3.js) \| `null`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/objects/InstancedMesh.d.ts:64

This bounding box encloses all instances of the [InstancedMesh](https://github.com/mrdoob/three.js/blob/dev/src/objects/InstancedMesh.js),, which can be calculated with [.computeBoundingBox()](https://github.com/mrdoob/three.js/tree/dev/src).

#### Remarks

Bounding boxes aren't computed by default. They need to be explicitly computed, otherwise they are `null`.

#### Default Value

`null`

#### Inherited from

`InstancedMesh.boundingBox`

***

### boundingSphere

> **boundingSphere**: [`Sphere`](https://github.com/mrdoob/three.js/blob/dev/src/math/Sphere.js) \| `null`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/objects/InstancedMesh.d.ts:71

This bounding sphere encloses all instances of the [InstancedMesh](https://github.com/mrdoob/three.js/blob/dev/src/objects/InstancedMesh.js), which can be calculated with [.computeBoundingSphere()](https://github.com/mrdoob/three.js/tree/dev/src).

#### Remarks

bounding spheres aren't computed by default. They need to be explicitly computed, otherwise they are `null`.

#### Default Value

`null`

#### Inherited from

`InstancedMesh.boundingSphere`

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

### count

> **count**: `number`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/objects/InstancedMesh.d.ts:81

The number of instances.

#### Remarks

The `count` value passed into the [constructor](https://github.com/mrdoob/three.js/blob/dev/src/objects/InstancedMesh.js) represents the **maximum** number of instances of this mesh.
You can change the number of instances at runtime to an integer value in the range `[0, count]`.
If you need more instances than the original `count` value, you have to create a new InstancedMesh.
Expects a `Integer`

#### Inherited from

`InstancedMesh.count`

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

`InstancedMesh.frustumCulled`

***

### geometry

> **geometry**: [`BufferGeometry`](https://github.com/mrdoob/three.js/blob/dev/src/core/BufferGeometry.js)

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/objects/Mesh.d.ts:59

An instance of THREE.BufferGeometry \| BufferGeometry (or derived classes), defining the object's structure.

#### Default Value

THREE.BufferGeometry \| \`new THREE.BufferGeometry()\`.

#### Inherited from

`InstancedMesh.geometry`

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

### instanceColor

> **instanceColor**: [`InstancedBufferAttribute`](https://github.com/mrdoob/three.js/blob/dev/src/core/InstancedBufferAttribute.js) \| `null`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/objects/InstancedMesh.d.ts:88

Represents the colors of all instances.
You have to set [.instanceColor.needsUpdate()](https://github.com/mrdoob/three.js/tree/dev/src) flag to `true` if you modify instanced data via [.setColorAt()](https://github.com/mrdoob/three.js/tree/dev/src).

#### Default Value

`null`

#### Inherited from

`InstancedMesh.instanceColor`

***

### instanceMatrix

> **instanceMatrix**: [`InstancedBufferAttribute`](https://github.com/mrdoob/three.js/blob/dev/src/core/InstancedBufferAttribute.js)

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/objects/InstancedMesh.d.ts:94

Represents the local transformation of all instances.
You have to set [.instanceMatrix.needsUpdate()](https://github.com/mrdoob/three.js/tree/dev/src) flag to `true` if you modify instanced data via [.setMatrixAt()](https://github.com/mrdoob/three.js/tree/dev/src).

#### Inherited from

`InstancedMesh.instanceMatrix`

***

### isInstancedMesh

> `readonly` **isInstancedMesh**: `true`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/objects/InstancedMesh.d.ts:57

Read-only flag to check if a given object is of type [InstancedMesh](https://github.com/mrdoob/three.js/blob/dev/src/objects/InstancedMesh.js).

#### Remarks

This is a _constant_ value

#### Default Value

`true`

#### Inherited from

`InstancedMesh.isInstancedMesh`

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

`InstancedMesh.isMesh`

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

> **material**: [`Material`](https://github.com/mrdoob/three.js/blob/dev/src/materials/Material.js) \| [`Material`](https://github.com/mrdoob/three.js/blob/dev/src/materials/Material.js)[]

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/objects/Mesh.d.ts:65

An instance of material derived from the THREE.Material \| Material base class or an array of materials, defining the object's appearance.

#### Default Value

THREE.MeshBasicMaterial \| \`new THREE.MeshBasicMaterial()\`.

#### Inherited from

`InstancedMesh.material`

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

### maxSize

> `readonly` **maxSize**: `number`

Defined in: [packages/core/src/pipeline/SpriteBatch.ts:35](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/pipeline/SpriteBatch.ts#L35)

Maximum number of sprites this batch can hold.

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

`InstancedMesh.morphTargetDictionary`

***

### morphTargetInfluences?

> `optional` **morphTargetInfluences**: `number`[]

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/objects/Mesh.d.ts:71

An array of weights typically from `0-1` that specify how much of the morph is applied.

#### Default Value

`undefined`, _but reset to a blank array by [.updateMorphTargets()](https://github.com/mrdoob/three.js/tree/dev/src)._

#### Inherited from

`InstancedMesh.morphTargetInfluences`

***

### morphTexture

> **morphTexture**: [`DataTexture`](https://github.com/mrdoob/three.js/blob/dev/src/textures/DataTexture.js) \| `null`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/objects/InstancedMesh.d.ts:100

Represents the morph target weights of all instances. You have to set its .needsUpdate flag to true if
you modify instanced data via .setMorphAt.

#### Inherited from

`InstancedMesh.morphTexture`

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

`InstancedMesh.name`

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

### position

> `readonly` **position**: [`Vector3`](https://github.com/mrdoob/three.js/blob/dev/src/math/Vector3.js)

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/Object3D.d.ts:157

Object's local position.

#### Default Value

`new THREE.Vector3()` - that is `(0, 0, 0)`.

#### Inherited from

`InstancedMesh.position`

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

`InstancedMesh.rotation`

***

### scale

> `readonly` **scale**: [`Vector3`](https://github.com/mrdoob/three.js/blob/dev/src/math/Vector3.js)

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/Object3D.d.ts:175

The object's local scale.

#### Default Value

`new THREE.Vector3( 1, 1, 1 )`

#### Inherited from

`InstancedMesh.scale`

***

### spriteMaterial

> `readonly` **spriteMaterial**: [`Sprite2DMaterial`](/api/classes/sprite2dmaterial/)

Defined in: [packages/core/src/pipeline/SpriteBatch.ts:30](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/pipeline/SpriteBatch.ts#L30)

The material used by all sprites in this batch.

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

`InstancedMesh.type`

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

`InstancedMesh.visible`

***

### DEFAULT\_MATRIX\_AUTO\_UPDATE

> `static` **DEFAULT\_MATRIX\_AUTO\_UPDATE**: `boolean`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/Object3D.d.ts:373

The default setting for [matrixAutoUpdate](/api/classes/tilemap2d/#matrixautoupdate) for newly created Object3Ds.

#### Default Value

`true`

#### Inherited from

`InstancedMesh.DEFAULT_MATRIX_AUTO_UPDATE`

***

### DEFAULT\_MATRIX\_WORLD\_AUTO\_UPDATE

> `static` **DEFAULT\_MATRIX\_WORLD\_AUTO\_UPDATE**: `boolean`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/Object3D.d.ts:379

The default setting for [matrixWorldAutoUpdate](/api/classes/tilemap2d/#matrixworldautoupdate) for newly created Object3Ds.

#### Default Value

`true`

#### Inherited from

`InstancedMesh.DEFAULT_MATRIX_WORLD_AUTO_UPDATE`

***

### DEFAULT\_UP

> `static` **DEFAULT\_UP**: [`Vector3`](https://github.com/mrdoob/three.js/blob/dev/src/math/Vector3.js)

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/Object3D.d.ts:367

The default [up](/api/classes/tilemap2d/#up) direction for objects, also used as the default position for THREE.DirectionalLight \| DirectionalLight,
THREE.HemisphereLight \| HemisphereLight and THREE.Spotlight \| Spotlight (which creates lights shining from the top down).

#### Default Value

`new THREE.Vector3( 0, 1, 0)`

#### Inherited from

`InstancedMesh.DEFAULT_UP`

## Accessors

### isDirty

#### Get Signature

> **get** **isDirty**(): `boolean`

Defined in: [packages/core/src/pipeline/SpriteBatch.ts:180](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/pipeline/SpriteBatch.ts#L180)

Check if batch needs GPU upload.

##### Returns

`boolean`

***

### isEmpty

#### Get Signature

> **get** **isEmpty**(): `boolean`

Defined in: [packages/core/src/pipeline/SpriteBatch.ts:173](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/pipeline/SpriteBatch.ts#L173)

Check if batch is empty.

##### Returns

`boolean`

***

### isFull

#### Get Signature

> **get** **isFull**(): `boolean`

Defined in: [packages/core/src/pipeline/SpriteBatch.ts:166](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/pipeline/SpriteBatch.ts#L166)

Check if batch is full.

##### Returns

`boolean`

***

### spriteCount

#### Get Signature

> **get** **spriteCount**(): `number`

Defined in: [packages/core/src/pipeline/SpriteBatch.ts:159](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/pipeline/SpriteBatch.ts#L159)

Get current sprite count.

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

`InstancedMesh.add`

***

### addEventListener()

> **addEventListener**\<`T`\>(`type`, `listener`): `void`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/EventDispatcher.d.ts:52

Adds a listener to an event type.

#### Type Parameters

##### T

`T` *extends* keyof [`InstancedMeshEventMap`](https://github.com/mrdoob/three.js/tree/dev/src)

#### Parameters

##### type

`T`

The type of event to listen to.

##### listener

[`EventListener`](https://github.com/mrdoob/three.js/tree/dev/src)\<[`InstancedMeshEventMap`](https://github.com/mrdoob/three.js/tree/dev/src)\[`T`\], `T`, `SpriteBatch`\>

The function that gets called when the event is fired.

#### Returns

`void`

#### Inherited from

`InstancedMesh.addEventListener`

***

### addSprite()

> **addSprite**(`sprite`): `number`

Defined in: [packages/core/src/pipeline/SpriteBatch.ts:189](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/pipeline/SpriteBatch.ts#L189)

Add a sprite to the batch.

#### Parameters

##### sprite

[`Sprite2D`](/api/classes/sprite2d/)

#### Returns

`number`

The index of the sprite in the batch, or -1 if batch is full

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

`InstancedMesh.applyMatrix4`

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

`InstancedMesh.applyQuaternion`

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

`InstancedMesh.attach`

***

### clear()

> **clear**(): `this`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/Object3D.d.ts:533

Removes all child objects.

#### Returns

`this`

#### Inherited from

`InstancedMesh.clear`

***

### clearSprites()

> **clearSprites**(): `void`

Defined in: [packages/core/src/pipeline/SpriteBatch.ts:208](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/pipeline/SpriteBatch.ts#L208)

Clear all sprites from the batch.

#### Returns

`void`

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

`InstancedMesh.clone`

***

### computeBoundingBox()

> **computeBoundingBox**(): `void`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/objects/InstancedMesh.d.ts:107

Computes the bounding box of the instanced mesh, and updates the .boundingBox attribute. The bounding box
is not computed by the engine; it must be computed by your app. You may need to recompute the bounding box if an
instance is transformed via .setMatrixAt().

#### Returns

`void`

#### Inherited from

`InstancedMesh.computeBoundingBox`

***

### computeBoundingSphere()

> **computeBoundingSphere**(): `void`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/objects/InstancedMesh.d.ts:114

Computes the bounding sphere of the instanced mesh, and updates the .boundingSphere attribute. The engine
automatically computes the bounding sphere when it is needed, e.g., for ray casting or view frustum culling. You
may need to recompute the bounding sphere if an instance is transformed via [page:.setMatrixAt]().

#### Returns

`void`

#### Inherited from

`InstancedMesh.computeBoundingSphere`

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

`InstancedMesh.copy`

***

### dispatchEvent()

> **dispatchEvent**\<`T`\>(`event`): `void`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/EventDispatcher.d.ts:81

Fire an event type.

#### Type Parameters

##### T

`T` *extends* keyof [`InstancedMeshEventMap`](https://github.com/mrdoob/three.js/tree/dev/src)

#### Parameters

##### event

[`BaseEvent`](https://github.com/mrdoob/three.js/tree/dev/src)\<`T`\> & [`InstancedMeshEventMap`](https://github.com/mrdoob/three.js/tree/dev/src)\[`T`\]

The event that gets fired.

#### Returns

`void`

#### Inherited from

`InstancedMesh.dispatchEvent`

***

### dispose()

> **dispose**(): `this`

Defined in: [packages/core/src/pipeline/SpriteBatch.ts:335](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/pipeline/SpriteBatch.ts#L335)

Dispose of resources.

#### Returns

`this`

#### Overrides

`InstancedMesh.dispose`

***

### getColorAt()

> **getColorAt**(`index`, `color`): `void`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/objects/InstancedMesh.d.ts:121

Get the color of the defined instance.

#### Parameters

##### index

`number`

The index of an instance. Values have to be in the range `[0, count]`. Expects a `Integer`

##### color

[`Color`](https://github.com/mrdoob/three.js/blob/dev/src/math/Color.js)

This color object will be set to the color of the defined instance.

#### Returns

`void`

#### Inherited from

`InstancedMesh.getColorAt`

***

### getMatrixAt()

> **getMatrixAt**(`index`, `matrix`): `void`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/objects/InstancedMesh.d.ts:137

Get the local transformation matrix of the defined instance.

#### Parameters

##### index

`number`

The index of an instance Values have to be in the range `[0, count]`. Expects a `Integer`

##### matrix

[`Matrix4`](https://github.com/mrdoob/three.js/blob/dev/src/math/Matrix4.js)

This 4x4 matrix will be set to the local transformation matrix of the defined instance.

#### Returns

`void`

#### Inherited from

`InstancedMesh.getMatrixAt`

***

### getMorphAt()

> **getMorphAt**(`index`, `mesh`): `void`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/objects/InstancedMesh.d.ts:144

Get the morph target weights of the defined instance.

#### Parameters

##### index

`number`

The index of an instance. Values have to be in the range [0, count].

##### mesh

[`Mesh`](https://github.com/mrdoob/three.js/blob/dev/src/objects/Mesh.js)

The .morphTargetInfluences property of this mesh will be filled with the morph target weights of the defined instance.

#### Returns

`void`

#### Inherited from

`InstancedMesh.getMorphAt`

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

`InstancedMesh.getObjectById`

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

`InstancedMesh.getObjectByName`

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

`InstancedMesh.getObjectByProperty`

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

`InstancedMesh.getObjectsByProperty`

***

### getSprites()

> **getSprites**(): readonly [`Sprite2D`](/api/classes/sprite2d/)[]

Defined in: [packages/core/src/pipeline/SpriteBatch.ts:328](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/pipeline/SpriteBatch.ts#L328)

Get sprites in this batch.

#### Returns

readonly [`Sprite2D`](/api/classes/sprite2d/)[]

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

`InstancedMesh.getVertexPosition`

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

`InstancedMesh.getWorldDirection`

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

`InstancedMesh.getWorldPosition`

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

`InstancedMesh.getWorldQuaternion`

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

`InstancedMesh.getWorldScale`

***

### hasEventListener()

> **hasEventListener**\<`T`\>(`type`, `listener`): `boolean`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/EventDispatcher.d.ts:62

Checks if listener is added to an event type.

#### Type Parameters

##### T

`T` *extends* keyof [`InstancedMeshEventMap`](https://github.com/mrdoob/three.js/tree/dev/src)

#### Parameters

##### type

`T`

The type of event to listen to.

##### listener

[`EventListener`](https://github.com/mrdoob/three.js/tree/dev/src)\<[`InstancedMeshEventMap`](https://github.com/mrdoob/three.js/tree/dev/src)\[`T`\], `T`, `SpriteBatch`\>

The function that gets called when the event is fired.

#### Returns

`boolean`

#### Inherited from

`InstancedMesh.hasEventListener`

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

`InstancedMesh.localToWorld`

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

`InstancedMesh.lookAt`

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

`InstancedMesh.lookAt`

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

`InstancedMesh.onAfterRender`

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

`InstancedMesh.onAfterShadow`

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

`InstancedMesh.onBeforeRender`

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

`InstancedMesh.onBeforeShadow`

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

`InstancedMesh.raycast`

***

### rebuild()

> **rebuild**(): `void`

Defined in: [packages/core/src/pipeline/SpriteBatch.ts:219](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/pipeline/SpriteBatch.ts#L219)

Rebuild the batch from current sprites.
Call after sprites have been modified.

#### Returns

`void`

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

`InstancedMesh.remove`

***

### removeEventListener()

> **removeEventListener**\<`T`\>(`type`, `listener`): `void`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/EventDispatcher.d.ts:72

Removes a listener from an event type.

#### Type Parameters

##### T

`T` *extends* keyof [`InstancedMeshEventMap`](https://github.com/mrdoob/three.js/tree/dev/src)

#### Parameters

##### type

`T`

The type of the listener that gets removed.

##### listener

[`EventListener`](https://github.com/mrdoob/three.js/tree/dev/src)\<[`InstancedMeshEventMap`](https://github.com/mrdoob/three.js/tree/dev/src)\[`T`\], `T`, `SpriteBatch`\>

The listener function that gets removed.

#### Returns

`void`

#### Inherited from

`InstancedMesh.removeEventListener`

***

### removeFromParent()

> **removeFromParent**(): `this`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/Object3D.d.ts:528

Removes this object from its current parent.

#### Returns

`this`

#### Inherited from

`InstancedMesh.removeFromParent`

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

`InstancedMesh.rotateOnAxis`

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

`InstancedMesh.rotateOnWorldAxis`

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

`InstancedMesh.rotateX`

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

`InstancedMesh.rotateY`

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

`InstancedMesh.rotateZ`

***

### setColorAt()

> **setColorAt**(`index`, `color`): `void`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/objects/InstancedMesh.d.ts:130

Sets the given color to the defined instance

#### Parameters

##### index

`number`

The index of an instance. Values have to be in the range `[0, count]`. Expects a `Integer`

##### color

[`Color`](https://github.com/mrdoob/three.js/blob/dev/src/math/Color.js)

The color of a single instance.

#### Returns

`void`

#### Remarks

Make sure you set [.instanceColor.needsUpdate()](https://github.com/mrdoob/three.js/tree/dev/src) to `true` after updating all the colors.

#### Inherited from

`InstancedMesh.setColorAt`

***

### setMatrixAt()

> **setMatrixAt**(`index`, `matrix`): `void`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/objects/InstancedMesh.d.ts:154

Sets the given local transformation matrix to the defined instance. Make sure you set
[.instanceMatrix.needsUpdate()](https://github.com/mrdoob/three.js/tree/dev/src) flag to `true` after updating all
the matrices.
Negatively scaled matrices are not supported.

#### Parameters

##### index

`number`

The index of an instance. Values have to be in the range `[0, count]`. Expects a `Integer`

##### matrix

[`Matrix4`](https://github.com/mrdoob/three.js/blob/dev/src/math/Matrix4.js)

A 4x4 matrix representing the local transformation of a single instance.

#### Returns

`void`

#### Inherited from

`InstancedMesh.setMatrixAt`

***

### setMorphAt()

> **setMorphAt**(`index`, `mesh`): `void`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/objects/InstancedMesh.d.ts:162

Sets the morph target weights to the defined instance. Make sure you set .morphTexture.needsUpdate
to true after updating all the influences.

#### Parameters

##### index

`number`

The index of an instance. Values have to be in the range [0, count].

##### mesh

[`Mesh`](https://github.com/mrdoob/three.js/blob/dev/src/objects/Mesh.js)

A mesh with .morphTargetInfluences property containing the morph target weights of a single instance.

#### Returns

`void`

#### Inherited from

`InstancedMesh.setMorphAt`

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

`InstancedMesh.setRotationFromAxisAngle`

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

`InstancedMesh.setRotationFromEuler`

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

`InstancedMesh.setRotationFromMatrix`

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

`InstancedMesh.setRotationFromQuaternion`

***

### toJSON()

> **toJSON**(`meta?`): [`InstancedMeshJSON`](https://github.com/mrdoob/three.js/tree/dev/src)

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/objects/InstancedMesh.d.ts:178

#### Parameters

##### meta?

[`JSONMeta`](https://github.com/mrdoob/three.js/tree/dev/src)

#### Returns

[`InstancedMeshJSON`](https://github.com/mrdoob/three.js/tree/dev/src)

#### Inherited from

`InstancedMesh.toJSON`

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

`InstancedMesh.translateOnAxis`

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

`InstancedMesh.translateX`

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

`InstancedMesh.translateY`

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

`InstancedMesh.translateZ`

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

`InstancedMesh.traverse`

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

`InstancedMesh.traverseAncestors`

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

`InstancedMesh.traverseVisible`

***

### updateMatrix()

> **updateMatrix**(): `void`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/Object3D.d.ts:637

Updates local transform.

#### Returns

`void`

#### Inherited from

`InstancedMesh.updateMatrix`

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

`InstancedMesh.updateMatrixWorld`

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

`InstancedMesh.updateWorldMatrix`

***

### upload()

> **upload**(): `void`

Defined in: [packages/core/src/pipeline/SpriteBatch.ts:295](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/pipeline/SpriteBatch.ts#L295)

Upload buffer data to GPU.
Call after adding/modifying sprites and before rendering.

#### Returns

`void`

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

`InstancedMesh.worldToLocal`
