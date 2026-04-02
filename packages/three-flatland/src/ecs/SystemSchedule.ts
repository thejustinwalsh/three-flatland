import type { World } from 'koota'

/**
 * A system function takes only a world — all context comes from world resource traits.
 */
export type SystemFn = (world: World) => void

/**
 * Ordered system runner with frame-level idempotency.
 *
 * Systems are registered via `add()` and executed in registration order
 * by `run()`. Calling `run()` multiple times within the same frame is
 * a no-op after the first — `nextFrame()` advances the frame counter
 * to allow the next execution.
 *
 * @example
 * ```typescript
 * const schedule = new SystemSchedule()
 * schedule.add(lightSyncSystem)
 * schedule.add(batchAssignSystem)
 *
 * // In render loop:
 * schedule.nextFrame()
 * schedule.run(world)  // executes all systems
 * schedule.run(world)  // no-op (same frame)
 * ```
 */
export class SystemSchedule {
  private _systems: SystemFn[] = []
  private _frameId = 0
  private _lastRunFrame = -1

  /** Register a system at the end. Execution order matches registration order. */
  add(system: SystemFn): this {
    if (!this._systems.includes(system)) {
      this._systems.push(system)
    }
    return this
  }

  /** Register a system at the beginning. Used to insert phases before existing systems. */
  prepend(system: SystemFn): this {
    if (!this._systems.includes(system)) {
      this._systems.unshift(system)
    }
    return this
  }

  /** Unregister a system. */
  remove(system: SystemFn): this {
    const idx = this._systems.indexOf(system)
    if (idx !== -1) this._systems.splice(idx, 1)
    return this
  }

  /** Execute all registered systems. Idempotent within a frame. */
  run(world: World): void {
    if (this._lastRunFrame === this._frameId) return
    this._lastRunFrame = this._frameId

    for (const system of this._systems) {
      system(world)
    }
  }

  /** Advance the frame counter, allowing the next `run()` to execute. */
  nextFrame(): void {
    this._frameId++
  }
}
