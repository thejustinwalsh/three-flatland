import { describe, it, expect } from 'vitest'
import type { World } from 'koota'
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
    schedule
      .add(sys, { track: PERF_TRACK.Batch, name: 'sys' })
      .add(sys, { track: PERF_TRACK.Batch, name: 'sys-dup' })

    schedule.nextFrame()
    schedule.run(fakeWorld)
    expect(count).toBe(1)
  })

  it('removes a system by identity', () => {
    const order: string[] = []
    const a = () => order.push('a')
    const b = () => order.push('b')
    const schedule = new SystemSchedule()
    schedule
      .add(a, { track: PERF_TRACK.Batch, name: 'a' })
      .add(b, { track: PERF_TRACK.Batch, name: 'b' })
      .remove(a)

    schedule.nextFrame()
    schedule.run(fakeWorld)
    expect(order).toEqual(['b'])
  })
})
