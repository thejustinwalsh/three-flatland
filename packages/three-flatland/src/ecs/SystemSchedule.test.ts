import { describe, it, expect } from 'vitest'
import type { World } from './runtime'
import { SystemSchedule } from './SystemSchedule'
import { PERF_TRACK } from '../debug/perf-track'

const fakeWorld = {} as World

describe('SystemSchedule', () => {
  it('executes systems in registration order', () => {
    const order: string[] = []
    const schedule = new SystemSchedule()
    schedule
      .add(() => order.push('a'), { track: PERF_TRACK.Batch, name: 'a' })
      .add(() => order.push('b'), { track: PERF_TRACK.Batch, name: 'b' })
      .add(() => order.push('c'), { track: PERF_TRACK.Batch, name: 'c' })

    schedule.nextFrame()
    schedule.run(fakeWorld)

    expect(order).toEqual(['a', 'b', 'c'])
  })

  it('prepends systems before existing ones', () => {
    const order: string[] = []
    const schedule = new SystemSchedule()
    schedule
      .add(() => order.push('b'), { track: PERF_TRACK.Batch, name: 'b' })
      .prepend(() => order.push('a'), { track: PERF_TRACK.Lighting, name: 'a' })

    schedule.nextFrame()
    schedule.run(fakeWorld)

    expect(order).toEqual(['a', 'b'])
  })

  it('is idempotent within a frame and re-runs after nextFrame', () => {
    let count = 0
    const schedule = new SystemSchedule()
    schedule.add(() => count++, { track: PERF_TRACK.Sprites, name: 'count' })

    schedule.nextFrame()
    schedule.run(fakeWorld)
    schedule.run(fakeWorld) // same frame — no-op
    expect(count).toBe(1)

    schedule.nextFrame()
    schedule.run(fakeWorld)
    expect(count).toBe(2)
  })

  it('dedups by system identity on add', () => {
    let count = 0
    const sys = () => count++
    const schedule = new SystemSchedule()
    schedule.add(sys, { track: PERF_TRACK.Batch, name: 'sys' }).add(sys, { track: PERF_TRACK.Batch, name: 'sys-dup' })

    schedule.nextFrame()
    schedule.run(fakeWorld)
    expect(count).toBe(1)
  })

  it('removes a system by identity', () => {
    const order: string[] = []
    const a = () => order.push('a')
    const b = () => order.push('b')
    const schedule = new SystemSchedule()
    schedule.add(a, { track: PERF_TRACK.Batch, name: 'a' }).add(b, { track: PERF_TRACK.Batch, name: 'b' }).remove(a)

    schedule.nextFrame()
    schedule.run(fakeWorld)
    expect(order).toEqual(['b'])
  })

  it('runs deduplicated finalizers after normal and throwing schedule attempts', () => {
    const order: string[] = []
    const finalizer = () => order.push('finalize')
    const schedule = new SystemSchedule()
    schedule
      .add(() => order.push('run'), { track: PERF_TRACK.Batch, name: 'run' })
      .add(
        () => {
          throw new Error('stop')
        },
        { track: PERF_TRACK.Batch, name: 'throw' }
      )
      .addFinalizer(finalizer)
      .addFinalizer(finalizer)

    schedule.nextFrame()
    expect(() => schedule.run(fakeWorld)).toThrow('stop')
    expect(order).toEqual(['run', 'finalize'])
  })

  it('runs every finalizer and preserves the original system failure', () => {
    const order: string[] = []
    const schedule = new SystemSchedule()
    schedule
      .add(
        () => {
          throw new Error('system failed')
        },
        { track: PERF_TRACK.Batch, name: 'throw' }
      )
      .addFinalizer(() => {
        order.push('first')
        throw new Error('cleanup failed')
      })
      .addFinalizer(() => {
        order.push('second')
      })

    schedule.nextFrame()
    expect(() => schedule.run(fakeWorld)).toThrow('system failed')
    expect(order).toEqual(['first', 'second'])
  })
})
