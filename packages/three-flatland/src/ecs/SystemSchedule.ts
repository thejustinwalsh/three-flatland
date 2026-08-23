import type { World } from './runtime'
import { perfMeasure, PERF_TRACK, type PerfTrackName } from '../debug/perf-track'

// Types the build-time `process.env` reads without requiring @types/node (shadows the global where present; erased at compile).
declare const process: { env: { NODE_ENV?: string; FL_PROFILE?: string } }

/**
 * A system function takes only a world — all context comes from world resource traits.
 */
export type SystemFn = (world: World) => void

/**
 * Perf label attached at registration. Mandatory so the whole schedule
 * is tracked — TypeScript guarantees every system carries a track + name.
 */
export interface SystemLabel {
  track: PerfTrackName
  name: string
}

interface SystemEntry {
  system: SystemFn
  track: PerfTrackName
  name: string
}

/**
 * Ordered system runner with frame-level idempotency.
 *
 * Systems are registered via `add()` and executed in registration order
 * by `run()`. Calling `run()` multiple times within the same frame is
 * a no-op after the first — `nextFrame()` advances the frame counter
 * to allow the next execution.
 *
 * Every registration carries a perf label (`{ track, name }`). When
 * profiling is enabled, `run()` emits a `performance.measure` span per
 * system plus an outer `ecs:run` span on the Schedule track. Ordinary
 * production builds use the plain loop; `FL_PROFILE=true` produces a
 * separately identifiable production-profile build for diagnostics.
 *
 * @example
 * ```typescript
 * const schedule = new SystemSchedule()
 * schedule.add(lightSyncSystem, { track: PERF_TRACK.Lighting, name: 'lightSync' })
 * schedule.add(batchAssignSystem, { track: PERF_TRACK.Batch, name: 'batchAssign' })
 *
 * // In render loop:
 * schedule.nextFrame()
 * schedule.run(world)  // executes all systems
 * schedule.run(world)  // no-op (same frame)
 * ```
 */
export class SystemSchedule {
  private _systems: SystemEntry[] = []
  private _finalizers: SystemFn[] = []
  private _frameId = 0
  private _lastRunFrame = -1

  /** Register a system at the end. Execution order matches registration order. */
  add(system: SystemFn, label: SystemLabel): this {
    if (!this._systems.some((entry) => entry.system === system)) {
      this._systems.push({ system, track: label.track, name: label.name })
    }
    return this
  }

  /** Register a system at the beginning. Used to insert phases before existing systems. */
  prepend(system: SystemFn, label: SystemLabel): this {
    if (!this._systems.some((entry) => entry.system === system)) {
      this._systems.unshift({ system, track: label.track, name: label.name })
    }
    return this
  }

  /** Register cleanup that runs once after every schedule attempt, even on throw. */
  addFinalizer(finalizer: SystemFn): this {
    if (!this._finalizers.includes(finalizer)) this._finalizers.push(finalizer)
    return this
  }

  /** Unregister a system. */
  remove(system: SystemFn): this {
    const idx = this._systems.findIndex((entry) => entry.system === system)
    if (idx !== -1) this._systems.splice(idx, 1)
    return this
  }

  /** Execute all registered systems. Idempotent within a frame. */
  run(world: World): void {
    if (this._lastRunFrame === this._frameId) return
    this._lastRunFrame = this._frameId

    // Development and explicit production-profile builds emit Chrome timing
    // spans. FL_PROFILE is deliberately separate from FL_DEVTOOLS: enabling a
    // dashboard must not silently add two clocks + an allocated detail payload
    // per system, per frame, to an otherwise representative production build.
    this._execute(world, process.env.NODE_ENV !== 'production' || process.env.FL_PROFILE === 'true')
  }

  private _execute(world: World, instrumented: boolean): void {
    const scheduleStart = instrumented ? performance.now() : 0
    let failed = false
    let failure: unknown

    try {
      for (const entry of this._systems) {
        if (!instrumented) {
          entry.system(world)
          continue
        }
        const start = performance.now()
        entry.system(world)
        perfMeasure(entry.track, entry.name, start, performance.now(), {
          tooltipText: `${entry.name} (${entry.track})`,
          properties: [
            ['system', entry.name],
            ['track', entry.track],
          ],
        })
      }
    } catch (error) {
      failed = true
      failure = error
    }

    for (const finalizer of this._finalizers) {
      try {
        finalizer(world)
      } catch (error) {
        // Cleanup failures must not prevent later finalizers or obscure the
        // system error that made cleanup necessary.
        if (!failed) {
          failed = true
          failure = error
        }
      }
    }

    if (instrumented) {
      try {
        perfMeasure(PERF_TRACK.Schedule, 'ecs:run', scheduleStart, performance.now(), {
          tooltipText: 'Full ECS schedule run',
          properties: [['systems', String(this._systems.length)]],
        })
      } catch (error) {
        if (!failed) {
          failed = true
          failure = error
        }
      }
    }

    if (failed) throw failure
  }

  /** Advance the frame counter, allowing the next `run()` to execute. */
  nextFrame(): void {
    this._frameId++
  }
}
