import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it } from 'vitest'
import type { DebugMessage } from 'three-flatland/debug-protocol'
import { ProtocolStore } from './protocol-store'
import { wireProtocolIngest, type IngestClient } from './log-ingest'
import type { RawMessageListener } from '../devtools-client'

/**
 * Ingest-persistence contract (#29 Phase C review fix). `wireProtocolIngest`
 * must have no pause concept, no panel dependency — it just records
 * everything the client sees. This is what makes the flight recorder's
 * history independent of which dashboard panels happen to be mounted.
 */

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
})

function fakeClient(providerId: string | null): IngestClient & { emit: (msg: DebugMessage, direction: 'in' | 'out') => void } {
  const listeners = new Set<RawMessageListener>()
  return {
    state: { selectedProviderId: providerId },
    addRawMessageListener: (cb) => {
      listeners.add(cb)
      return () => { listeners.delete(cb) }
    },
    emit: (msg, direction) => {
      for (const cb of listeners) cb(msg, direction)
    },
  }
}

function dataMsg(frame: number): DebugMessage {
  return { v: 1, ts: Date.now(), type: 'data', payload: { frame, features: {} } } as DebugMessage
}

function makeStore(): ProtocolStore {
  return new ProtocolStore({ writeFlushMs: 1 })
}

describe('wireProtocolIngest', () => {
  it('persists every message unconditionally — there is no pause parameter to gate it', () => {
    const store = makeStore()
    const client = fakeClient('p1')
    wireProtocolIngest(client, store)

    for (let frame = 1; frame <= 5; frame++) client.emit(dataMsg(frame), 'in')

    expect(store.statsFor('p1').total).toBe(5)
  })

  it('keeps persisting across many messages regardless of message content or direction', () => {
    const store = makeStore()
    const client = fakeClient('p1')
    wireProtocolIngest(client, store)

    client.emit(dataMsg(1), 'in')
    client.emit({ v: 1, ts: Date.now(), type: 'ack', payload: { id: 'c1' } } as DebugMessage, 'out')
    client.emit(dataMsg(2), 'in')

    expect(store.statsFor('p1').total).toBe(3)
  })

  it('skips messages while no provider is selected, and resumes once one is', () => {
    const store = makeStore()
    const client = fakeClient(null)
    wireProtocolIngest(client, store)

    client.emit(dataMsg(1), 'in')
    expect(store.statsFor('p1').total).toBe(0)
    expect(store.providers()).toEqual([])

    client.state.selectedProviderId = 'p1'
    client.emit(dataMsg(2), 'in')
    expect(store.statsFor('p1').total).toBe(1)
  })

  it('stops persisting once the returned unsubscribe is called', () => {
    const store = makeStore()
    const client = fakeClient('p1')
    const unsubscribe = wireProtocolIngest(client, store)

    client.emit(dataMsg(1), 'in')
    unsubscribe()
    client.emit(dataMsg(2), 'in')

    expect(store.statsFor('p1').total).toBe(1)
  })
})
