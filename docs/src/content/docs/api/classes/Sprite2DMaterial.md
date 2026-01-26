---
editUrl: false
next: false
prev: false
title: "Sprite2DMaterial"
---

Defined in: [packages/core/src/materials/Sprite2DMaterial.ts:29](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/materials/Sprite2DMaterial.ts#L29)

TSL-based material for 2D sprites.

UNIFIED API: This material reads from instance attributes, which works for:
- Single sprites (Sprite2D sets attributes on its geometry)
- Batched sprites (SpriteBatch sets instanced attributes)

Core instance attributes (always present):
- instanceUV (vec4): frame UV (x, y, width, height) in atlas
- instanceColor (vec4): tint color and alpha (r, g, b, a)
- instanceFlip (vec2): flip flags (x, y) where 1 = normal, -1 = flipped

Custom instance attributes can be added via addInstanceFloat(), etc.

## Extends

- [`MeshBasicNodeMaterial`](https://github.com/mrdoob/three.js/tree/dev/src)

## Constructors

### Constructor

> **new Sprite2DMaterial**(`options`): `Sprite2DMaterial`

Defined in: [packages/core/src/materials/Sprite2DMaterial.ts:43](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/materials/Sprite2DMaterial.ts#L43)

#### Parameters

##### options

[`Sprite2DMaterialOptions`](/api/interfaces/sprite2dmaterialoptions/) = `{}`

#### Returns

`Sprite2DMaterial`

#### Overrides

`MeshBasicNodeMaterial.constructor`

## Properties

### allowOverride

> **allowOverride**: `boolean`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/Material.d.ts:325

Whether it's possible to override the material with [Scene#overrideMaterial](https://github.com/mrdoob/three.js/tree/dev/src) or not.

#### Default

```ts
true
```

#### Inherited from

`MeshBasicNodeMaterial.allowOverride`

***

### alphaHash

> **alphaHash**: `boolean`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/Material.d.ts:87

Enables alpha hashed transparency, an alternative to [Material#transparent](/api/classes/sprite2dmaterial/#transparent) or
[Material#alphaTest](/api/classes/sprite2dmaterial/#alphatest). The material will not be rendered if opacity is lower than
a random threshold. Randomization introduces some grain or noise, but approximates alpha
blending without the associated problems of sorting. Using TAA can reduce the resulting noise.

#### Default

```ts
false
```

#### Inherited from

`MeshBasicNodeMaterial.alphaHash`

***

### alphaMap

> **alphaMap**: [`Texture`](https://github.com/mrdoob/three.js/blob/dev/src/textures/Texture.js)\<`unknown`\> \| `null`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/MeshBasicMaterial.d.ts:67

The alpha map is a grayscale texture that controls the opacity across the
surface (black: fully transparent; white: fully opaque).

Only the color of the texture is used, ignoring the alpha channel if one
exists. For RGB and RGBA textures, the renderer will use the green channel
when sampling this texture due to the extra bit of precision provided for
green in DXT-compressed and uncompressed RGB 565 formats. Luminance-only and
luminance/alpha textures will also still work as expected.

#### Default

```ts
null
```

#### Inherited from

`MeshBasicNodeMaterial.alphaMap`

***

### alphaTestNode

> **alphaTestNode**: [`Node`](https://github.com/mrdoob/three.js/tree/dev/src) \| `null`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/nodes/NodeMaterial.d.ts:149

The alpha test of node materials is by default inferred from the `alphaTest`
property. This node property allows to overwrite the default and define the
alpha test with a node instead.

If you don't want to overwrite the alpha test but modify the existing
value instead, use materialAlphaTest.

#### Default

```ts
null
```

#### Inherited from

`MeshBasicNodeMaterial.alphaTestNode`

***

### alphaToCoverage

> **alphaToCoverage**: `boolean`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/Material.d.ts:301

Whether alpha to coverage should be enabled or not. Can only be used with MSAA-enabled contexts
(meaning when the renderer was created with *antialias* parameter set to `true`). Enabling this
will smooth aliasing on clip plane edges and alphaTest-clipped edges.

#### Default

```ts
false
```

#### Inherited from

`MeshBasicNodeMaterial.alphaToCoverage`

***

### aoMap

> **aoMap**: [`Texture`](https://github.com/mrdoob/three.js/blob/dev/src/textures/Texture.js)\<`unknown`\> \| `null`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/MeshBasicMaterial.d.ts:40

The red channel of this texture is used as the ambient occlusion map.
Requires a second set of UVs.

#### Default

```ts
null
```

#### Inherited from

`MeshBasicNodeMaterial.aoMap`

***

### aoMapIntensity

> **aoMapIntensity**: `number`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/MeshBasicMaterial.d.ts:48

Intensity of the ambient occlusion effect. Range is `[0,1]`, where `0`
disables ambient occlusion. Where intensity is `1` and the AO map's
red channel is also `1`, ambient light is fully occluded on a surface.

#### Default

```ts
1
```

#### Inherited from

`MeshBasicNodeMaterial.aoMapIntensity`

***

### aoNode

> **aoNode**: [`Node`](https://github.com/mrdoob/three.js/tree/dev/src) \| `null`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/nodes/NodeMaterial.d.ts:72

The lighting of node materials might be influenced by ambient occlusion.
The default AO is inferred from an ambient occlusion map assigned to `aoMap`
and the respective `aoMapIntensity`. This node property allows to overwrite
the default and define the ambient occlusion with a custom node instead.

If you don't want to overwrite the diffuse color but modify the existing
values instead, use materialAO.

#### Default

```ts
null
```

#### Inherited from

`MeshBasicNodeMaterial.aoNode`

***

### backdropAlphaNode

> **backdropAlphaNode**: [`Node`](https://github.com/mrdoob/three.js/tree/dev/src) \| `null`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/nodes/NodeMaterial.d.ts:138

This node allows to modulate the influence of `backdropNode` to the outgoing light.

#### Default

```ts
null
```

#### Inherited from

`MeshBasicNodeMaterial.backdropAlphaNode`

***

### backdropNode

> **backdropNode**: [`Node`](https://github.com/mrdoob/three.js/tree/dev/src) \| `null`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/nodes/NodeMaterial.d.ts:132

This node can be used to implement a variety of filter-like effects. The idea is
to store the current rendering into a texture e.g. via `viewportSharedTexture()`, use it
to create an arbitrary effect and then assign the node composition to this property.
Everything behind the object using this material will now be affected by a filter.

```js
const material = new NodeMaterial()
material.transparent = true;

// everything behind the object will be monochromatic
material.backdropNode = saturation( viewportSharedTexture().rgb, 0 );
```

Backdrop computations are part of the lighting so only lit materials can use this property.

#### Default

```ts
null
```

#### Inherited from

`MeshBasicNodeMaterial.backdropNode`

***

### batchId

> `readonly` **batchId**: `number`

Defined in: [packages/core/src/materials/Sprite2DMaterial.ts:33](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/materials/Sprite2DMaterial.ts#L33)

Unique batch ID for this material instance (used for batching).

***

### blendAlpha

> **blendAlpha**: `number`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/Material.d.ts:139

Represents the alpha value of the constant blend color.

This property has only an effect when using custom blending with `ConstantAlpha` or `OneMinusConstantAlpha`.

#### Default

```ts
0
```

#### Inherited from

`MeshBasicNodeMaterial.blendAlpha`

***

### blendColor

> **blendColor**: [`Color`](https://github.com/mrdoob/three.js/blob/dev/src/math/Color.js)

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/Material.d.ts:131

Represents the RGB values of the constant blend color.

This property has only an effect when using custom blending with `ConstantColor` or `OneMinusConstantColor`.

#### Default

```ts
(0,0,0)
```

#### Inherited from

`MeshBasicNodeMaterial.blendColor`

***

### blendDst

> **blendDst**: [`BlendingDstFactor`](https://github.com/mrdoob/three.js/tree/dev/src)

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/Material.d.ts:99

Defines the blending destination factor.

#### Default

```ts
OneMinusSrcAlphaFactor
```

#### Inherited from

`MeshBasicNodeMaterial.blendDst`

***

### blendDstAlpha

> **blendDstAlpha**: [`BlendingDstFactor`](https://github.com/mrdoob/three.js/tree/dev/src) \| `null`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/Material.d.ts:117

Defines the blending destination alpha factor.

#### Default

```ts
null
```

#### Inherited from

`MeshBasicNodeMaterial.blendDstAlpha`

***

### blendEquation

> **blendEquation**: [`BlendingEquation`](https://github.com/mrdoob/three.js/tree/dev/src)

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/Material.d.ts:105

Defines the blending equation.

#### Default

```ts
AddEquation
```

#### Inherited from

`MeshBasicNodeMaterial.blendEquation`

***

### blendEquationAlpha

> **blendEquationAlpha**: [`BlendingEquation`](https://github.com/mrdoob/three.js/tree/dev/src) \| `null`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/Material.d.ts:123

Defines the blending equation of the alpha channel.

#### Default

```ts
null
```

#### Inherited from

`MeshBasicNodeMaterial.blendEquationAlpha`

***

### blending

> **blending**: [`Blending`](https://github.com/mrdoob/three.js/tree/dev/src)

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/Material.d.ts:42

Defines the blending type of the material.

It must be set to `CustomBlending` if custom blending properties like
[Material#blendSrc](/api/classes/sprite2dmaterial/#blendsrc), [Material#blendDst](/api/classes/sprite2dmaterial/#blenddst) or [Material#blendEquation](/api/classes/sprite2dmaterial/#blendequation)
should have any effect.

#### Default

```ts
NormalBlending
```

#### Inherited from

`MeshBasicNodeMaterial.blending`

***

### blendSrc

> **blendSrc**: [`BlendingSrcFactor`](https://github.com/mrdoob/three.js/tree/dev/src)

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/Material.d.ts:93

Defines the blending source factor.

#### Default

```ts
SrcAlphaFactor
```

#### Inherited from

`MeshBasicNodeMaterial.blendSrc`

***

### blendSrcAlpha

> **blendSrcAlpha**: [`BlendingSrcFactor`](https://github.com/mrdoob/three.js/tree/dev/src) \| `null`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/Material.d.ts:111

Defines the blending source alpha factor.

#### Default

```ts
null
```

#### Inherited from

`MeshBasicNodeMaterial.blendSrcAlpha`

***

### castShadowNode

> **castShadowNode**: [`Node`](https://github.com/mrdoob/three.js/tree/dev/src) \| `null`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/nodes/NodeMaterial.d.ts:242

This node can be used to influence how an object using this node material
casts shadows. To apply a color to shadows, you can simply do:

```js
material.castShadowNode = vec4( 1, 0, 0, 1 );
```

Which can be nice to fake colored shadows of semi-transparent objects. It
is also common to use the property with `Fn` function so checks are performed
per fragment.

```js
materialCustomShadow.castShadowNode = Fn( () => {
	hash( vertexIndex ).greaterThan( 0.5 ).discard();
	return materialColor;
} )();
 ```

#### Default

```ts
null
```

#### Inherited from

`MeshBasicNodeMaterial.castShadowNode`

***

### castShadowPositionNode

> **castShadowPositionNode**: [`Node`](https://github.com/mrdoob/three.js/tree/dev/src) \| `null`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/nodes/NodeMaterial.d.ts:205

Allows to overwrite the geometry position used for shadow map projection which
is by default positionLocal, the vertex position in local space.

#### Default

```ts
null
```

#### Inherited from

`MeshBasicNodeMaterial.castShadowPositionNode`

***

### clipIntersection

> **clipIntersection**: `boolean`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/Material.d.ts:230

Changes the behavior of clipping planes so that only their intersection is
clipped, rather than their union.

#### Default

```ts
false
```

#### Inherited from

`MeshBasicNodeMaterial.clipIntersection`

***

### clippingPlanes

> **clippingPlanes**: [`Plane`](https://github.com/mrdoob/three.js/tree/dev/src)[] \| `null`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/Material.d.ts:223

User-defined clipping planes specified as THREE.Plane objects in world
space. These planes apply to the objects this material is attached to.
Points in space whose signed distance to the plane is negative are clipped
(not rendered). This requires [WebGLRenderer#localClippingEnabled](https://github.com/mrdoob/three.js/tree/dev/src) to
be `true`.

#### Default

```ts
null
```

#### Inherited from

`MeshBasicNodeMaterial.clippingPlanes`

***

### clipShadows

> **clipShadows**: `boolean`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/Material.d.ts:237

Defines whether to clip shadows according to the clipping planes specified
on this material.

#### Default

```ts
false
```

#### Inherited from

`MeshBasicNodeMaterial.clipShadows`

***

### color

> **color**: [`Color`](https://github.com/mrdoob/three.js/blob/dev/src/math/Color.js)

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/MeshBasicMaterial.d.ts:13

Color of the material.

#### Default

```ts
(1,1,1)
```

#### Inherited from

`MeshBasicNodeMaterial.color`

***

### colorNode

> **colorNode**: [`Node`](https://github.com/mrdoob/three.js/tree/dev/src) \| `null`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/nodes/NodeMaterial.d.ts:91

The diffuse color of node materials is by default inferred from the
`color` and `map` properties. This node property allows to overwrite the default
and define the diffuse color with a node instead.

```js
material.colorNode = color( 0xff0000 ); // define red color
```

If you don't want to overwrite the diffuse color but modify the existing
values instead, use materialColor.

```js
material.colorNode = materialColor.mul( color( 0xff0000 ) ); // give diffuse colors a red tint
```

#### Default

```ts
null
```

#### Inherited from

`MeshBasicNodeMaterial.colorNode`

***

### colorWrite

> **colorWrite**: `boolean`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/Material.d.ts:257

Whether to render the material's color.

This can be used in conjunction with Object3D#renderOder to create invisible
objects that occlude other objects.

#### Default

```ts
true
```

#### Inherited from

`MeshBasicNodeMaterial.colorWrite`

***

### combine

> **combine**: [`Combine`](https://github.com/mrdoob/three.js/tree/dev/src)

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/MeshBasicMaterial.d.ts:88

How to combine the result of the surface's color with the environment map, if any.

When set to `MixOperation`, the [MeshBasicMaterial#reflectivity](/api/classes/sprite2dmaterial/#reflectivity) is used to
blend between the two colors.

#### Default

```ts
MultiplyOperation
```

#### Inherited from

`MeshBasicNodeMaterial.combine`

***

### contextNode

> **contextNode**: [`ContextNode`](https://github.com/mrdoob/three.js/tree/dev/src) \| `null`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/nodes/NodeMaterial.d.ts:281

This node can be used as a global context management component for this material.

#### Default

```ts
null
```

#### Inherited from

`MeshBasicNodeMaterial.contextNode`

***

### defines?

> `optional` **defines**: `Record`\<`string`, `unknown`\>

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/Material.d.ts:551

#### Inherited from

[`TileChunkMaterial`](/api/classes/tilechunkmaterial/).[`defines`](/api/classes/tilechunkmaterial/#defines)

***

### depthFunc

> **depthFunc**: [`DepthModes`](https://github.com/mrdoob/three.js/tree/dev/src)

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/Material.d.ts:145

Defines the depth function.

#### Default

```ts
LessEqualDepth
```

#### Inherited from

`MeshBasicNodeMaterial.depthFunc`

***

### depthNode

> **depthNode**: [`Node`](https://github.com/mrdoob/three.js/tree/dev/src) \| `null`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/nodes/NodeMaterial.d.ts:190

Allows to overwrite depth values in the fragment shader.

#### Default

```ts
null
```

#### Inherited from

`MeshBasicNodeMaterial.depthNode`

***

### depthTest

> **depthTest**: `boolean`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/Material.d.ts:152

Whether to have depth test enabled when rendering this material.
When the depth test is disabled, the depth write will also be implicitly disabled.

#### Default

```ts
true
```

#### Inherited from

`MeshBasicNodeMaterial.depthTest`

***

### depthWrite

> **depthWrite**: `boolean`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/Material.d.ts:161

Whether rendering this material has any effect on the depth buffer.

When drawing 2D overlays it can be useful to disable the depth writing in
order to layer several things together without creating z-index artifacts.

#### Default

```ts
true
```

#### Inherited from

`MeshBasicNodeMaterial.depthWrite`

***

### dithering

> **dithering**: `boolean`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/Material.d.ts:293

Whether to apply dithering to the color to remove the appearance of banding.

#### Default

```ts
false
```

#### Inherited from

`MeshBasicNodeMaterial.dithering`

***

### envMap

> **envMap**: [`Texture`](https://github.com/mrdoob/three.js/blob/dev/src/textures/Texture.js)\<`unknown`\> \| `null`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/MeshBasicMaterial.d.ts:73

The environment map.

#### Default

```ts
null
```

#### Inherited from

`MeshBasicNodeMaterial.envMap`

***

### envMapRotation

> **envMapRotation**: [`Euler`](https://github.com/mrdoob/three.js/blob/dev/src/math/Euler.js)

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/MeshBasicMaterial.d.ts:79

The rotation of the environment map in radians.

#### Default

```ts
(0,0,0)
```

#### Inherited from

`MeshBasicNodeMaterial.envMapRotation`

***

### envNode

> **envNode**: [`Node`](https://github.com/mrdoob/three.js/tree/dev/src) \| `null`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/nodes/NodeMaterial.d.ts:60

The environment of node materials can be defined by an environment
map assigned to the `envMap` property or by `Scene.environment`
if the node material is a PBR material. This node property allows to overwrite
the default behavior and define the environment with a custom node.

```js
material.envNode = pmremTexture( renderTarget.texture );
```

#### Default

```ts
null
```

#### Inherited from

`MeshBasicNodeMaterial.envNode`

***

### fog

> **fog**: `boolean`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/nodes/NodeMaterial.d.ts:17

Whether this material is affected by fog or not.

#### Default

```ts
true
```

#### Inherited from

`MeshBasicNodeMaterial.fog`

***

### forceSinglePass

> **forceSinglePass**: `boolean`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/Material.d.ts:319

Whether double-sided, transparent objects should be rendered with a single pass or not.

The engine renders double-sided, transparent objects with two draw calls (back faces first,
then front faces) to mitigate transparency artifacts. There are scenarios however where this
approach produces no quality gains but still doubles draw calls e.g. when rendering flat
vegetation like grass sprites. In these cases, set the `forceSinglePass` flag to `true` to
disable the two pass rendering to avoid performance issues.

#### Default

```ts
false
```

#### Inherited from

`MeshBasicNodeMaterial.forceSinglePass`

***

### fragmentNode

> **fragmentNode**: [`Node`](https://github.com/mrdoob/three.js/tree/dev/src) \| `null`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/nodes/NodeMaterial.d.ts:267

This node property can be used if you need complete freedom in implementing
the fragment shader. Assigning a node will replace the built-in material
logic used in the fragment stage.

#### Default

```ts
null
```

#### Inherited from

`MeshBasicNodeMaterial.fragmentNode`

***

### geometryNode

> **geometryNode**: () => [`Node`](https://github.com/mrdoob/three.js/tree/dev/src) \| `null`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/nodes/NodeMaterial.d.ts:184

This node property is intended for logic which modifies geometry data once or per animation step.
Apps usually place such logic randomly in initialization routines or in the animation loop.
`geometryNode` is intended as a dedicated API so there is an intended spot where geometry modifications
can be implemented.

The idea is to assign a `Fn` definition that holds the geometry modification logic. A typical example
would be a GPU based particle system that provides a node material for usage on app level. The particle
simulation would be implemented as compute shaders and managed inside a `Fn` function. This function is
eventually assigned to `geometryNode`.

#### Default

```ts
null
```

#### Inherited from

`MeshBasicNodeMaterial.geometryNode`

***

### hardwareClipping

> **hardwareClipping**: `boolean`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/nodes/NodeMaterial.d.ts:31

Whether this material uses hardware clipping or not.
This property is managed by the engine and should not be
modified by apps.

#### Default

```ts
false
```

#### Inherited from

`MeshBasicNodeMaterial.hardwareClipping`

***

### isMaterial

> `readonly` **isMaterial**: `boolean`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/Material.d.ts:535

This flag can be used for type testing.

#### Default

```ts
true
```

#### Inherited from

`MeshBasicNodeMaterial.isMaterial`

***

### isMeshBasicNodeMaterial

> `readonly` **isMeshBasicNodeMaterial**: `boolean`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/nodes/MeshBasicNodeMaterial.d.ts:35

This flag can be used for type testing.

#### Default

```ts
true
```

#### Inherited from

`MeshBasicNodeMaterial.isMeshBasicNodeMaterial`

***

### isNodeMaterial

> `readonly` **isNodeMaterial**: `boolean`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/nodes/NodeMaterial.d.ts:299

This flag can be used for type testing.

#### Default

```ts
true
```

#### Inherited from

`MeshBasicNodeMaterial.isNodeMaterial`

***

### lightMap

> **lightMap**: [`Texture`](https://github.com/mrdoob/three.js/blob/dev/src/textures/Texture.js)\<`unknown`\> \| `null`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/MeshBasicMaterial.d.ts:27

The light map. Requires a second set of UVs.

#### Default

```ts
null
```

#### Inherited from

`MeshBasicNodeMaterial.lightMap`

***

### lightMapIntensity

> **lightMapIntensity**: `number`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/MeshBasicMaterial.d.ts:33

Intensity of the baked light.

#### Default

```ts
1
```

#### Inherited from

`MeshBasicNodeMaterial.lightMapIntensity`

***

### lights

> **lights**: `boolean`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/nodes/NodeMaterial.d.ts:23

Whether this material is affected by lights or not.

#### Default

```ts
false
```

#### Inherited from

`MeshBasicNodeMaterial.lights`

***

### lightsNode

> **lightsNode**: [`LightsNode`](https://github.com/mrdoob/three.js/tree/dev/src) \| `null`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/nodes/NodeMaterial.d.ts:47

Node materials which set their `lights` property to `true`
are affected by all lights of the scene. Sometimes selective
lighting is wanted which means only _some_ lights in the scene
affect a material. This can be achieved by creating an instance
of [LightsNode](https://github.com/mrdoob/three.js/tree/dev/src) with a list of selective
lights and assign the node to this property.

```js
const customLightsNode = lights( [ light1, light2 ] );
material.lightsNode = customLightsNode;
```

#### Default

```ts
null
```

#### Inherited from

`MeshBasicNodeMaterial.lightsNode`

***

### map

> **map**: [`Texture`](https://github.com/mrdoob/three.js/blob/dev/src/textures/Texture.js)\<`unknown`\> \| `null`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/MeshBasicMaterial.d.ts:21

The color map. May optionally include an alpha channel, typically combined
with [Material#transparent](/api/classes/sprite2dmaterial/#transparent) or [Material#alphaTest](/api/classes/sprite2dmaterial/#alphatest). The texture map
color is modulated by the diffuse `color`.

#### Default

```ts
null
```

#### Inherited from

`MeshBasicNodeMaterial.map`

***

### maskNode

> **maskNode**: [`Node`](https://github.com/mrdoob/three.js/tree/dev/src) \| `null`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/nodes/NodeMaterial.d.ts:155

Discards the fragment if the mask value is `false`.

#### Default

```ts
null
```

#### Inherited from

`MeshBasicNodeMaterial.maskNode`

***

### mrtNode

> **mrtNode**: [`MRTNode`](https://github.com/mrdoob/three.js/tree/dev/src) \| `null`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/nodes/NodeMaterial.d.ts:259

MRT configuration is done on renderer or pass level. This node allows to
overwrite what values are written into MRT targets on material level. This
can be useful for implementing selective FX features that should only affect
specific objects.

#### Default

```ts
null
```

#### Inherited from

`MeshBasicNodeMaterial.mrtNode`

***

### name

> **name**: `string`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/Material.d.ts:32

The name of the material.

#### Inherited from

`MeshBasicNodeMaterial.name`

***

### normalNode

> **normalNode**: [`Node`](https://github.com/mrdoob/three.js/tree/dev/src) \| `null`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/nodes/NodeMaterial.d.ts:102

The normals of node materials are by default inferred from the `normalMap`/`normalScale`
or `bumpMap`/`bumpScale` properties. This node property allows to overwrite the default
and define the normals with a node instead.

If you don't want to overwrite the normals but modify the existing values instead,
use materialNormal.

#### Default

```ts
null
```

#### Inherited from

`MeshBasicNodeMaterial.normalNode`

***

### opacity

> **opacity**: `number`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/Material.d.ts:67

Defines how transparent the material is.
A value of `0.0` indicates fully transparent, `1.0` is fully opaque.

If the [Material#transparent](/api/classes/sprite2dmaterial/#transparent) is not set to `true`,
the material will remain fully opaque and this value will only affect its color.

#### Default

```ts
1
```

#### Inherited from

`MeshBasicNodeMaterial.opacity`

***

### opacityNode

> **opacityNode**: [`Node`](https://github.com/mrdoob/three.js/tree/dev/src) \| `null`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/nodes/NodeMaterial.d.ts:113

The opacity of node materials is by default inferred from the `opacity`
and `alphaMap` properties. This node property allows to overwrite the default
and define the opacity with a node instead.

If you don't want to overwrite the opacity but modify the existing
value instead, use materialOpacity.

#### Default

```ts
null
```

#### Inherited from

`MeshBasicNodeMaterial.opacityNode`

***

### outputNode

> **outputNode**: [`Node`](https://github.com/mrdoob/three.js/tree/dev/src) \| `null`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/nodes/NodeMaterial.d.ts:250

This node can be used to define the final output of the material.

TODO: Explain the differences to `fragmentNode`.

#### Default

```ts
null
```

#### Inherited from

`MeshBasicNodeMaterial.outputNode`

***

### polygonOffset

> **polygonOffset**: `boolean`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/Material.d.ts:275

Whether to use polygon offset or not. When enabled, each fragment's depth value will
be offset after it is interpolated from the depth values of the appropriate vertices.
The offset is added before the depth test is performed and before the value is written
into the depth buffer.

Can be useful for rendering hidden-line images, for applying decals to surfaces, and for
rendering solids with highlighted edges.

#### Default

```ts
false
```

#### Inherited from

`MeshBasicNodeMaterial.polygonOffset`

***

### polygonOffsetFactor

> **polygonOffsetFactor**: `number`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/Material.d.ts:281

Specifies a scale factor that is used to create a variable depth offset for each polygon.

#### Default

```ts
0
```

#### Inherited from

`MeshBasicNodeMaterial.polygonOffsetFactor`

***

### polygonOffsetUnits

> **polygonOffsetUnits**: `number`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/Material.d.ts:287

Is multiplied by an implementation-specific value to create a constant depth offset.

#### Default

```ts
0
```

#### Inherited from

`MeshBasicNodeMaterial.polygonOffsetUnits`

***

### positionNode

> **positionNode**: [`Node`](https://github.com/mrdoob/three.js/tree/dev/src) \| `null`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/nodes/NodeMaterial.d.ts:170

The local vertex positions are computed based on multiple factors like the
attribute data, morphing or skinning. This node property allows to overwrite
the default and define local vertex positions with nodes instead.

If you don't want to overwrite the vertex positions but modify the existing
values instead, use positionLocal.

```js
material.positionNode = positionLocal.add( displace );
```

#### Default

```ts
null
```

#### Inherited from

`MeshBasicNodeMaterial.positionNode`

***

### precision

> **precision**: `"highp"` \| `"mediump"` \| `"lowp"` \| `null`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/Material.d.ts:263

Override the renderer's default precision for this material.

#### Default

```ts
null
```

#### Inherited from

`MeshBasicNodeMaterial.precision`

***

### premultipliedAlpha

> **premultipliedAlpha**: `boolean`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/Material.d.ts:307

Whether to premultiply the alpha (transparency) value.

#### Default

```ts
false
```

#### Inherited from

`MeshBasicNodeMaterial.premultipliedAlpha`

***

### receivedShadowNode

> **receivedShadowNode**: () => [`Node`](https://github.com/mrdoob/three.js/tree/dev/src) \| `null`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/nodes/NodeMaterial.d.ts:220

This node can be used to influence how an object using this node material
receive shadows.

```js
const totalShadows = float( 1 ).toVar();
material.receivedShadowNode = Fn( ( [ shadow ] ) => {
	totalShadows.mulAssign( shadow );
	//return float( 1 ); // bypass received shadows
	return shadow.mix( color( 0xff0000 ), 1 ); // modify shadow color
} );

@default null

#### Inherited from

`MeshBasicNodeMaterial.receivedShadowNode`

***

### receivedShadowPositionNode

> **receivedShadowPositionNode**: [`Node`](https://github.com/mrdoob/three.js/tree/dev/src) \| `null`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/nodes/NodeMaterial.d.ts:198

Allows to overwrite the position used for shadow map rendering which
is by default positionWorld, the vertex position
in world space.

#### Default

```ts
null
```

#### Inherited from

`MeshBasicNodeMaterial.receivedShadowPositionNode`

***

### reflectivity

> **reflectivity**: `number`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/MeshBasicMaterial.d.ts:95

How much the environment map affects the surface.
The valid range is between `0` (no reflections) and `1` (full reflections).

#### Default

```ts
1
```

#### Inherited from

`MeshBasicNodeMaterial.reflectivity`

***

### refractionRatio

> **refractionRatio**: `number`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/MeshBasicMaterial.d.ts:104

The index of refraction (IOR) of air (approximately 1) divided by the
index of refraction of the material. It is used with environment mapping
modes CubeRefractionMapping and EquirectangularRefractionMapping.
The refraction ratio should not exceed `1`.

#### Default

```ts
0.98
```

#### Inherited from

`MeshBasicNodeMaterial.refractionRatio`

***

### shadowSide

> **shadowSide**: [`Side`](https://github.com/mrdoob/three.js/tree/dev/src) \| `null`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/Material.d.ts:248

Defines which side of faces cast shadows. If `null`, the side casting shadows
is determined as follows:

- When [Material#side](/api/classes/sprite2dmaterial/#side) is set to `FrontSide`, the back side cast shadows.
- When [Material#side](/api/classes/sprite2dmaterial/#side) is set to `BackSide`, the front side cast shadows.
- When [Material#side](/api/classes/sprite2dmaterial/#side) is set to `DoubleSide`, both sides cast shadows.

#### Default

```ts
null
```

#### Inherited from

`MeshBasicNodeMaterial.shadowSide`

***

### side

> **side**: [`Side`](https://github.com/mrdoob/three.js/tree/dev/src)

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/Material.d.ts:48

Defines which side of faces will be rendered - front, back or both.

#### Default

```ts
FrontSide
```

#### Inherited from

`MeshBasicNodeMaterial.side`

***

### specularMap

> **specularMap**: [`Texture`](https://github.com/mrdoob/three.js/blob/dev/src/textures/Texture.js)\<`unknown`\> \| `null`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/MeshBasicMaterial.d.ts:54

Specular map used by the material.

#### Default

```ts
null
```

#### Inherited from

`MeshBasicNodeMaterial.specularMap`

***

### stencilFail

> **stencilFail**: [`StencilOp`](https://github.com/mrdoob/three.js/tree/dev/src)

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/Material.d.ts:191

Which stencil operation to perform when the comparison function returns `false`.

#### Default

```ts
KeepStencilOp
```

#### Inherited from

`MeshBasicNodeMaterial.stencilFail`

***

### stencilFunc

> **stencilFunc**: [`StencilFunc`](https://github.com/mrdoob/three.js/tree/dev/src)

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/Material.d.ts:173

The stencil comparison function to use.

#### Default

```ts
AlwaysStencilFunc
```

#### Inherited from

`MeshBasicNodeMaterial.stencilFunc`

***

### stencilFuncMask

> **stencilFuncMask**: `number`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/Material.d.ts:185

The bit mask to use when comparing against the stencil buffer.

#### Default

```ts
0xff
```

#### Inherited from

`MeshBasicNodeMaterial.stencilFuncMask`

***

### stencilRef

> **stencilRef**: `number`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/Material.d.ts:179

The value to use when performing stencil comparisons or stencil operations.

#### Default

```ts
0
```

#### Inherited from

`MeshBasicNodeMaterial.stencilRef`

***

### stencilWrite

> **stencilWrite**: `boolean`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/Material.d.ts:213

Whether stencil operations are performed against the stencil buffer. In
order to perform writes or comparisons against the stencil buffer this
value must be `true`.

#### Default

```ts
false
```

#### Inherited from

`MeshBasicNodeMaterial.stencilWrite`

***

### stencilWriteMask

> **stencilWriteMask**: `number`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/Material.d.ts:167

The bit mask to use when writing to the stencil buffer.

#### Default

```ts
0xff
```

#### Inherited from

`MeshBasicNodeMaterial.stencilWriteMask`

***

### stencilZFail

> **stencilZFail**: [`StencilOp`](https://github.com/mrdoob/three.js/tree/dev/src)

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/Material.d.ts:198

Which stencil operation to perform when the comparison function returns
`true` but the depth test fails.

#### Default

```ts
KeepStencilOp
```

#### Inherited from

`MeshBasicNodeMaterial.stencilZFail`

***

### stencilZPass

> **stencilZPass**: [`StencilOp`](https://github.com/mrdoob/three.js/tree/dev/src)

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/Material.d.ts:205

Which stencil operation to perform when the comparison function returns
`true` and the depth test passes.

#### Default

```ts
KeepStencilOp
```

#### Inherited from

`MeshBasicNodeMaterial.stencilZPass`

***

### toneMapped

> **toneMapped**: `boolean`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/Material.d.ts:340

Defines whether this material is tone mapped according to the renderer's tone mapping setting.

It is ignored when rendering to a render target or using post processing or when using
`WebGPURenderer`. In all these cases, all materials are honored by tone mapping.

#### Default

```ts
true
```

#### Inherited from

`MeshBasicNodeMaterial.toneMapped`

***

### transparent

> **transparent**: `boolean`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/Material.d.ts:78

Defines whether this material is transparent. This has an effect on
rendering as transparent objects need special treatment and are rendered
after non-transparent objects.

When set to true, the extent to which the material is transparent is
controlled by [Material#opacity](/api/classes/sprite2dmaterial/#opacity).

#### Default

```ts
false
```

#### Inherited from

`MeshBasicNodeMaterial.transparent`

***

### type

> **type**: `string`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/Material.d.ts:544

The type property is used for detecting the object type
in context of serialization/deserialization.

#### Inherited from

`MeshBasicNodeMaterial.type`

***

### userData

> **userData**: `Record`\<`string`, `any`\>

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/Material.d.ts:345

An object that can be used to store custom data about the Material. It
should not hold references to functions as these will not be cloned.

#### Inherited from

`MeshBasicNodeMaterial.userData`

***

### uuid

> `readonly` **uuid**: `string`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/Material.d.ts:539

The UUID of the material.

#### Inherited from

`MeshBasicNodeMaterial.uuid`

***

### version

> `readonly` **version**: `number`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/Material.d.ts:550

This starts at `0` and counts how many times [Material#needsUpdate](https://github.com/mrdoob/three.js/tree/dev/src) is set to `true`.

#### Default

```ts
0
```

#### Inherited from

`MeshBasicNodeMaterial.version`

***

### vertexColors

> **vertexColors**: `boolean`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/Material.d.ts:57

If set to `true`, vertex colors should be used.

The engine supports RGB and RGBA vertex colors depending on whether a three (RGB) or
four (RGBA) component color buffer attribute is used.

#### Default

```ts
false
```

#### Inherited from

`MeshBasicNodeMaterial.vertexColors`

***

### vertexNode

> **vertexNode**: [`Node`](https://github.com/mrdoob/three.js/tree/dev/src) \| `null`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/nodes/NodeMaterial.d.ts:275

This node property can be used if you need complete freedom in implementing
the vertex shader. Assigning a node will replace the built-in material logic
used in the vertex stage.

#### Default

```ts
null
```

#### Inherited from

`MeshBasicNodeMaterial.vertexNode`

***

### visible

> **visible**: `boolean`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/Material.d.ts:331

Defines whether 3D objects using this material are visible.

#### Default

```ts
true
```

#### Inherited from

`MeshBasicNodeMaterial.visible`

***

### wireframe

> **wireframe**: `boolean`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/MeshBasicMaterial.d.ts:110

Renders the geometry as a wireframe.

#### Default

```ts
false
```

#### Inherited from

`MeshBasicNodeMaterial.wireframe`

***

### wireframeLinecap

> **wireframeLinecap**: `"round"` \| `"bevel"` \| `"miter"`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/MeshBasicMaterial.d.ts:126

Defines appearance of wireframe ends.

Can only be used with SVGRenderer.

#### Default

```ts
'round'
```

#### Inherited from

`MeshBasicNodeMaterial.wireframeLinecap`

***

### wireframeLinejoin

> **wireframeLinejoin**: `"round"` \| `"bevel"` \| `"miter"`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/MeshBasicMaterial.d.ts:134

Defines appearance of wireframe joints.

Can only be used with SVGRenderer.

#### Default

```ts
'round'
```

#### Inherited from

`MeshBasicNodeMaterial.wireframeLinejoin`

***

### wireframeLinewidth

> **wireframeLinewidth**: `number`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/MeshBasicMaterial.d.ts:118

Controls the thickness of the wireframe.

Can only be used with SVGRenderer.

#### Default

```ts
1
```

#### Inherited from

`MeshBasicNodeMaterial.wireframeLinewidth`

## Accessors

### alphaTest

#### Get Signature

> **get** **alphaTest**(): `number`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/Material.d.ts:353

Sets the alpha value to be used when running an alpha test. The material
will not be rendered if the opacity is lower than this value.

##### Default

```ts
0
```

##### Returns

`number`

#### Set Signature

> **set** **alphaTest**(`value`): `void`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/Material.d.ts:346

##### Parameters

###### value

`number`

##### Returns

`void`

#### Inherited from

`MeshBasicNodeMaterial.alphaTest`

***

### needsUpdate

#### Set Signature

> **set** **needsUpdate**(`value`): `void`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/Material.d.ts:638

Setting this property to `true` indicates the engine the material
needs to be recompiled.

##### Default

```ts
false
```

##### Parameters

###### value

`boolean`

##### Returns

`void`

#### Inherited from

[`TileChunkMaterial`](/api/classes/tilechunkmaterial/).[`needsUpdate`](/api/classes/tilechunkmaterial/#needsupdate)

***

### type

#### Get Signature

> **get** `static` **type**(): `string`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/nodes/NodeMaterial.d.ts:293

##### Returns

`string`

#### Inherited from

`MeshBasicNodeMaterial.type`

## Methods

### addEventListener()

> **addEventListener**\<`T`\>(`type`, `listener`): `void`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/EventDispatcher.d.ts:52

Adds a listener to an event type.

#### Type Parameters

##### T

`T` *extends* `"dispose"`

#### Parameters

##### type

`T`

The type of event to listen to.

##### listener

[`EventListener`](https://github.com/mrdoob/three.js/tree/dev/src)\<`object`\[`T`\], `T`, `Sprite2DMaterial`\>

The function that gets called when the event is fired.

#### Returns

`void`

#### Inherited from

`MeshBasicNodeMaterial.addEventListener`

***

### addInstanceFloat()

> **addInstanceFloat**(`name`, `defaultValue`): `this`

Defined in: [packages/core/src/materials/Sprite2DMaterial.ts:128](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/materials/Sprite2DMaterial.ts#L128)

Add a float instance attribute.

#### Parameters

##### name

`string`

##### defaultValue

`number` = `0`

#### Returns

`this`

***

### addInstanceVec2()

> **addInstanceVec2**(`name`, `defaultValue`): `this`

Defined in: [packages/core/src/materials/Sprite2DMaterial.ts:140](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/materials/Sprite2DMaterial.ts#L140)

Add a vec2 instance attribute.

#### Parameters

##### name

`string`

##### defaultValue

\[`number`, `number`\] = `...`

#### Returns

`this`

***

### addInstanceVec3()

> **addInstanceVec3**(`name`, `defaultValue`): `this`

Defined in: [packages/core/src/materials/Sprite2DMaterial.ts:152](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/materials/Sprite2DMaterial.ts#L152)

Add a vec3 instance attribute.

#### Parameters

##### name

`string`

##### defaultValue

\[`number`, `number`, `number`\] = `...`

#### Returns

`this`

***

### addInstanceVec4()

> **addInstanceVec4**(`name`, `defaultValue`): `this`

Defined in: [packages/core/src/materials/Sprite2DMaterial.ts:164](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/materials/Sprite2DMaterial.ts#L164)

Add a vec4 instance attribute.

#### Parameters

##### name

`string`

##### defaultValue

\[`number`, `number`, `number`, `number`\] = `...`

#### Returns

`this`

***

### build()

> **build**(`builder`): `void`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/nodes/NodeMaterial.d.ts:306

Builds this material with the given node builder.

#### Parameters

##### builder

[`NodeBuilder`](https://github.com/mrdoob/three.js/tree/dev/src)

The current node builder.

#### Returns

`void`

#### Inherited from

`MeshBasicNodeMaterial.build`

***

### clone()

> **clone**(): `this`

Defined in: [packages/core/src/materials/Sprite2DMaterial.ts:218](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/materials/Sprite2DMaterial.ts#L218)

Clone this material.
Ensures the cloned material has the texture and nodes set up properly.

#### Returns

`this`

#### Overrides

`MeshBasicNodeMaterial.clone`

***

### copy()

> **copy**(`source`): `this`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/nodes/NodeMaterial.d.ts:470

Copies the properties of the given node material to this instance.

#### Parameters

##### source

[`NodeMaterial`](https://github.com/mrdoob/three.js/tree/dev/src)

The material to copy.

#### Returns

`this`

A reference to this node material.

#### Inherited from

`MeshBasicNodeMaterial.copy`

***

### customProgramCacheKey()

> **customProgramCacheKey**(): `string`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/Material.d.ts:594

In case [Material#onBeforeCompile](/api/classes/sprite2dmaterial/#onbeforecompile) is used, this callback can be used to identify
values of settings used in `onBeforeCompile()`, so three.js can reuse a cached
shader or recompile the shader for this material as needed.

This method can only be used when rendering with [WebGLRenderer](https://github.com/mrdoob/three.js/blob/dev/src/renderers/WebGLRenderer.js).

#### Returns

`string`

The custom program cache key.

#### Inherited from

`MeshBasicNodeMaterial.customProgramCacheKey`

***

### dispatchEvent()

> **dispatchEvent**\<`T`\>(`event`): `void`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/EventDispatcher.d.ts:81

Fire an event type.

#### Type Parameters

##### T

`T` *extends* `"dispose"`

#### Parameters

##### event

[`BaseEvent`](https://github.com/mrdoob/three.js/tree/dev/src)\<`T`\> & `object`\[`T`\]

The event that gets fired.

#### Returns

`void`

#### Inherited from

`MeshBasicNodeMaterial.dispatchEvent`

***

### dispose()

> **dispose**(): `void`

Defined in: [packages/core/src/materials/Sprite2DMaterial.ts:233](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/materials/Sprite2DMaterial.ts#L233)

Frees the GPU-related resources allocated by this instance. Call this
method whenever this instance is no longer used in your app.

#### Returns

`void`

#### Fires

Material#dispose

#### Overrides

`MeshBasicNodeMaterial.dispose`

***

### getInstanceAttribute()

> **getInstanceAttribute**(`name`): [`InstanceAttributeConfig`](/api/interfaces/instanceattributeconfig/) \| `undefined`

Defined in: [packages/core/src/materials/Sprite2DMaterial.ts:191](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/materials/Sprite2DMaterial.ts#L191)

Get an instance attribute configuration.

#### Parameters

##### name

`string`

#### Returns

[`InstanceAttributeConfig`](/api/interfaces/instanceattributeconfig/) \| `undefined`

***

### getInstanceAttributeSchema()

> **getInstanceAttributeSchema**(): `Map`\<`string`, [`InstanceAttributeConfig`](/api/interfaces/instanceattributeconfig/)\>

Defined in: [packages/core/src/materials/Sprite2DMaterial.ts:199](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/materials/Sprite2DMaterial.ts#L199)

Get all instance attribute configurations.
Used by SpriteBatch to create InstancedBufferAttributes.

#### Returns

`Map`\<`string`, [`InstanceAttributeConfig`](/api/interfaces/instanceattributeconfig/)\>

***

### getInstanceAttributeStride()

> **getInstanceAttributeStride**(): `number`

Defined in: [packages/core/src/materials/Sprite2DMaterial.ts:206](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/materials/Sprite2DMaterial.ts#L206)

Get the number of floats needed per instance for custom attributes.

#### Returns

`number`

***

### getTexture()

> **getTexture**(): [`Texture`](https://github.com/mrdoob/three.js/blob/dev/src/textures/Texture.js)\<`unknown`\> \| `null`

Defined in: [packages/core/src/materials/Sprite2DMaterial.ts:106](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/materials/Sprite2DMaterial.ts#L106)

Get the sprite texture.

#### Returns

[`Texture`](https://github.com/mrdoob/three.js/blob/dev/src/textures/Texture.js)\<`unknown`\> \| `null`

***

### hasEventListener()

> **hasEventListener**\<`T`\>(`type`, `listener`): `boolean`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/EventDispatcher.d.ts:62

Checks if listener is added to an event type.

#### Type Parameters

##### T

`T` *extends* `"dispose"`

#### Parameters

##### type

`T`

The type of event to listen to.

##### listener

[`EventListener`](https://github.com/mrdoob/three.js/tree/dev/src)\<`object`\[`T`\], `T`, `Sprite2DMaterial`\>

The function that gets called when the event is fired.

#### Returns

`boolean`

#### Inherited from

`MeshBasicNodeMaterial.hasEventListener`

***

### hasInstanceAttribute()

> **hasInstanceAttribute**(`name`): `boolean`

Defined in: [packages/core/src/materials/Sprite2DMaterial.ts:184](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/materials/Sprite2DMaterial.ts#L184)

Check if an instance attribute exists.

#### Parameters

##### name

`string`

#### Returns

`boolean`

***

### onBeforeCompile()

> **onBeforeCompile**(`parameters`, `renderer`): `void`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/Material.d.ts:584

An optional callback that is executed immediately before the shader
program is compiled. This function is called with the shader source code
as a parameter. Useful for the modification of built-in materials.

This method can only be used when rendering with [WebGLRenderer](https://github.com/mrdoob/three.js/blob/dev/src/renderers/WebGLRenderer.js). The
recommended approach when customizing materials is to use `WebGPURenderer` with the new
Node Material system and [TSL](https://github.com/mrdoob/three.js/wiki/Three.js-Shading-Language).

#### Parameters

##### parameters

[`WebGLProgramParametersWithUniforms`](https://github.com/mrdoob/three.js/tree/dev/src)

##### renderer

[`WebGLRenderer`](https://github.com/mrdoob/three.js/blob/dev/src/renderers/WebGLRenderer.js)

A reference to the renderer.

#### Returns

`void`

#### Inherited from

`MeshBasicNodeMaterial.onBeforeCompile`

***

### onBeforeRender()

> **onBeforeRender**(`renderer`, `scene`, `camera`, `geometry`, `object`, `group`): `void`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/Material.d.ts:564

An optional callback that is executed immediately before the material is used to render a 3D object.

This method can only be used when rendering with [WebGLRenderer](https://github.com/mrdoob/three.js/blob/dev/src/renderers/WebGLRenderer.js).

#### Parameters

##### renderer

[`WebGLRenderer`](https://github.com/mrdoob/three.js/blob/dev/src/renderers/WebGLRenderer.js)

The renderer.

##### scene

[`Scene`](https://github.com/mrdoob/three.js/blob/dev/src/scenes/Scene.js)

The scene.

##### camera

[`Camera`](https://github.com/mrdoob/three.js/blob/dev/src/cameras/Camera.js)

The camera that is used to render the scene.

##### geometry

[`BufferGeometry`](https://github.com/mrdoob/three.js/blob/dev/src/core/BufferGeometry.js)

The 3D object's geometry.

##### object

[`Object3D`](https://github.com/mrdoob/three.js/blob/dev/src/core/Object3D.js)

The 3D object.

##### group

[`Group`](https://github.com/mrdoob/three.js/blob/dev/src/objects/Group.js)

The geometry group data.

#### Returns

`void`

#### Inherited from

`MeshBasicNodeMaterial.onBeforeRender`

***

### removeEventListener()

> **removeEventListener**\<`T`\>(`type`, `listener`): `void`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/core/EventDispatcher.d.ts:72

Removes a listener from an event type.

#### Type Parameters

##### T

`T` *extends* `"dispose"`

#### Parameters

##### type

`T`

The type of the listener that gets removed.

##### listener

[`EventListener`](https://github.com/mrdoob/three.js/tree/dev/src)\<`object`\[`T`\], `T`, `Sprite2DMaterial`\>

The listener function that gets removed.

#### Returns

`void`

#### Inherited from

`MeshBasicNodeMaterial.removeEventListener`

***

### removeInstanceAttribute()

> **removeInstanceAttribute**(`name`): `this`

Defined in: [packages/core/src/materials/Sprite2DMaterial.ts:176](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/materials/Sprite2DMaterial.ts#L176)

Remove an instance attribute.

#### Parameters

##### name

`string`

#### Returns

`this`

***

### setDefaultValues()

> **setDefaultValues**(`material`): `void`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/nodes/NodeMaterial.d.ts:463

Most classic material types have a node pendant e.g. for `MeshBasicMaterial`
there is `MeshBasicNodeMaterial`. This utility method is intended for
defining all material properties of the classic type in the node type.

#### Parameters

##### material

[`Material`](https://github.com/mrdoob/three.js/blob/dev/src/materials/Material.js)

The material to copy properties with their values to this node material.

#### Returns

`void`

#### Inherited from

`MeshBasicNodeMaterial.setDefaultValues`

***

### setTexture()

> **setTexture**(`value`): `void`

Defined in: [packages/core/src/materials/Sprite2DMaterial.ts:113](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/materials/Sprite2DMaterial.ts#L113)

Set the sprite texture.

#### Parameters

##### value

[`Texture`](https://github.com/mrdoob/three.js/blob/dev/src/textures/Texture.js)\<`unknown`\> | `null`

#### Returns

`void`

***

### setup()

> **setup**(`builder`): `void`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/nodes/NodeMaterial.d.ts:319

Setups the vertex and fragment stage of this node material.

#### Parameters

##### builder

[`NodeBuilder`](https://github.com/mrdoob/three.js/tree/dev/src)

The current node builder.

#### Returns

`void`

#### Inherited from

`MeshBasicNodeMaterial.setup`

***

### setupClipping()

> **setupClipping**(`builder`): [`ClippingNode`](https://github.com/mrdoob/three.js/tree/dev/src)

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/nodes/NodeMaterial.d.ts:326

Setups the clipping node.

#### Parameters

##### builder

[`NodeBuilder`](https://github.com/mrdoob/three.js/tree/dev/src)

The current node builder.

#### Returns

[`ClippingNode`](https://github.com/mrdoob/three.js/tree/dev/src)

The clipping node.

#### Inherited from

`MeshBasicNodeMaterial.setupClipping`

***

### setupDepth()

> **setupDepth**(`builder`): `void`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/nodes/NodeMaterial.d.ts:338

Setups the depth of this material.

#### Parameters

##### builder

[`NodeBuilder`](https://github.com/mrdoob/three.js/tree/dev/src)

The current node builder.

#### Returns

`void`

#### Inherited from

`MeshBasicNodeMaterial.setupDepth`

***

### setupDiffuseColor()

> **setupDiffuseColor**(`builder`): `void`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/nodes/NodeMaterial.d.ts:374

Setups the computation of the material's diffuse color.

#### Parameters

##### builder

[`NodeBuilder`](https://github.com/mrdoob/three.js/tree/dev/src)

The current node builder.

#### Returns

`void`

#### Inherited from

`MeshBasicNodeMaterial.setupDiffuseColor`

***

### setupEnvironment()

> **setupEnvironment**(`builder`): [`BasicEnvironmentNode`](https://github.com/mrdoob/three.js/tree/dev/src) \| `null`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/nodes/MeshBasicNodeMaterial.d.ts:44

Overwritten since this type of material uses [BasicEnvironmentNode](https://github.com/mrdoob/three.js/tree/dev/src)
to implement the default environment mapping.

#### Parameters

##### builder

[`NodeBuilder`](https://github.com/mrdoob/three.js/tree/dev/src)

The current node builder.

#### Returns

[`BasicEnvironmentNode`](https://github.com/mrdoob/three.js/tree/dev/src) \| `null`

The environment node.

#### Inherited from

`MeshBasicNodeMaterial.setupEnvironment`

***

### setupFog()

> **setupFog**(`builder`, `outputNode`): [`Node`](https://github.com/mrdoob/three.js/tree/dev/src)

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/nodes/NodeMaterial.d.ts:439

Setup the fog.

#### Parameters

##### builder

[`NodeBuilder`](https://github.com/mrdoob/three.js/tree/dev/src)

The current node builder.

##### outputNode

[`Node`](https://github.com/mrdoob/three.js/tree/dev/src)

The existing output node.

#### Returns

[`Node`](https://github.com/mrdoob/three.js/tree/dev/src)

The output node.

#### Inherited from

`MeshBasicNodeMaterial.setupFog`

***

### setupHardwareClipping()

> **setupHardwareClipping**(`builder`): `void`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/nodes/NodeMaterial.d.ts:332

Setups the hardware clipping if available on the current device.

#### Parameters

##### builder

[`NodeBuilder`](https://github.com/mrdoob/three.js/tree/dev/src)

The current node builder.

#### Returns

`void`

#### Inherited from

`MeshBasicNodeMaterial.setupHardwareClipping`

***

### setupLighting()

> **setupLighting**(`builder`): [`Node`](https://github.com/mrdoob/three.js/tree/dev/src)

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/nodes/NodeMaterial.d.ts:431

Setups the outgoing light node.

#### Parameters

##### builder

[`NodeBuilder`](https://github.com/mrdoob/three.js/tree/dev/src)

The current node builder.

#### Returns

[`Node`](https://github.com/mrdoob/three.js/tree/dev/src)

The outgoing light node.

#### Inherited from

`MeshBasicNodeMaterial.setupLighting`

***

### setupLightingModel()

> **setupLightingModel**(): [`BasicLightingModel`](https://github.com/mrdoob/three.js/tree/dev/src)

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/nodes/MeshBasicNodeMaterial.d.ts:50

Setups the lighting model.

#### Returns

[`BasicLightingModel`](https://github.com/mrdoob/three.js/tree/dev/src)

The lighting model.

#### Inherited from

`MeshBasicNodeMaterial.setupLightingModel`

***

### setupLightMap()

> **setupLightMap**(`builder`): [`Node`](https://github.com/mrdoob/three.js/tree/dev/src)

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/nodes/NodeMaterial.d.ts:408

Setups the light map node from the material.

#### Parameters

##### builder

[`NodeBuilder`](https://github.com/mrdoob/three.js/tree/dev/src)

The current node builder.

#### Returns

[`Node`](https://github.com/mrdoob/three.js/tree/dev/src)

The light map node.

#### Inherited from

`MeshBasicNodeMaterial.setupLightMap`

***

### setupLights()

> **setupLights**(`builder`): [`LightsNode`](https://github.com/mrdoob/three.js/tree/dev/src)

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/nodes/NodeMaterial.d.ts:415

Setups the lights node based on the scene, environment and material.

#### Parameters

##### builder

[`NodeBuilder`](https://github.com/mrdoob/three.js/tree/dev/src)

The current node builder.

#### Returns

[`LightsNode`](https://github.com/mrdoob/three.js/tree/dev/src)

The lights node.

#### Inherited from

`MeshBasicNodeMaterial.setupLights`

***

### setupModelViewProjection()

> **setupModelViewProjection**(): [`Node`](https://github.com/mrdoob/three.js/tree/dev/src)

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/nodes/NodeMaterial.d.ts:353

Setups the position in clip space.

#### Returns

[`Node`](https://github.com/mrdoob/three.js/tree/dev/src)

The position in view space.

#### Inherited from

`MeshBasicNodeMaterial.setupModelViewProjection`

***

### setupNormal()

> **setupNormal**(): [`Node`](https://github.com/mrdoob/three.js/tree/dev/src)

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/nodes/NodeMaterial.d.ts:394

Setups the normal node from the material.

#### Returns

[`Node`](https://github.com/mrdoob/three.js/tree/dev/src)

The normal node.

#### Inherited from

`MeshBasicNodeMaterial.setupNormal`

***

### setupObserver()

> **setupObserver**(`builder`): [`NodeMaterialObserver`](https://github.com/mrdoob/three.js/tree/dev/src)

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/nodes/NodeMaterial.d.ts:313

Setups a node material observer with the given builder.

#### Parameters

##### builder

[`NodeBuilder`](https://github.com/mrdoob/three.js/tree/dev/src)

The current node builder.

#### Returns

[`NodeMaterialObserver`](https://github.com/mrdoob/three.js/tree/dev/src)

The node material observer.

#### Inherited from

`MeshBasicNodeMaterial.setupObserver`

***

### setupOutgoingLight()

> **setupOutgoingLight**(): [`Node`](https://github.com/mrdoob/three.js/tree/dev/src)

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/nodes/NodeMaterial.d.ts:388

Setups the outgoing light node variable

#### Returns

[`Node`](https://github.com/mrdoob/three.js/tree/dev/src)

The outgoing light node.

#### Inherited from

`MeshBasicNodeMaterial.setupOutgoingLight`

***

### setupOutput()

> **setupOutput**(`builder`, `outputNode`): [`Node`](https://github.com/mrdoob/three.js/tree/dev/src)

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/nodes/NodeMaterial.d.ts:455

Setups the output node.

#### Parameters

##### builder

[`NodeBuilder`](https://github.com/mrdoob/three.js/tree/dev/src)

The current node builder.

##### outputNode

[`Node`](https://github.com/mrdoob/three.js/tree/dev/src)

The existing output node.

#### Returns

[`Node`](https://github.com/mrdoob/three.js/tree/dev/src)

The output node.

#### Inherited from

`MeshBasicNodeMaterial.setupOutput`

***

### setupPosition()

> **setupPosition**(`builder`): [`Node`](https://github.com/mrdoob/three.js/tree/dev/src)

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/nodes/NodeMaterial.d.ts:367

Setups the computation of the position in local space.

#### Parameters

##### builder

[`NodeBuilder`](https://github.com/mrdoob/three.js/tree/dev/src)

The current node builder.

#### Returns

[`Node`](https://github.com/mrdoob/three.js/tree/dev/src)

The position in local space.

#### Inherited from

`MeshBasicNodeMaterial.setupPosition`

***

### setupPositionView()

> **setupPositionView**(`builder`): [`Node`](https://github.com/mrdoob/three.js/tree/dev/src)

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/nodes/NodeMaterial.d.ts:346

Setups the position node in view space. This method exists
so derived node materials can modify the implementation e.g. sprite materials.

#### Parameters

##### builder

[`NodeBuilder`](https://github.com/mrdoob/three.js/tree/dev/src)

The current node builder.

#### Returns

[`Node`](https://github.com/mrdoob/three.js/tree/dev/src)

The position in view space.

#### Inherited from

`MeshBasicNodeMaterial.setupPositionView`

***

### setupPremultipliedAlpha()

> **setupPremultipliedAlpha**(`builder`, `outputNode`): [`Node`](https://github.com/mrdoob/three.js/tree/dev/src)

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/nodes/NodeMaterial.d.ts:447

Setups premultiplied alpha.

#### Parameters

##### builder

[`NodeBuilder`](https://github.com/mrdoob/three.js/tree/dev/src)

The current node builder.

##### outputNode

[`Node`](https://github.com/mrdoob/three.js/tree/dev/src)

The existing output node.

#### Returns

[`Node`](https://github.com/mrdoob/three.js/tree/dev/src)

The output node.

#### Inherited from

`MeshBasicNodeMaterial.setupPremultipliedAlpha`

***

### setupVariants()

> `abstract` **setupVariants**(`builder`): `void`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/nodes/NodeMaterial.d.ts:382

Abstract interface method that can be implemented by derived materials
to setup material-specific node variables.

#### Parameters

##### builder

[`NodeBuilder`](https://github.com/mrdoob/three.js/tree/dev/src)

The current node builder.

#### Returns

`void`

#### Inherited from

`MeshBasicNodeMaterial.setupVariants`

***

### setupVertex()

> **setupVertex**(`builder`): [`Node`](https://github.com/mrdoob/three.js/tree/dev/src)

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/nodes/NodeMaterial.d.ts:360

Setups the logic for the vertex stage.

#### Parameters

##### builder

[`NodeBuilder`](https://github.com/mrdoob/three.js/tree/dev/src)

The current node builder.

#### Returns

[`Node`](https://github.com/mrdoob/three.js/tree/dev/src)

The position in clip space.

#### Inherited from

`MeshBasicNodeMaterial.setupVertex`

***

### setValues()

> **setValues**(`values?`): `void`

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/nodes/MeshBasicNodeMaterial.d.ts:36

#### Parameters

##### values?

[`MeshBasicNodeMaterialParameters`](https://github.com/mrdoob/three.js/tree/dev/src)

#### Returns

`void`

#### Inherited from

`MeshBasicNodeMaterial.setValues`

***

### toJSON()

> **toJSON**(`meta?`): [`MaterialJSON`](https://github.com/mrdoob/three.js/tree/dev/src)

Defined in: node\_modules/.pnpm/@types+three@0.182.0/node\_modules/@types/three/src/materials/Material.d.ts:610

Serializes the material into JSON.

#### Parameters

##### meta?

[`JSONMeta`](https://github.com/mrdoob/three.js/tree/dev/src)

An optional value holding meta information about the serialization.

#### Returns

[`MaterialJSON`](https://github.com/mrdoob/three.js/tree/dev/src)

A JSON object representing the serialized material.

#### See

ObjectLoader#parse

#### Inherited from

`MeshBasicNodeMaterial.toJSON`
