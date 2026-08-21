import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { NodeUpdateType } from 'three/tsl'
import { EventNode } from 'three/webgpu'
import {
  installInstanceEventUpdateBeforePatch,
  matchesInstanceBufferSyncCallbackSource,
} from './_instanceEventUpdateBeforePatch'

const require = createRequire(import.meta.url)

describe('standalone Slug r185 instance event timing patch', () => {
  it('matches the callback shipped in the installed Three WebGPU runtime', () => {
    const runtimeSource = readFileSync(require.resolve('three/webgpu'), 'utf8')
    const marker = 'OnFrameUpdate( () => {'
    const markerStart = runtimeSource.indexOf(marker)
    expect(markerStart).toBeGreaterThanOrEqual(0)

    const callbackStart = markerStart + 'OnFrameUpdate( '.length
    const bodyStart = runtimeSource.indexOf('{', callbackStart)
    let depth = 0
    let callbackEnd = -1
    for (let index = bodyStart; index < runtimeSource.length; index++) {
      if (runtimeSource[index] === '{') depth++
      if (runtimeSource[index] === '}') depth--
      if (depth === 0) {
        callbackEnd = index + 1
        break
      }
    }

    expect(callbackEnd).toBeGreaterThan(bodyStart)
    expect(matchesInstanceBufferSyncCallbackSource(runtimeSource.slice(callbackStart, callbackEnd))).toBe(true)
  })

  it('installs the shared prototype guard for standalone Slug consumers', () => {
    installInstanceEventUpdateBeforePatch()

    expect((EventNode.prototype as unknown as Record<string, unknown>).__instanceEventPhaseSplitPatched__).toBe(true)
  })

  it('does not remap a user callback that synchronizes one buffer', () => {
    installInstanceEventUpdateBeforePatch()

    const interleaved = {
      updateRanges: [] as unknown[],
      version: 0,
      clearUpdateRanges() {
        this.updateRanges.length = 0
      },
    }
    const source = { updateRanges: [{}], version: 1 }
    const event = new EventNode(EventNode.FRAME as typeof EventNode.OBJECT, () => {
      interleaved.clearUpdateRanges()
      interleaved.updateRanges.push(...source.updateRanges)
      if (source.version !== interleaved.version) {
        interleaved.version = source.version
      }
    })

    expect(event.getUpdateType()).toBe(NodeUpdateType.FRAME)
    expect(event.getUpdateBeforeType()).toBe(NodeUpdateType.NONE)
  })
})
