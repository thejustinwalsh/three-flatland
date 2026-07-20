# Rendering architecture — registry, orchestration, ECS, extension

**Status:** Design canonical  ·  **Authored:** 2026-05-17

The master architecture doc for three-flatland's rendering layer. Captures the philosophy and the patterns; sibling docs (`AUTO-BATCH-DESIGN.md`, `GEOMETRY-PIPELINE-OPTIMIZATION.md`, future `LAYERS-AND-EXTENSION-API.md`) cover specific features.

Companion diagrams in `/planning/diagrams/`:
- `ecs-and-traits.excalidraw` — Koota traits as composition primitive
- `registry-shape.excalidraw` — per-(renderer, scene) state isolation
- `orchestration-lifecycle.excalidraw` — lazy materialization timeline
- `sort-layers.excalidraw` — sortLayer / layers / zIndex orthogonality + run-key composition

Sibling docs: `SORT-LAYERS-DESIGN.md` (sortLayer concept, run-key composition, setter interception).

---

## Operating principles

These are commitments, not suggestions. Every design decision in this doc derives from them.

1. **Three.js first.** Every primitive (`Sprite2D`, `AnimatedSprite2D`, `ParticleSystem`, `SpriteGroup`, future custom batchers) works as a vanilla `Object3D` in any three.js scene without a `Flatland` wrapper. R3F support falls out for free because the primitives are well-behaved Three classes.

2. **Flatland is opinionated, not required.** Explicit `new Flatland()` gives users eager setup + a place to declare opinionated config (camera, render target, post stack, layers). It is *not* the orchestration spine — orchestration works without it.

3. **No singletons.** Per-(renderer, scene) state lives in WeakMaps keyed via `Symbol.for('three-flatland.registry')`. Multiple renderers, multiple scenes, multiple Flatlands compose without coordination.

4. **Lazy materialization.** The orchestrator doesn't exist until something is rendered. First primitive to hit the scene tree triggers registry creation.

5. **Facade-only public API.** Users never touch Koota, never receive raw worlds or trait handles. Everything goes through typed facades we control. The day we swap Koota for something else, the public API doesn't change.

6. **Traits as composition primitive.** Koota traits do three jobs simultaneously: declare data shape, drive system dispatch, gate runtime branches. Use them for all three; never as one-trick perf knobs.

7. **Discipline over magic.** When the system makes invisible decisions (auto-batching, geometry strategy selection), the decisions are deterministic, derivable from public facts (material, sortLayer, layers mask, blend mode), and documented. No heuristics that drift.

---

## The orchestrator: per-(renderer, scene) registry

### Storage shape

```ts
const REGISTRY_SYMBOL = Symbol.for('three-flatland.registry')

function getOrCreateRegistry(renderer: Renderer, scene: Scene): Registry {
  let host = renderer[REGISTRY_SYMBOL] as { scenes: WeakMap<Scene, Registry> }
  if (!host) {
    host = { scenes: new WeakMap() }
    renderer[REGISTRY_SYMBOL] = host
  }
  let registry = host.scenes.get(scene)
  if (!registry) {
    registry = new Registry(renderer, scene)
    host.scenes.set(scene, registry)
  }
  return registry
}
```

Why `Symbol.for(...)`: survives double-bundle (same registered symbol across module copies in one realm), avoids genuine global pollution, namespaced. Cross-realm separation is a fundamental constraint we don't try to solve.

Why nested WeakMap: same scene rendered by two renderers = two registries (correct, different GPU resource graphs). Same renderer rendering two scenes = two registries (correct, different ECS worlds). GC follows whichever key gets dropped.

### Registry contents

Each `Registry` owns:

```ts
class Registry {
  readonly renderer: Renderer
  readonly scene: Scene

  // Koota world — internal, never exposed
  readonly world: World

  // Per-texture default Sprite2DMaterial (replaces module-level static cache)
  readonly defaultMaterials: WeakMap<Texture, Sprite2DMaterial>

  // Material → batches (tiered, see AUTO-BATCH-DESIGN.md)
  readonly batches: Map<RunKey, SpriteBatch[]>

  // Registered renderable primitives, for lookup (not per-frame iteration)
  readonly sprites: Set<Sprite2D>
  readonly particleSystems: Set<ParticleSystem>
  // ...future batcher kinds

  // Scene hook install marker — chained Scene.onBeforeRender is idempotent
  _sceneHookInstalled = false
  _originalSceneOnBeforeRender: SceneCallback | null = null
}
```

The registry owns its Koota world; sprites register *into* that world. Multiple Flatlands = multiple worlds = no cross-world entity collisions, no shared subscriptions.

### Lifecycle

| Event | What happens |
|---|---|
| First `Sprite2D` added to scene | `'added'` event walks parent → finds scene → primes registry, installs `Scene.onBeforeRender` chain |
| If `'added'` walk failed (detached subtree) | Sprite's first `onBeforeRender` fires → registers via fallback path → installs scene hook for next frame |
| Explicit `new Flatland()` then `scene.add(flatland)` | Flatland's `'added'` handler primes registry eagerly; first render binds renderer |
| `renderer.render(scene, camera)` | Chained `Scene.onBeforeRender` runs ECS systems (dirty-tracked) → batch flush (dirty-tracked) → render list built fresh. No per-sprite eligibility iteration |
| Subsequent renders (pass 2, shadows, XR, RTT) | Sweep is idempotent; dirty-tracking short-circuits clean work |
| `scene` GC'd | Registry GC'd (held only by host's WeakMap) |
| `renderer` GC'd | All registries for this renderer GC'd |
| Material `dispose` event | Batches using that material torn down; default-material sprites resurrected synchronously inside the dispose handler |

---

## Lazy materialization: dual-signal registration

The registration mechanism uses two complementary signals. Neither alone is sufficient; together they cover every case.

### Signal A — opportunistic via `'added'` (first-frame correct path)

```ts
class Sprite2D extends Mesh {
  constructor(opts) {
    super(/* ... */)
    this.addEventListener('added', this._onAddedToTree)
  }
  _onAddedToTree = () => {
    // walk parent chain to find scene
    let p = this.parent
    while (p && !p.isScene) p = p.parent
    if (p) flatlandPrime(p, this)
  }
}
```

Works when the sprite is added to a tree already attached to a scene (the common case). Scene hook installs *before* the next render. First render is auto-batched correctly.

### Signal B — fallback via `onBeforeRender` (one-frame-late but always works)

```ts
onBeforeRender(renderer, scene, camera, geo, mat, group) {
  if (this._flatlandRegistered) return     // hot path
  flatlandRegister(this, renderer, scene)
  this._flatlandRegistered = true
}
```

Catches the case `'added'` misses: detached subtree built up, then attached. (`'added'` only fires on the directly-added node, descendants get nothing — three.js gotcha, verified.) First render of these sprites draws standalone; subsequent renders are batched.

### Why both

Combined: every case is covered. Optimal case (A only) ships zero-frame-latency auto-batch. Degraded case (B only) costs one frame of individual draws then converges. Never broken.

**Helper, not mixin:** both signals call a module-level function (`flatlandPrime` / `flatlandRegister`). No inheritance gymnastics, no prototype touch beyond what each Mesh subclass already does. Hot path on Signal B is a single property check + return.

### Verified: scene mutation in `Scene.onBeforeRender` is same-render-call visible

From three's `Renderer.js`:

```
913: sceneRef.onBeforeRender(this, scene, camera, renderTarget)
917: renderList.begin()
920: this._projectObject(scene, camera, 0, renderList, renderContext.clippingContext)
```

`_projectObject` walks `object.children` live (line 3016: `const children = object.children; for (let i = 0, l = children.length; ...)`). So when the chained handler in step 913 adds a SpriteBatch and sets sprites' `visible = false`, the walk in step 920 picks up the changes in the same render call.

This is the foundation of zero-frame-latency auto-batch. Not optional.

---

## ECS as the composition layer

### Three jobs of a trait

Koota traits are used for all three simultaneously, never as single-purpose markers:

| Job | Example |
|---|---|
| **Data shape** | `LitBatch { lightCount, shadowMapRef }` — data only exists where it applies |
| **Dispatch** | `world.query(IsAnimated, SpriteUV)` — which system bodies run |
| **Branch** | `entity.has(CastsShadow)` — cheap per-entity check inside a wider loop |

The query-vs-branch decision is a *tuning knob per system*, not a property of the trait. Same trait can be:
- A query filter in one system (`animationTickSystem` queries `IsAnimated` only)
- A branch in another (`renderSweepSystem` iterates all and checks `entity.has(IsAnimated)` for per-sprite cost differences)

The trait existence is what enables both options. The choice between them is workload-driven.

### When to query vs when to branch (the cost rule)

> **Trait when the system would otherwise touch entities it doesn't care about.**
> **Branch when the system already had to touch them.**

| System | Iterates | Trait or branch? |
|---|---|---|
| `batchSortSystem` | All batches (few, stable) | Branch on `material.transparent` |
| `sceneGraphSyncSystem` | All batches | Branch |
| `animationTickSystem` | Only animated sprites (subset) | **Query `IsAnimated`** |
| `particleLifecycleSystem` | Only particles | **Query `IsParticle`** |
| `shadowCasterSweep` | Only casters | **Query `CastsShadow`** |

The principle: predictable branches at low cardinality are free; skipping work entirely at high cardinality wins. The trait declarations stay constant; the system implementations evolve as workload shifts.

### Internal vs public traits

| Surface | Examples | Visibility |
|---|---|---|
| **Internal** (bookkeeping) | `IsBatched`, `InBatch`, `BatchSlot`, `BatchMesh`, `SpriteColor`, `SpriteUV` | Never exposed; would change with internal refactors |
| **Public** (rendering classification) | `IsAlphaBlendedBatch`, `IsLitBatch`, `BatchGeometryStrategy` | Read-only via facade |
| **Public** (sprite-level opt-in) | `IsAnimated`, `CastsShadow`, `IsBillboard`, `IsParticle` | Set via typed sprite/batcher APIs; queryable via facade |
| **User-defined** (sort layers) | `interface SortLayerRegistry` augmentation | TanStack-style, fully typed |

Public traits flow through facade methods; users never import Koota types. The Koota dependency is genuinely swappable.

### TanStack-style sortLayer registry

```ts
// in core
export interface SortLayerRegistry {
  default: BuiltInSortLayer
  ui:      BuiltInSortLayer
}

// in user code
declare module 'three-flatland' {
  interface SortLayerRegistry {
    outline:   OutlineSortLayer
    radarBlip: RadarBlipSortLayer
  }
}

// typed access
flatland.declareSortLayer('outline', { renderOrder: 10 })
flatland.sortLayer('outline').onRender(({ batches }) => { /* ... */ })
sprite.sortLayer = 'outline'  // type-checked

// Three's primitives stay orthogonal — escape hatches when needed
sprite.layers.enable(SHADOW_BIT)   // camera filter; routes sprite to a differently-masked batch
sprite.renderOrder = 999           // ESCAPES sortLayer entirely; sprite goes standalone
```

Internally each sortLayer registers a Koota trait (`SortLayer`, cross-primitive — used by Sprite2D, ParticleSystem, future batchers alike). Externally users see typed handles only. See `SORT-LAYERS-DESIGN.md` for the full design.

---

## Material lifecycle: registry-scoped defaults + resurrection

### Default material per (registry, texture)

The old `Sprite2D._sharedMaterials` static cache (a module-level singleton footgun) moves into the registry:

```ts
class Registry {
  readonly defaultMaterials: WeakMap<Texture, Sprite2DMaterial> = new WeakMap()

  getDefaultMaterial(texture: Texture): Sprite2DMaterial {
    let m = this.defaultMaterials.get(texture)
    if (!m) {
      m = new Sprite2DMaterial({ map: texture, transparent: true })
      this.defaultMaterials.set(texture, m)
      m.addEventListener('dispose', () => this._onMaterialDispose(m))
    }
    return m
  }
}
```

Cost of per-registry materials: trivial. Three's `Pipelines.js` (line 176–198) deduplicates `ProgrammableStage` instances by shader source string — if two Sprite2DMaterials produce identical TSL output, the compiled shader program is shared automatically, even though the JS material instances are separate. **No extra compile cost.**

Benefit: full isolation. Effects registered on one Flatland's material don't pollute another's. Dispose on one Flatland doesn't break another.

### Resurrection on dispose (default-material path)

For sprites using registry-supplied defaults:

```ts
material.addEventListener('dispose', () => {
  for (const sprite of registry.spritesForMaterial(material)) {
    if (sprite._materialWasRegistryDefault && sprite._texture) {
      sprite.material = registry.getDefaultMaterial(sprite._texture)
      // sprite auto-rebatches via the standard registration path (next add/render event)
    } else {
      sprite.visible = true
      sprite._registered = false
      // three.js semantics for "disposed material in use" apply
    }
  }
  // tear down our batches that used this material
  for (const batch of registry.batchesForMaterial(material)) {
    batch.dispose()
    registry.removeBatch(batch)
  }
  registry.unregisterMaterial(material)
})
```

Sprites holding registry-default materials survive dispose-and-reuse cycles transparently. Sprites with user-supplied custom materials are the user's responsibility (three's standard "disposed material in use" applies — they break, we warn).

---

## Composition with three.js / R3F idioms

### Three.js side: project walker as the discovery mechanism

Inspired by three's `ClippingGroup` pattern — context flows DOWN at render time, children don't query UP.

```ts
function project(obj, registry, batcher) {
  if (obj.isBatcher) batcher = obj
  if (obj.isFlatlandLeaf) {
    if (!batcher) batcher = registry.implicitBatcherFor(obj)
    batcher.enqueue(obj)
  }
  for (const c of obj.children) project(c, registry, batcher)
}
```

Runs inside the chained `Scene.onBeforeRender`. Re-discovered every frame → reparent-safe by construction. `'added'`/`'removed'` events are unreliable for primary discovery (don't fire on descendants of detached subtrees; three's own internal code uses zero `'added'` listeners) — used only as opportunistic priming.

### R3F side: free, no extra layer

R3F constructs three.js Object3D trees from JSX. When `<sprite2D />` mounts, R3F:

1. Creates `new Sprite2D()` via the `extend()`-registered class
2. Calls `parent.add(sprite)` through the reconciler
3. Fires the standard three.js `'added'` event on the Sprite2D

That `'added'` event is the same signal A as the vanilla path. Our handler walks up to find the scene, primes the registry, done. When R3F renders via `state.gl.render(state.scene, state.camera)`, our chained `Scene.onBeforeRender` fires. **Same orchestration path as vanilla three.js, end-to-end.**

There is no React Context to add, no provider wrapper, no `useLayoutEffect` to register, no `<FlatlandBridge>` for portals. The state lives on the renderer (via `Symbol.for`-keyed WeakMap); R3F already gives us that renderer; the scene graph is the wire. We don't need to manufacture a second wire on top in React.

**R3F support requires only:**

| Requirement | Where |
|---|---|
| `extend({ Sprite2D, SpriteGroup, Flatland, ... })` | One-time call in the `three-flatland/react` subpath |
| No-arg construction + property setters | Existing AGENTS.md project rule |
| Typed JSX via `ThreeElements` augmentation | Existing pattern in `packages/three-flatland/src/react/types.ts` |

Per-Canvas isolation is free — R3F's `_roots: Map<canvas, Root>` gives each Canvas its own renderer; our `WeakMap<Renderer, ...>` registry shape naturally isolates without any further coordination. Portals are free — moving a node fires standard `'removed'`/`'added'` events; the registry on the destination scene picks the sprite up via the normal path.

Why react-postprocessing and drei's `<Selection>` use React Context (and we don't): those libraries hold state with no natural three.js home (the EffectComposer instance, the selection list). They have to thread context to bridge the gap. Every concept in three-flatland (`Flatland`, `SpriteGroup`, `Sprite2D`) **is** an Object3D — three's parent chain is the wire. We just use it.

### Multi-Flatland chaining = free via three's TSL graph

Outer Flatland samples inner Flatland's `outputNode` directly. Three's `RenderPipeline` topological ordering handles the dependency. No registration API.

```ts
outerFlatland.pipeline.slot('base') = sample(innerFlatland.outputNode)
```

---

## Renderer hooks: what we have, what we don't

From source inspection (`/Users/tjw/Developer/three-flatland/node_modules/.pnpm/three@*/node_modules/three/src/renderers/`):

| Hook | Verdict |
|---|---|
| `Scene.onBeforeRender` (chainable property) | **Primary frame hook** |
| `Object3D.onBeforeRender` (per object) | Fallback registration, late-binding |
| `material.addEventListener('dispose')` | **Cleanup signal** |
| `geometry.addEventListener('dispose')` | Cleanup |
| `CanvasTarget.addEventListener('resize')` | Resize-driven re-layout |
| `renderer.setRenderObjectFunction(fn)` | Powerful but single-slot. Tied to explicit Flatland path only; documented chain protocol; not used for auto-orchestrate |
| `__THREE_DEVTOOLS__` global EventTarget | Not useful (only fires if listener pre-exists) |
| `Renderer.addEventListener(...)` | **Does not exist** — Renderer doesn't extend EventDispatcher |

The notable gap: there's no public per-frame event on the renderer itself. The chained `Scene.onBeforeRender` is the universal hook. We work within that.

---

## Cross-cutting concerns

### Re-entry (shadow, XR, RTT, PassNode)

Renderer renders the same scene multiple times per logical frame in several cases. Our chained handler fires each time. Dirty tracking handles correctness:
- New work since last render? Run ECS systems, flush GPU.
- Nothing dirty? Sweep is O(registered) read-only check; cheap.

No "logical frame boundary" detection needed. The dirty bit *is* the frame boundary.

### Cleanup paths

| Trigger | Action |
|---|---|
| Sprite removed from scene | `'removed'` event → registry unregisters → batch slot freed synchronously |
| Material disposed | Batches torn down, default-material sprites resurrected |
| Texture disposed | Default material entry GC'd (WeakMap keyed by texture) |
| Scene replaced / dropped | Registry GC'd via WeakMap chain |
| Renderer disposed | All registries for this renderer GC'd |

### Multi-renderer / multi-canvas

R3F's per-Canvas Zustand stores + per-Canvas `_roots: Map<canvas, Root>` give isolation for free. Our registry's WeakMap-of-WeakMaps composes with that — different Canvases use different renderers, get different registries. No cross-Canvas state.

Same scene rendered by two renderers (rare): two registries, both correct, both managing their own GPU resources for the same CPU sprites. Acceptable cost.

---

## What this architecture deliberately doesn't do

- **Doesn't prescribe gameplay ECS.** Users bring their own ECS (or none); we never expose ours. The user-defined-layers extension is *rendering* only.
- **Doesn't auto-create scenes / canvases / renderers.** Users own those. We respond to their lifecycle.
- **Doesn't poison global scope.** `Symbol.for` is the only module-global. No `window.__flatland__`, no module-scope singletons.
- **Doesn't promise behavior across realms/processes.** Iframe boundaries and Workers are fundamental constraints; we don't pretend to handle them.
- **Doesn't make the user think about orchestration.** The promise: drop a Sprite2D into any three.js scene, it just works — batched correctly, isolated from other scenes, integrated into any future passes the user adds.

---

## Open items tracked elsewhere

- Tier sizes for auto-batch buffers — `AUTO-BATCH-DESIGN.md`
- Geometry strategy split (synth-quad vs tight-mesh) — `GEOMETRY-PIPELINE-OPTIMIZATION.md`
- Public layer API surface in detail — future `LAYERS-AND-EXTENSION-API.md`
- Phase-callback API for advanced render extension — future `RENDERING-EXTENSION-API.md`
