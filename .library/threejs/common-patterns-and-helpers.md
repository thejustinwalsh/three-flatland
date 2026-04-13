# Common Patterns, Utilities & Helpers (WebGPU)

Cross-cutting three.js infrastructure every WebGPU developer should know about. Documents the shared protocols (events, disposal, layers, `needsUpdate`, node materials) and the built-in helpers in `src/helpers/`, `src/utils.js`, and `src/math/MathUtils.js`.

> Prerequisite reading:
> - `idiomatic-threejs-patterns.md` — render pipeline and Object3D contract
> - `custom-threejs-classes.md` — NodeMaterial extension patterns
> - `tsl-codex.md` — TSL language reference
>
> Imports throughout this doc: `from 'three/webgpu'` for classes, `from 'three/tsl'` for TSL factories.

---

## 1. `EventDispatcher` protocol

Location: `src/core/EventDispatcher.js`. Unchanged from the WebGL path — this is core infrastructure.

All event-emitting classes inherit from `EventDispatcher`:

```js
obj.addEventListener( 'dispose', handler );
obj.removeEventListener( 'dispose', handler );
obj.hasEventListener( 'dispose', handler );
obj.dispatchEvent( { type: 'dispose' } );
```

Event object shape: `{ type: string, target: <the dispatcher> }`. The `target` field is written by `dispatchEvent` at dispatch time and cleared afterwards — **do not retain event objects**; copy fields into local variables inside your listener.

Well-known event types:

| Event | Emitted by | Purpose |
|---|---|---|
| `'dispose'` | `BufferGeometry`, `Material` (incl. all `NodeMaterial`), `Texture`, `RenderTarget`, `Light`, `InstancedMesh`, `StorageBufferAttribute`, ... | GPU cleanup signal (see §2) |
| `'added'` | `Object3D` (on the child) | Parent was set |
| `'removed'` | `Object3D` (on the child) | Parent was cleared |
| `'childadded'` | `Object3D` (on the parent) | A child was added |
| `'childremoved'` | `Object3D` (on the parent) | A child was removed |

The `added`/`removed`/`childadded`/`childremoved` events reuse static event objects at module scope — retaining them gives you stale `target` pointers.

---

## 2. The dispose-event protocol (GPU cleanup)

WebGPU does not reference-count GPU resources. Cleanup is a one-shot pub/sub:

1. User code calls `geometry.dispose()` / `material.dispose()` / `texture.dispose()` / `renderTarget.dispose()`.
2. The method dispatches `{ type: 'dispose' }`.
3. `WebGPURenderer` (specifically the backend-neutral `Renderer` in `src/renderers/common/Renderer.js`) listens via its `Textures`, `Bindings`, `Pipelines`, and `Geometries` managers. The matching GPU resource — `GPUBuffer`, `GPUTexture`, `GPURenderPipeline`, `GPUBindGroup` — is freed.
4. After dispose, the JS object is still valid; reusing it in a draw will re-upload and re-compile.

Consequences:
- **Forgetting `.dispose()` leaks VRAM.** There is no finalizer fallback.
- **Disposing too early** (while another mesh still references the same geometry) is silently fatal — the next draw re-uploads.
- **Disposing a `NodeMaterial` frees its compiled pipeline** — reusing the same material immediately after forces a full node-graph compilation.
- **Dispose events fire synchronously**; listeners run during `dispatchEvent`.

Ownership rule of thumb: if you `new`'d it, you `dispose()` it. If you passed something into another class's constructor, that class typically does **not** take ownership (see §11 below and `custom-threejs-classes.md` §9).

**Additional WebGPU-specific disposables:**
- `StorageBufferAttribute` / `StorageInstancedBufferAttribute` — GPGPU storage buffers
- `Storage3DTexture` / `StorageTexture` — writable textures for compute
- `WebGPURenderer` itself — `renderer.dispose()` releases the whole context

---

## 3. `Layers`: 32-bit visibility mask

Location: `src/core/Layers.js`. Unchanged from WebGL.

```js
const layers = new Layers();         // mask = 1 (layer 0 enabled by default)
layers.set( 3 );                     // layer 3 ONLY  → mask = 0b1000
layers.enable( 1 );                  // layers 1 AND 3  → mask = 0b1010
layers.disable( 3 );                 // layer 1 only  → mask = 0b0010
layers.toggle( 1 );
layers.test( otherLayers );          // true if mask & otherLayers.mask
layers.enableAll();
layers.disableAll();
```

Two places the mask is consulted:

- **Rendering** (`Renderer._projectObject`): objects whose `object.layers.test(camera.layers)` is false are skipped.
- **Raycasting** (`src/core/Raycaster.js`): `raycaster.layers.test(object.layers)` is checked per object.

**Additional WebGPU note:** shadow cameras have their own `Layers`. If a shadow camera's layer mask is the default `0xFFFFFFFE === 0` (no bits set), `ShadowNode.updateShadow` copies the main camera's mask (`src/nodes/lighting/ShadowNode.js:691-695`). If you explicitly set shadow-camera layers for selective shadows, the auto-copy is skipped.

Common uses:
```js
helper.layers.set( 1 );                   // put on layer 1
debugCamera.layers.enable( 1 );           // debug camera sees it; main doesn't
mainRaycaster.layers.set( 0 );            // picking ignores layer 1
```

Gotchas:
- `layers.set(n)` is **exclusive** — it enables layer `n` only. Use `enable(n)` to keep existing.
- `new Layers()` starts on layer 0. `enableAll()` sets all 32 bits.
- Layer masks do not cascade through the scene graph — each `Object3D` has its own `Layers`.

---

## 4. `needsUpdate` flags

Three.js uploads GPU data lazily. A mutable field is dirty until someone sets the matching `needsUpdate` flag.

| Object | Flag | Meaning |
|---|---|---|
| `BufferAttribute` / `Float32BufferAttribute` | `.needsUpdate = true` | Re-upload attribute data on next draw |
| `Material` / `NodeMaterial` | `.needsUpdate = true` | Force pipeline recompile on next use |
| `Texture` | `.needsUpdate = true` | Re-upload pixel data on next draw |
| `InstancedMesh.instanceMatrix` / `.instanceColor` / `.morphTexture` | `.needsUpdate = true` | Re-upload per-instance data |
| `StorageBufferAttribute` | `.needsUpdate = true` | Sync CPU writes into the GPU storage buffer |

Rules:
- **`geometry.needsUpdate = true` does nothing.** The flag lives on each `BufferAttribute`: `geometry.attributes.position.needsUpdate = true`.
- **`material.needsUpdate = true` on a NodeMaterial forces pipeline rebuild.** That's slow — always prefer updating `uniform().value` on reactive uniforms instead, which only updates the GPU buffer.
- **Mutating `Texture.image` does not dirty the texture.** Set `texture.needsUpdate = true`.
- **Reassigning a node on a material (`mat.colorNode = newGraph`) automatically invalidates the pipeline** — no need to set `needsUpdate`. But avoid doing this in hot loops.

---

## 5. `BufferGeometry` essentials

Location: `src/core/BufferGeometry.js`. Methods that matter daily:

| Method | Purpose |
|---|---|
| `setAttribute(name, attribute)` | Add or replace a named attribute. Common names: `'position'`, `'normal'`, `'uv'`, `'color'`, `'skinIndex'`, `'skinWeight'`, `'tangent'`. Returns `this`. |
| `getAttribute(name)` | Retrieve a named attribute. |
| `setIndex(indexAttribute)` | Set the index buffer. |
| `setFromPoints(points)` | Populate a `position` attribute from a `Vector3[]`. |
| `computeBoundingBox()` | Fills `geometry.boundingBox` (`Box3`). Required for accurate raycast and AABB work after position mutations. |
| `computeBoundingSphere()` | Fills `geometry.boundingSphere`. Required for frustum culling and raycast acceleration. |
| `computeVertexNormals()` | Recalculate normals after position changes. |
| `computeTangents()` | Generate tangents for non-MikkT normal mapping workflows. |
| `translate/rotateX/Y/Z/scale` | Bake a transform into vertex positions. |
| `dispose()` | Emit `'dispose'` and free GPU buffers. |

Rules:
- **After mutating `attributes.position.array` directly**, set `attributes.position.needsUpdate = true` and call `computeBoundingSphere()` / `computeBoundingBox()` or culling/raycasting will break silently.
- **A TSL `positionNode` that displaces vertices on the GPU does NOT update the CPU-side bounding sphere.** Either grow the sphere manually or set `frustumCulled = false` on the mesh.
- **`computeBoundingSphere` scans every vertex.** Do not call it per frame on static geometry.

---

## 6. `NodeMaterial` essentials

Location: `src/materials/nodes/NodeMaterial.js`. This is the base class for every material that renders under `WebGPURenderer`.

| Method / property | Purpose |
|---|---|
| `dispose()` | Emit `'dispose'` — renderer frees the compiled pipeline and bind groups. |
| `copy(source)` | Shallow-copy fields; subclasses must copy their own `*Node` fields before calling super. |
| `clone()` | `new this.constructor().copy(this)` — never override. |
| `setup(builder)` | The central override point. Called once on first use to build the shader graph. |
| `setValues(parameters)` | Apply an options object (`{ color, map, metalness, ... }`). Same as classic Material. |
| `isNodeMaterial` | Flag checked by renderer & `NodeLibrary`. |
| `.lights` / `.fog` / `.transparent` / `.depthWrite` / `.depthTest` | Standard flags, same as classic Material. |
| `.side` — `FrontSide` / `BackSide` / `DoubleSide` | Same. Transmission + DoubleSide + !forceSinglePass triggers the dual-pass transmission path. |
| `.forceSinglePass` | Skip dual-pass transmission. |

**The plug-in property pattern** — assign nodes to `colorNode`, `positionNode`, `normalNode`, `fragmentNode`, `vertexNode`, `emissiveNode`, `opacityNode`, `alphaTestNode`, `envNode`, `aoNode`, `lightsNode`, `backdropNode`, `depthNode`, `maskNode`, `outputNode`, `mrtNode`, `castShadowNode`, `castShadowPositionNode`, `maskShadowNode`, `receivedShadowNode`. Full catalog in `custom-threejs-classes.md` §2.

**Shadow customization** is entirely through nodes on the material — there is no `onBeforeShadow` hook:
- `castShadowNode` (vec4) — replaces the cast-shadow color. Alpha is the shadow strength. Using this requires `renderer.shadowMap.transmitted = true` or you get a warning (`src/renderers/common/Renderer.js:3151`).
- `castShadowPositionNode` (vec3) — vertex position used during shadow casting (e.g., for wind-blown foliage that should cast from its displaced position).
- `maskShadowNode` (bool) — discard mask for the shadow pass.
- `receivedShadowNode` (Fn) — modifies incoming shadow color/intensity.

**Classic Material auto-upgrade** — `WebGPURenderer` calls `NodeLibrary.fromMaterial(material)` on draw, converting `MeshBasicMaterial` → `MeshBasicNodeMaterial` and copying fields (`src/renderers/common/nodes/NodeLibrary.js:52-74`). This works for the standard classes but not `ShaderMaterial` — see `custom-threejs-classes.md` §8.

---

## 7. Anatomy of a built-in helper

All of `src/helpers/*` follow the same shape. Unchanged from WebGL — helpers are pure scene-graph visualizations with no renderer dependency. They use classic `LineBasicMaterial`, `MeshBasicMaterial`, etc., which auto-upgrade to node materials in the WebGPU path.

```js
class SomeHelper extends <LineSegments | Line | Mesh | Object3D> {
  constructor( observed, ...options ) {
    const geometry = new BufferGeometry();
    geometry.setAttribute( 'position', new Float32BufferAttribute( ..., 3 ) );
    super( geometry, new SomeMaterial( { ... } ) );

    this.object = observed;               // reference; not owned
    this.type = 'SomeHelper';
    this.matrixAutoUpdate = false;        // if we sync to observed.matrixWorld
    this.update();                        // initial fill
  }

  update() {
    // recompute geometry.attributes.position.array from this.object's state
    this.geometry.attributes.position.needsUpdate = true;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}
```

Base classes used by built-in helpers:

| Helper | Base | Notes |
|---|---|---|
| `AxesHelper` | `LineSegments` | Static, self-owned |
| `BoxHelper` | `LineSegments` | Tracks `object.matrixWorld`; `update()` recomputes AABB |
| `Box3Helper` | `LineSegments` | Overrides `updateMatrixWorld` to sync from a `Box3` |
| `GridHelper` | `LineSegments` | Static |
| `PolarGridHelper` | `LineSegments` | Static |
| `ArrowHelper` | `Object3D` | Composite: Line + Mesh; shared module-level geometry |
| `PlaneHelper` | `Line` | Composite; owns a child `Mesh` for the opaque quad |
| `CameraHelper` | `LineSegments` | Visualizes frustum |
| `SkeletonHelper` | `LineSegments` | Tracks bone chain |
| `DirectionalLightHelper` | `Object3D` | Composite |
| `SpotLightHelper` | `Object3D` | Composite |
| `PointLightHelper` | `Mesh` | Simple sphere |
| `HemisphereLightHelper` | `Object3D` | Composite |

Rules:
- **Helpers do not auto-update.** Call `helper.update()` whenever the observed object changes. There are no listeners.
- **`matrixAutoUpdate = false` is a performance pattern** when the helper's transform is derived (follows `object.matrixWorld`).
- **The `object` field is a reference**, not owned. Do not dispose `helper.object`.
- **`ArrowHelper` is the only built-in helper with module-level shared geometry** — `_lineGeometry`, `_coneGeometry` in `src/helpers/ArrowHelper.js:11-59`. Its `dispose()` technically disposes those shared instances (a latent bug). If you clone that pattern, skip the geometry disposal.

---

## 8. `Raycaster` quick reference

Location: `src/core/Raycaster.js`. Unchanged from WebGL.

```js
const raycaster = new Raycaster();
raycaster.setFromCamera( mouseNDC, camera );
raycaster.near = 0;
raycaster.far = Infinity;
raycaster.layers.enableAll();

raycaster.params.Mesh = {};
raycaster.params.Line.threshold = 1;
raycaster.params.Points.threshold = 1;
raycaster.params.LOD = {};
raycaster.params.Sprite = {};

const hits = raycaster.intersectObject( scene, true );
```

Hit shape: `{ distance, point, face, faceIndex, object, uv, uv1?, normal?, instanceId?, batchId? }`.

Rules:
- **Does NOT call `updateMatrixWorld`.** Call `scene.updateMatrixWorld()` yourself if raycasting outside the render loop.
- **Hits are sorted by `.distance` ascending.**
- **GPU-displaced vertices are invisible to the raycaster.** If you use a TSL `positionNode` for displacement, raycast against the undisplaced geometry or maintain a CPU mirror.
- **`InstancedMesh.raycast`** populates `hit.instanceId`; **`BatchedMesh.raycast`** populates `hit.batchId`.
- `Line` / `Points` picking uses threshold distance in world units; set `params.Line.threshold` per camera distance.

---

## 9. `src/utils.js` contents

A small set of engine-level helpers:

| Function | Purpose |
|---|---|
| `arrayMin(array)` / `arrayMax(array)` | Min/max of a numeric array (handles typed arrays). |
| `arrayNeedsUint32(array)` | True if any index is >= 65536 (i.e., you need `Uint32Array` for indices). |
| `isTypedArray(x)` | Type guard. |
| `createElementNS(name)` | `document.createElementNS(xhtmlNS, name)`. |
| `createCanvasElement()` | Returns a configured canvas element. |
| `log` / `warn` / `error` / `warnOnce` | Prefixed console wrappers. |
| `setConsoleFunction(fn)` / `getConsoleFunction()` | Redirect three.js logs to a custom handler. |
| `probeAsync(gl, sync, interval)` | WebGL sync polling (WebGL only; unused in WebGPU path). |
| `toNormalizedProjectionMatrix(m)` / `toReversedProjectionMatrix(m)` | Projection matrix conversions for reversed-Z depth. |

Day-to-day usefulness: `arrayNeedsUint32` (generating geometries) and `setConsoleFunction` (routing logs).

---

## 10. `src/math/MathUtils.js` quick reference

The handful you will actually use:

| Function | Purpose |
|---|---|
| `generateUUID()` | RFC 4122 UUID string. |
| `clamp(x, a, b)` | `Math.max(a, Math.min(b, x))`. |
| `lerp(x, y, t)` | Linear interpolation. |
| `inverseLerp(a, b, x)` | Reverse of lerp. |
| `mapLinear(x, a1, a2, b1, b2)` | Remap from one range to another. |
| `degToRad(d)` / `radToDeg(r)` | Angle conversions. |
| `euclideanModulo(n, m)` | Modulo that always returns positive. |
| `smoothstep(x, min, max)` / `smootherstep(...)` | Hermite easing. |
| `pingpong(t, length)` | Bouncing `0..length..0`. |
| `randFloat(a, b)` / `randInt(a, b)` / `randFloatSpread(range)` | Uniform random. |
| `floorPowerOfTwo(x)` / `ceilPowerOfTwo(x)` / `isPowerOfTwo(x)` | For texture sizing. |

These are JavaScript utilities — they are **not** TSL nodes. TSL has its own `clamp`, `mix`, `smoothstep`, `lerp`, etc. that work on node values; see `tsl-codex.md`.

---

## 11. Disposal ownership rules, summarized

| Thing | Owned by | Dispose when |
|---|---|---|
| `BufferGeometry` you created with `new` | You | No more meshes reference it |
| `NodeMaterial` / classic `Material` you created with `new` | You | No more meshes reference it |
| `Texture` you loaded or created | You | No more materials reference it |
| `WebGPURenderTarget` / its `.texture` | You | Disposing the target disposes its texture |
| `BufferGeometry` returned by a loader | You | Per your lifecycle |
| Geometry/material passed **in** to an addon constructor | The caller | Addon will not dispose |
| Geometry/material created **inside** an addon constructor | The addon | The addon's `dispose()` handles it (if present) |
| `Mesh` / `Object3D` itself | Nothing to dispose | GC handles it |
| `InstancedMesh.instanceMatrix` | The `InstancedMesh` | `instancedMesh.dispose()` |
| `StorageBufferAttribute` / `Storage*Texture` | You | When compute graph is torn down |
| `ReflectorNode` internal render target | The node | Call `reflectorNode.dispose()` |
| `PassNode` internal render target | The node | Call `passNode.dispose()` |
| `WebGPURenderer` | You | `renderer.dispose()` on context teardown |
| Shared static geometries (`ArrowHelper._lineGeometry`) | Nobody | Accept the tiny leak |

**Rule of thumb**: `scene.remove(obj)` does **not** dispose anything. Pair it with `obj.geometry.dispose()` and `obj.material.dispose()` if you own them.

---

## 12. Non-obvious WebGPU gotchas

1. **`scene.remove(mesh)` frees no GPU memory.** Pair with `mesh.geometry.dispose()` and `mesh.material.dispose()`. `NodeMaterial` disposal releases the compiled pipeline and bind groups.
2. **Disposing a `NodeMaterial` that is still in use crashes the next draw.** There is no ref-count; only dispose after every mesh using it has been removed from the scene.
3. **Reassigning plug-in nodes forces recompilation.** `mat.colorNode = someNewGraph` invalidates the cached pipeline. Prefer building the graph once in the constructor and driving state via `uniform().value`.
4. **`uniform().value = x` does NOT trigger recompilation.** It just schedules a GPU buffer upload for the next draw.
5. **Shadow rendering is a nested `renderer.render()` call.** `scene.onBeforeRender` / `onAfterRender` will fire once per shadow cascade plus once for the main pass. Key off `renderer.getRenderTarget()` to distinguish.
6. **`Raycaster` is CPU-only and ignores GPU displacement.** If you use a TSL `positionNode`, picking uses the undisplaced geometry.
7. **`needsUpdate` on a NodeMaterial triggers a full rebuild.** Reserve it for cases where you must force recompile (rare); prefer uniform updates.
8. **`BundleGroup.version++` is manual.** Three.js does not watch the subtree for changes. Increment `version` after adding/removing children.
9. **Shadow cameras copy the main camera's layer mask** only if their own mask is the default. Setting a custom shadow-camera layer mask disables the auto-copy (`ShadowNode.js:691-695`).
10. **`EventDispatcher` listeners run synchronously.** A throw inside a `dispose` listener can unwind the middle of a frame.
11. **`Texture.dispose()` emits the event but keeps `.image` around.** Null it yourself if you want the CPU-side image to GC.
12. **Clones share GPU state.** `mesh.clone()` gives you a new `Mesh` but the same `BufferGeometry`, `NodeMaterial`, and compiled pipeline. Breaking that sharing means explicit `.clone()` on the geometry/material.
13. **`renderer.render(scene, camera)` is synchronous.** GPU work is queued; the return does not mean rendering finished. For deterministic readback use `renderer.getArrayBufferAsync(attribute)` or `renderer.resolveTimestampsAsync()`.
14. **No `onBeforeShadow` / `onAfterShadow` / `onBeforeCompile` hooks.** Migrate to `castShadowNode` / `receivedShadowNode` / `NodeMaterial.setup()` overrides.
15. **`material.customProgramCacheKey` is not used by NodeMaterial.** The node graph itself is the cache key.
