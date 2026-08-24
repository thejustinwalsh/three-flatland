import type { Scene, Texture } from 'three'
import { select, type World } from '../ecs/runtime'
import type { Sprite2D } from '../sprites/Sprite2D'
import type { Sprite2DMaterial, Sprite2DMaterialOptions } from '../materials/Sprite2DMaterial'
import { SpriteGroup } from '../pipeline/SpriteGroup'
import { BatchRegistry } from '../ecs/traits'
import { getWorldDefaultMaterial, getWorldEffectVariant, type RegistryData } from '../ecs/batchUtils'
import type { BatchQueryView } from '../pipeline/batchQuery'
import { buildBatchQueryView } from '../internal/batch-query-builder'
import { getSpriteGroupWorld, isSpriteGroupRuntimeLive } from '../internal/sprite-group-runtime'

const BatchRegistries = select(BatchRegistry)

/**
 * Module-global registry key. `Symbol.for` survives double-bundling —
 * two module copies in one realm resolve to the same registered symbol,
 * so they share one registry host instead of orchestrating twice.
 * Cross-realm separation (iframes, workers) is a fundamental constraint
 * we don't try to solve.
 */
const REGISTRY_SYMBOL = Symbol.for('three-flatland.registry')

/** Host shape stored on the renderer under {@link REGISTRY_SYMBOL}. */
interface RegistryHost {
  scenes: WeakMap<Scene, Registry>
}

/**
 * Renderers are opaque WeakMap-ish hosts here — the registry never
 * calls renderer methods; it only needs identity for isolation. Keeps
 * the orchestration layer renderer-agnostic (WebGPURenderer today,
 * anything object-shaped tomorrow).
 */
export type RendererLike = object

/**
 * Per-(renderer, scene) orchestration state.
 *
 * The registry is the auto-orchestrate counterpart of an explicit
 * `SpriteGroup`: it owns a hidden SpriteGroup (ECS world + system
 * schedule + batch-mesh container) that materializes into the scene on
 * first use. Nothing constructs one of these until a primitive actually
 * shows up in a rendered scene — see `getOrCreateRegistry`.
 *
 * GC chain: the host lives on the renderer; scenes key a WeakMap.
 * Drop the scene → registry unreachable. Drop the renderer → all of its
 * registries unreachable. No module-level strong refs.
 */
export class Registry {
  readonly renderer: RendererLike
  readonly scene: Scene

  /**
   * Hidden orchestrator container — a SpriteGroup that carries the ECS
   * world, the system schedule, and parents the auto-created batch
   * meshes. Added to the scene lazily when orchestration activates.
   */
  readonly group: SpriteGroup

  /**
   * Registered auto-orchestrated sprites. Lookup collection (material
   * dispose, wholesale cleanup) — never iterated per frame.
   */
  readonly sprites = new Set<Sprite2D>()

  /**
   * Per-texture default materials, replacing the module-static shared
   * cache. Populated by the material-lifecycle slice; declared here so
   * the storage shape is complete from day one.
   */
  readonly defaultMaterials = new WeakMap<Texture, Sprite2DMaterial>()

  /**
   * Auto-registered sprites not yet enrolled in the batching world —
   * each waits standalone until its run reaches the promotion threshold
   * (2) or an active batch for its run already exists.
   */
  readonly standalone = new Set<Sprite2D>()

  /** Set when standalone membership changed; drained by the scene sweep. */
  _autoEvalDirty = false

  /** Idempotency marker for the chained `Scene.onBeforeRender` install. */
  _sceneHookInstalled = false

  /** The user's original `Scene.onBeforeRender`, preserved in the chain. */
  _originalSceneOnBeforeRender: Scene['onBeforeRender'] | null = null

  constructor(renderer: RendererLike, scene: Scene) {
    this.renderer = renderer
    this.scene = scene
    this.group = new SpriteGroup()
    this.group.name = 'FlatlandOrchestrator'
  }

  private get _runtimeWorld(): World {
    return getSpriteGroupWorld(this.group)
  }

  /**
   * Get (or create) this registry's default material for a texture.
   * Backed by the world-scoped store, so effect registration and
   * dispose stay isolated between registries/Flatlands sharing textures.
   */
  getDefaultMaterial(texture: Texture): Sprite2DMaterial {
    // Accessing `world` materializes the hidden group's ECS world +
    // BatchRegistry singleton on first use.
    const world = this._runtimeWorld
    const data = this._registryData()!
    return getWorldDefaultMaterial(world, data, texture)
  }

  /**
   * Get (or create) this registry's effect-variant material for a
   * texture + configuration — the constants-effect counterpart of
   * `getDefaultMaterial`.
   */
  getEffectVariant(texture: Texture, options: Sprite2DMaterialOptions): Sprite2DMaterial {
    const world = this._runtimeWorld
    const data = this._registryData()!
    return getWorldEffectVariant(world, data, texture, options)
  }

  /**
   * Live view of this registry's batches keyed by run key. Reads
   * through to the ECS BatchRegistry singleton — no parallel
   * bookkeeping to drift.
   */
  get batches(): BatchQueryView {
    return buildBatchQueryView(this._runtimeWorld, this._registryData())
  }

  /** @internal */
  _registryData(): RegistryData | null {
    const world = this._runtimeWorld
    const registryEntities = world.view(BatchRegistries)
    if (registryEntities.length === 0) return null
    return (world.read(registryEntities[0]!, BatchRegistry) as RegistryData | undefined) ?? null
  }
}

/**
 * Get (or lazily create) the registry for a (renderer, scene) tuple.
 *
 * Same tuple → same registry. Two renderers × one scene → two
 * registries (different GPU resource graphs). One renderer × two
 * scenes → two registries (different ECS worlds).
 */
export function getOrCreateRegistry(renderer: RendererLike, scene: Scene): Registry {
  const host = getOrCreateHost(renderer)
  let registry = host.scenes.get(scene)
  if (registry && !isSpriteGroupRuntimeLive(registry.group)) {
    retireRegistry(registry)
    host.scenes.delete(scene)
    registry = undefined
  }
  if (!registry) {
    registry = new Registry(renderer, scene)
    host.scenes.set(scene, registry)
  }
  return registry
}

/** Get the registry for a tuple if one exists; never creates. */
export function peekRegistry(renderer: RendererLike, scene: Scene): Registry | null {
  const host = (renderer as Record<symbol, unknown>)[REGISTRY_SYMBOL] as RegistryHost | undefined
  const registry = host?.scenes.get(scene)
  if (!registry) return null
  if (isSpriteGroupRuntimeLive(registry.group)) return registry
  retireRegistry(registry)
  host!.scenes.delete(scene)
  return null
}

/** Drop every strong/semantic edge held by a terminal auto registry. */
function retireRegistry(registry: Registry): void {
  if (registry.group.parent === registry.scene) registry.scene.remove(registry.group)
  for (const sprite of registry.sprites) {
    const runtimeSprite = sprite as unknown as { _autoRegistry: Registry | null }
    if (runtimeSprite._autoRegistry === registry) runtimeSprite._autoRegistry = null
    sprite._setBatchSuppressed(false)
  }
  registry.sprites.clear()
  registry.standalone.clear()
  registry._autoEvalDirty = false
}

function getOrCreateHost(renderer: RendererLike): RegistryHost {
  const holder = renderer as Record<symbol, unknown>
  let host = holder[REGISTRY_SYMBOL] as RegistryHost | undefined
  if (!host) {
    host = { scenes: new WeakMap() }
    holder[REGISTRY_SYMBOL] = host
  }
  return host
}
