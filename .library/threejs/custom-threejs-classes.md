# Custom three.js Classes (WebGPU)

How to build custom Object3D subclasses and custom materials for the **WebGPU path**. All examples use `NodeMaterial` and TSL; `ShaderMaterial` and raw GLSL are WebGL-only and not covered.

> Prerequisite reading:
> - `idiomatic-threejs-patterns.md` — subclass contract, render pipeline, lifecycle
> - `tsl-codex.md` — full TSL language reference
>
> Imports:
> ```js
> import { Mesh, Object3D, NodeMaterial, MeshStandardNodeMaterial,
>          MeshBasicNodeMaterial, SpriteNodeMaterial } from 'three/webgpu';
> import { Fn, uniform, texture, vec3, vec4, float, time,
>          positionLocal, normalWorld, uv } from 'three/tsl';
> ```

---

## 1. Three dominant patterns

| Pattern | Extends | Example files (WebGPU) | Use when |
|---|---|---|---|
| Custom TSL material | `NodeMaterial` (or a `Mesh*NodeMaterial`) | See `examples/jsm/objects/SkyMesh.js`, `WaterMesh.js` | You need a fixed visual that swaps in custom TSL nodes |
| Render-to-texture via `reflector()` / `pass()` / `rtt()` | — (a node, used inside a material's graph) | `src/nodes/utils/ReflectorNode.js`, `src/nodes/utils/RTTNode.js`, `src/nodes/display/PassNode.js` | You need to sample a rendered scene inside a shader |
| Composite `Object3D` | `Object3D` (sometimes `Line`/`LineSegments`) | `src/helpers/ArrowHelper.js`, `examples/jsm/helpers/ViewHelper.js` | Your "thing" is visually several meshes that move together |

> The old WebGL pattern of "Mesh + `ShaderMaterial` with hand-written GLSL" is dead on the WebGPU path. Its replacement is "Mesh + `NodeMaterial` with TSL plug-in nodes."

---

## 2. NodeMaterial base class + plug-in property catalog

`NodeMaterial` (`src/materials/nodes/NodeMaterial.js`) is the base class for every material that works with `WebGPURenderer`. Its `setup(builder)` method constructs the vertex and fragment graphs by composing **plug-in nodes** — nullable `*Node` properties you can override to replace default behavior.

### Base NodeMaterial plug-in properties

| Property | Expected type | Replaces | Stage |
|---|---|---|---|
| `colorNode` | vec3 or vec4 | Diffuse color (`color` + `map`) | fragment |
| `opacityNode` | float | Opacity (`opacity` + `alphaMap`) | fragment |
| `alphaTestNode` | float | Alpha test threshold | fragment |
| `maskNode` | bool | Discard mask | fragment |
| `normalNode` | vec3 | Normal (normal/bump map) | fragment |
| `emissiveNode` | vec3 | Emissive color | fragment |
| `envNode` | vec3 | Environment contribution | fragment |
| `aoNode` | float | Ambient occlusion | fragment |
| `lightsNode` | `LightsNode` | Subset of scene lights | fragment |
| `backdropNode` | vec3 | Screen-space backdrop (requires lighting) | fragment |
| `backdropAlphaNode` | float | Backdrop mix amount | fragment |
| `positionNode` | vec3 | Vertex position in local space (displacement, morph) | vertex |
| `geometryNode` | (custom) | Geometry override point | vertex |
| `depthNode` | float | Fragment depth | fragment |
| `vertexNode` | vec4 | **Full vertex output in clip space** (replaces entire vertex stage) | vertex |
| `fragmentNode` | vec4 | **Full fragment RGBA** (replaces entire fragment stage incl. lighting) | fragment |
| `outputNode` | vec4 | Post-lighting final output wrap | fragment |
| `mrtNode` | `MRTNode` | Multiple render target outputs | fragment |
| `castShadowNode` | vec4 | Cast shadow color (alpha = shadow strength) | shadow pass |
| `castShadowPositionNode` | vec3 | Vertex position used during shadow casting | shadow pass |
| `maskShadowNode` | float | Shadow discard mask | shadow pass |
| `receivedShadowNode` | (Fn) | Modify received shadow color/intensity | fragment |

Verified in `src/materials/nodes/NodeMaterial.js:114-391, 1321-1347`.

### MeshPhysicalNodeMaterial adds (PBR extras)

`clearcoatNode`, `clearcoatRoughnessNode`, `clearcoatNormalNode`, `sheenNode`, `sheenRoughnessNode`, `iridescenceNode`, `iridescenceIORNode`, `iridescenceThicknessNode`, `specularIntensityNode`, `specularColorNode`, `transmissionNode`, `thicknessNode`, `attenuationDistanceNode`, `attenuationColorNode`, `dispersionNode`, `anisotropyNode` — all in `src/materials/nodes/MeshPhysicalNodeMaterial.js:57-265`.

### MeshStandardNodeMaterial adds

`emissiveNode` (already in base), `metalnessNode`, `roughnessNode`.

### The three ways to customize

1. **Assign plug-in properties on an existing material** — lightest touch, works with PBR, fog, lighting, shadows for free.
    ```js
    const mat = new MeshStandardNodeMaterial({ metalness: 1, roughness: 0.2 });
    mat.colorNode = vec3( 1, 0, 0 );
    mat.positionNode = positionLocal.add( vec3( 0, sin( time ).mul( 0.1 ), 0 ) );
    ```
2. **Override `vertexNode` or `fragmentNode` on a bare `NodeMaterial`** — full control over that stage, but you lose all of the lighting/fog/output wrapping for anything you override.
    ```js
    const mat = new NodeMaterial();
    mat.vertexNode = Fn( () => modelViewProjection )();
    mat.fragmentNode = Fn( () => vec4( uv(), 0, 1 ) )();
    ```
3. **Subclass `NodeMaterial`** and override `setup*` methods — used by all the built-in `Mesh*NodeMaterial` classes. See §4.

---

## 3. Recipe: custom TSL material (plug-in pattern)

The simplest recipe — subclass a base material and assign plug-in nodes in the constructor. Use this for 80% of custom materials.

```js
import { MeshStandardNodeMaterial } from 'three/webgpu';
import { Fn, uniform, positionLocal, normalLocal, time, sin, vec3, float } from 'three/tsl';

class WobbleMaterial extends MeshStandardNodeMaterial {
  static get type() { return 'WobbleMaterial'; }

  constructor( parameters ) {
    super();
    this.isWobbleMaterial = true;

    // Reactive uniforms: write .value to update per-frame.
    this.amplitude = uniform( 0.1 );
    this.frequency = uniform( 2 );

    // Build the displacement expression once, in the constructor.
    const wobble = Fn( () => {
      const offset = sin( positionLocal.y.mul( this.frequency ).add( time ) ).mul( this.amplitude );
      return positionLocal.add( normalLocal.mul( offset ) );
    } );

    this.positionNode = wobble();

    this.setValues( parameters );
  }

  copy( source ) {
    // Always copy your own *Node properties before calling super.
    this.amplitude = source.amplitude;
    this.frequency = source.frequency;
    this.positionNode = source.positionNode;
    return super.copy( source );
  }
}
```

Rules:
- **Build node graphs once in the constructor, not every frame.** The graph is compiled on first use; rebuilding it each frame forces recompilation.
- **Use `uniform()` for values that change per frame.** Writing `.value` updates the GPU buffer; it does NOT trigger recompilation.
- **Use `material.setValues(parameters)`** at the end of the constructor to apply standard material options (color, map, etc.) from a parameter object.
- **Always override `copy()`** to carry over your `*Node` fields. Call `super.copy(source)` last.
- **Use `static get type()`** to set the serialization type string; the base class reads it.
- **Do NOT reassign plug-in nodes in hot code paths.** Each reassignment invalidates the cached pipeline.

---

## 4. Recipe: subclass `NodeMaterial` directly

Use when you need control over `setup*` methods. The built-in `Mesh*NodeMaterial` classes are all examples of this.

```js
import { NodeMaterial } from 'three/webgpu';
import { Fn, texture, uv, mix, smoothstep, time, vec3, vec4 } from 'three/tsl';

class GradientTransitionMaterial extends NodeMaterial {
  static get type() { return 'GradientTransitionMaterial'; }

  constructor( texA, texB ) {
    super();
    this.isGradientTransitionMaterial = true;
    this.lights = false;      // unlit
    this.transparent = false;

    this.texA = texA;
    this.texB = texB;
  }

  setup( builder ) {
    // setup() builds the vertex + fragment graphs. Return value is ignored;
    // side effects populate the builder.
    // Note: plug-in properties (colorNode etc.) already set by the user
    // take precedence — check `this.colorNode === null` before providing a default.

    if ( this.colorNode === null ) {
      const sampleA = texture( this.texA, uv() ).rgb;
      const sampleB = texture( this.texB, uv() ).rgb;
      const t = smoothstep( 0, 1, time.sin().mul( 0.5 ).add( 0.5 ) );
      this.colorNode = mix( sampleA, sampleB, t );
    }

    return super.setup( builder );
  }

  copy( source ) {
    this.texA = source.texA;
    this.texB = source.texB;
    return super.copy( source );
  }
}
```

Overridable hooks (see `NodeMaterial.js:479-642`):

| Hook | Purpose |
|---|---|
| `setup(builder)` | Top-level entry; calls every other `setup*` in order. Override only when you need full control. |
| `setupVertex(builder)` | Vertex position + varyings. |
| `setupPosition(builder)` | Local-space vertex position (morph, skinning, displacement). |
| `setupPositionView(builder)` | View-space position (sprites override this for billboarding). |
| `setupModelViewProjection()` | Clip-space transform. |
| `setupDiffuseColor(builder)` | Color, opacity, alpha test, discard. |
| `setupVariants(builder)` | Material-specific params (metalness, roughness, clearcoat, etc.). |
| `setupNormal()` | Normal direction calculation. |
| `setupEnvironment(builder)` | Env map or `scene.environment`. |
| `setupLighting(builder)` | Composes `setupLights()` + emissive + backdrop. |
| `setupLightingModel(builder)` | Returns the lighting model (`PhysicalLightingModel`, `PhongLightingModel`, `BasicLightingModel`, etc.). |
| `setupOutgoingLight()` | Final outgoing light before post-processing. |
| `setupOutput(builder, outputNode)` | Fog + tonemap + alpha wrap. |

---

## 5. Recipe: custom mesh with TSL material (Sky/Water pattern)

This is the WebGPU replacement for the WebGL "Mesh + ShaderMaterial" recipe. The repo's `examples/jsm/objects/SkyMesh.js` and `WaterMesh.js` are the gold-standard examples.

```js
import { Mesh, BoxGeometry, NodeMaterial, BackSide } from 'three/webgpu';
import { Fn, uniform, vec3, vec4, positionLocal, normalWorld,
         modelViewProjection, varyingProperty } from 'three/tsl';

class SkyDome extends Mesh {
  constructor() {
    const material = new NodeMaterial();
    material.side = BackSide;
    material.depthWrite = false;

    super( new BoxGeometry( 1, 1, 1 ), material );

    this.isSkyDome = true;
    this.type = 'SkyDome';

    // Uniforms live on the instance so users can drive them.
    this.turbidity = uniform( 2 );
    this.rayleigh = uniform( 1 );
    this.sunPosition = uniform( vec3( 0, 1, 0 ) );

    // Vertex stage — exposes varyings for the fragment.
    const vWorldPosition = varyingProperty( 'vec3', 'vWorldPosition' );
    const vertexNode = Fn( () => {
      vWorldPosition.assign( positionLocal );
      return modelViewProjection;                   // MUST return vec4 clip-space
    } );

    // Fragment stage — returns full RGBA.
    const fragmentNode = Fn( () => {
      // ... scattering math using vWorldPosition, this.turbidity, this.sunPosition ...
      return vec4( 0.5, 0.7, 1.0, 1.0 );
    } );

    material.vertexNode = vertexNode();
    material.fragmentNode = fragmentNode();
  }
}
```

Rules:
- **`vertexNode` MUST return a vec4 in clip space.** No wrapping, no fog, no lighting. You are replacing the entire vertex stage.
- **`fragmentNode` MUST return a vec4.** Same — no lighting, no fog, no output wrap. If you want lighting, use `colorNode` + a base material class instead.
- **Varyings are declared with `varyingProperty(type, name)`** and assigned in the vertex stage with `.assign()`. Reading them in the fragment stage returns the interpolated value.
- **`this.isSkyDome = true`** and **`this.type = 'SkyDome'`** on the Mesh subclass itself (the material type is separate).
- **No `UniformsUtils.clone`** — `uniform(value)` already creates a per-instance node. There is no shared state between instances unless you deliberately share the uniform node.
- **No prototype-method vs instance-closure trap** — TSL graphs are built once in the constructor and stored on the material; they do not rely on closures for per-frame state.

---

## 6. Recipe: render-to-texture with `reflector()` / `rtt()` / `pass()`

WebGPU replaces the WebGL `onBeforeRender` closure pattern with **node factories** that encapsulate the render-to-texture and expose the resulting texture as a sampleable node.

### `reflector()` — mirror reflections

```js
import { Mesh, PlaneGeometry, MeshStandardNodeMaterial } from 'three/webgpu';
import { reflector, Fn, mix, vec3, texture } from 'three/tsl';

const material = new MeshStandardNodeMaterial({ roughness: 0, metalness: 1 });

const mirror = reflector();
mirror.target.rotateX( -Math.PI / 2 );      // align virtual camera to mirror plane

const plane = new Mesh( new PlaneGeometry( 10, 10 ), material );
plane.add( mirror.target );                  // CRITICAL: add the virtual camera target to the scene graph

material.colorNode = Fn( () => {
  // Optional: distort the reflection UV for water-like ripples.
  // mirror.uvNode = mirror.uvNode.add( distortion );
  return mix( vec3( 0.05, 0.1, 0.2 ), mirror.rgb, 0.8 );
} )();
```

`reflector()` is defined at `src/nodes/utils/ReflectorNode.js:627`. It returns a `ReflectorNode` that:
- Owns its own render target and virtual camera.
- Exposes `.rgb`, `.target` (the virtual camera `Object3D` you must add to the scene), `.uvNode`, `.reflector.resolutionScale`.
- Renders the scene from the mirror's reflected camera each frame, automatically, during node update.
- **Must have `.target` added to the scene graph** — otherwise the virtual camera's transform is never updated.

### `rtt()` — generic render-to-texture as a node

See `src/nodes/utils/RTTNode.js`. Wraps any node so that its evaluation happens into an offscreen texture. Useful for caching expensive fragment graphs.

### `pass()` — post-processing pass

```js
import { PostProcessing, pass, mrt, uniform } from 'three/webgpu';
// (or import { pass } from 'three/tsl')
import { bloom } from 'three/addons/tsl/display/BloomNode.js';

const postProcessing = new PostProcessing( renderer );

const scenePass = pass( scene, camera );
const scenePassColor = scenePass.getTextureNode( 'output' );

const bloomPass = bloom( scenePassColor, 0.5, 0.3 );

postProcessing.outputNode = scenePassColor.add( bloomPass );

// Render loop
renderer.setAnimationLoop( () => {
  postProcessing.render();                   // NOT renderer.render(scene, camera)
} );
```

`pass()` is defined at `src/nodes/display/PassNode.js:1012`. A `PassNode`:
- Calls `renderer.render(scene, camera)` into its own internal render target once per frame.
- Exposes per-MRT textures via `.getTextureNode(name)`.
- Supports multiple render targets via `.setMRT(mrt({ output: ..., emissive: ..., normal: ... }))`.
- Can be chained into a post-processing graph — the `PostProcessing` helper or direct manipulation of `scenePass.outputNode`.

**Do not call `renderer.render(scene, camera)` in a post-processing setup.** `postProcessing.render()` handles it — and nested calls will double-render.

### The `onBeforeRender` closure pattern still works

For cases where node factories do not fit (e.g., rendering a completely different scene, sampling a custom camera, triggering side effects in your app), you can still assign `mesh.onBeforeRender = function(...)`. The caveats:
- It fires during `renderObject` (`Renderer.js:3249`), same timing as WebGL.
- `renderer.getRenderTarget()` / `renderer.setRenderTarget()` still work for state save/restore.
- `renderer.xr.enabled` save/restore — same pattern.
- **Do NOT save/restore `renderer.shadowMap.autoUpdate`** — WebGPU's shadow pipeline does not use that flag the same way; it runs via `ShadowNode` regardless.

---

## 7. Recipe: composite `Object3D`

Unchanged from WebGL — this is a pure scene-graph pattern with no renderer dependency. Use for helpers, gizmos, and anything that visually consists of multiple child meshes/lines that move together.

```js
import { Object3D, BufferGeometry, Float32BufferAttribute, Line, Mesh,
         LineBasicNodeMaterial, MeshBasicNodeMaterial, ConeGeometry } from 'three/webgpu';

// Module-level geometry cache — shared across all instances.
let _lineGeometry, _coneGeometry;

class MyArrow extends Object3D {
  constructor( dir, origin, length, color ) {
    super();
    this.type = 'MyArrow';

    if ( _lineGeometry === undefined ) {
      _lineGeometry = new BufferGeometry();
      _lineGeometry.setAttribute( 'position',
        new Float32BufferAttribute( [ 0, 0, 0, 0, 1, 0 ], 3 ) );
      _coneGeometry = new ConeGeometry( 0.5, 1, 5, 1 );
      _coneGeometry.translate( 0, -0.5, 0 );
    }

    this.position.copy( origin );

    // Use Node materials even for children — otherwise you rely on the
    // classic-material auto-upgrade path which is not guaranteed for every class.
    this.line = new Line( _lineGeometry, new LineBasicNodeMaterial( { color } ) );
    this.line.matrixAutoUpdate = false;
    this.add( this.line );

    this.cone = new Mesh( _coneGeometry, new MeshBasicNodeMaterial( { color } ) );
    this.cone.matrixAutoUpdate = false;
    this.add( this.cone );

    this.setDirection( dir );
    this.setLength( length );
  }

  setLength( length, headLength, headWidth ) {
    this.line.scale.set( 1, Math.max( 0.0001, length - headLength ), 1 );
    this.line.updateMatrix();
    this.cone.scale.set( headWidth, headLength, headWidth );
    this.cone.position.y = length;
    this.cone.updateMatrix();
  }

  copy( source ) {
    super.copy( source, false );        // false prevents double-cloning children
    this.line.copy( source.line );
    this.cone.copy( source.cone );
    return this;
  }

  dispose() {
    this.line.material.dispose();
    this.cone.material.dispose();
    // _lineGeometry / _coneGeometry are module-level shared; DO NOT dispose.
  }
}
```

Rules unchanged from WebGL:
- **Children with `matrixAutoUpdate = false`** and manual `updateMatrix()` calls when position/scale change.
- **`super.copy(source, false)`** to prevent `Object3D.copy`'s recursive child clone from fighting your manual child copy.
- **Module-level shared geometry** is fine; do not dispose it in your `dispose()`.
- **Use `*NodeMaterial`** for children in a WebGPU-first codebase. The auto-upgrade path in `NodeLibrary.fromMaterial` works for the common cases but you pay a small first-use cost.

---

## 8. Classic material auto-upgrade

`WebGPURenderer` can render meshes whose materials are classic `Material` subclasses — it converts them on the fly. Verified at `src/renderers/common/nodes/NodeLibrary.js:52-74`:

```js
fromMaterial( material ) {
  if ( material.isNodeMaterial ) return material;
  const nodeMaterialClass = this.getMaterialNodeClass( material.type );
  if ( nodeMaterialClass !== null ) {
    const nodeMaterial = new nodeMaterialClass();
    for ( const key in material ) nodeMaterial[ key ] = material[ key ];
    return nodeMaterial;
  }
  return null;
}
```

What auto-upgrades:
- `MeshBasicMaterial` → `MeshBasicNodeMaterial`
- `MeshStandardMaterial` → `MeshStandardNodeMaterial`
- `MeshPhysicalMaterial` → `MeshPhysicalNodeMaterial`
- `MeshLambertMaterial`, `MeshPhongMaterial`, `MeshToonMaterial`, `MeshNormalMaterial`, `MeshMatcapMaterial`
- `LineBasicMaterial` → `LineBasicNodeMaterial`, `LineDashedMaterial` → `LineDashedNodeMaterial`
- `PointsMaterial` → `PointsNodeMaterial`
- `SpriteMaterial` → `SpriteNodeMaterial`

What does NOT auto-upgrade:
- `ShaderMaterial` — no node equivalent exists. You must rewrite.
- `RawShaderMaterial` — same.
- Custom `Material` subclasses defined by user code.

**In a new WebGPU-first codebase, prefer `*NodeMaterial` from the start** — the upgrade path works but is a hidden per-material conversion and breaks whenever you introduce a non-standard material.

---

## 9. Dispose ownership for custom classes

Same rules as the WebGL path — whoever allocates owns and must dispose. The full ownership table is in `common-patterns-and-helpers.md` §11. Quick recap for custom classes:

| Allocated in | Disposed by |
|---|---|
| Constructor, unconditionally | Your class's `dispose()` |
| Constructor, shared at module scope | **Nobody** — leak it, the size is negligible |
| Passed into constructor by caller | The caller |
| `reflector()` / `pass()` / `rtt()` internal render target | The node's own `.dispose()` — call it when you tear down |

`NodeMaterial.dispose()` (inherited from `Material.dispose()`) emits `{ type: 'dispose' }` — `WebGPURenderer` listens and frees the compiled pipeline + bind groups. Texture disposal works the same way.

---

## 10. `copy()` / `clone()` for NodeMaterial subclasses

Three rules:

1. **Never override `clone()`.** `Object3D.clone()` is `new this.constructor().copy(this, recursive)`. Same pattern for materials.
2. **Always call `super.copy(source)` last** — not first. Copy your `*Node` fields before calling super, because some base-class `copy()` implementations build their own state from those fields.
   See `MeshPhysicalNodeMaterial.js:488-513` for the canonical form:
   ```js
   copy( source ) {
     this.clearcoatNode = source.clearcoatNode;
     this.clearcoatRoughnessNode = source.clearcoatRoughnessNode;
     // ... every *Node field ...
     return super.copy( source );
   }
   ```
3. **Do not deep-copy GPU resources.** Assign textures and geometry by reference. The auto-upgrade path assumes this and copying will break sharing.

For render-to-texture classes using `reflector()` / `pass()`: **do not implement `copy()`**. The node factories create per-instance render targets; cloning shares them and breaks. Tell users to construct fresh instances.

---

## 11. Anti-patterns

- **Writing a `ShaderMaterial` subclass for WebGPU.** It will not work. Use `NodeMaterial`.
- **Treating TSL as a string DSL.** TSL is a JS API. You cannot `` `#include ${snippet}` `` or concatenate shader strings. Compose with `Fn()`, uniforms, and operator methods.
- **Rebuilding node graphs every frame.** Graphs are compiled on first use and cached. Rebuilding forces recompilation. Build once in the constructor, update via `uniform().value`.
- **`mat.colorNode = ... ` in an animation loop.** Reassigning a plug-in node invalidates the pipeline cache. Assign once and drive via uniforms.
- **Using JS operators on nodes: `vec3(1,0,0) + otherVec3`.** JavaScript does not overload `+`, `-`, `*`, `/`. Use `.add()`, `.sub()`, `.mul()`, `.div()`. The JS operator silently gives you `"vec3,0,0,0..."` strings.
- **Forgetting `await renderer.init()`** before the first render. Throws.
- **Calling `renderer.render(scene, camera)` inside `postProcessing.render()`.** Double-renders.
- **Adding the `reflector().target` to nothing.** The virtual camera's transform never updates — the reflection shows a stale frame forever. Always `mesh.add(reflector.target)`.
- **Saving/restoring `renderer.shadowMap.autoUpdate` in `onBeforeRender`.** That's a WebGL idiom. WebGPU handles shadows via `ShadowNode.updateBefore`, not that flag.
- **Disposing shared module-level geometry** in a composite helper's `dispose()`. You will break every other instance that shares it.
- **Allocating `Vector3` / `Matrix4` / node factories inside `Fn(() => ...)` callbacks** that run every frame. The Fn body runs at graph-build time, not per frame — but if you do rebuild per frame (anti-pattern above), the allocations compound the cost.
- **Expecting `material.onBeforeCompile` to work.** It does not exist on the WebGPU path. Subclass and override `setup*` instead.

---

## 12. Further reading in the repo

- `examples/jsm/objects/SkyMesh.js` — complete TSL sky implementation
- `examples/jsm/objects/WaterMesh.js` — TSL water with `reflector()`
- `examples/jsm/objects/LensflareMesh.js` — TSL lensflare with occlusion query
- `src/materials/nodes/NodeMaterial.js` — base class with all `setup*` methods and plug-in property docstrings
- `src/materials/nodes/MeshStandardNodeMaterial.js` — concise concrete subclass example
- `src/materials/nodes/MeshPhysicalNodeMaterial.js` — large example showing `copy()` pattern and extended plug-in property surface
- `src/nodes/utils/ReflectorNode.js` — the mirror-reflection node implementation
- `src/nodes/display/PassNode.js` — post-processing pass node
- `examples/jsm/tsl/display/BloomNode.js` — canonical post-processing effect built from TSL primitives
- `src/helpers/ArrowHelper.js` — canonical composite `Object3D` (renderer-agnostic)
