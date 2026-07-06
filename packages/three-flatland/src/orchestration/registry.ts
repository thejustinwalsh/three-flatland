import type { Scene, Texture } from 'three'
import type { World } from 'koota'
import type { Sprite2D } from '../sprites/Sprite2D'
import type { Sprite2DMaterial } from '../materials/Sprite2DMaterial'
import type { SpriteBatch } from '../pipeline/SpriteBatch'
import { SpriteGroup } from '../pipeline/SpriteGroup'
import { BatchMesh, BatchRegistry } from '../ecs/traits'
import { getWorldDefaultMaterial, type RegistryData, type RunKey } from '../ecs/batchUtils'

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

  /** The Koota world backing this registry (owned by the hidden group). */
  get world(): World {
    return this.group.world
  }

  /**
   * Get (or create) this registry's default material for a texture.
   * Backed by the world-scoped store, so effect registration and
   * dispose stay isolated between registries/Flatlands sharing textures.
   */
  getDefaultMaterial(texture: Texture): Sprite2DMaterial {
    // Accessing `world` materializes the hidden group's ECS world +
    // BatchRegistry singleton on first use.
    const world = this.world
    const data = this._registryData()!
    return getWorldDefaultMaterial(world, data, texture)
  }

  /**
   * Live view of this registry's batches keyed by run key. Reads
   * through to the ECS BatchRegistry singleton — no parallel
   * bookkeeping to drift.
   */
  get batches(): Map<RunKey, SpriteBatch[]> {
    const result = new Map<RunKey, SpriteBatch[]>()
    const data = this._registryData()
    if (!data) return result
    for (const [key, run] of data.runs) {
      const meshes: SpriteBatch[] = []
      for (const batchEntity of run.batches) {
        const mesh = batchEntity.get(BatchMesh)?.mesh
        if (mesh) meshes.push(mesh)
      }
      result.set(key, meshes)
    }
    return result
  }

  /** @internal */
  _registryData(): RegistryData | null {
    const world = this.group.world
    const registryEntities = world.query(BatchRegistry)
    if (registryEntities.length === 0) return null
    return (registryEntities[0]!.get(BatchRegistry) as RegistryData | undefined) ?? null
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
  if (!registry) {
    registry = new Registry(renderer, scene)
    host.scenes.set(scene, registry)
  }
  return registry
}

/** Get the registry for a tuple if one exists; never creates. */
export function peekRegistry(renderer: RendererLike, scene: Scene): Registry | null {
  const host = (renderer as Record<symbol, unknown>)[REGISTRY_SYMBOL] as RegistryHost | undefined
  return host?.scenes.get(scene) ?? null
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
