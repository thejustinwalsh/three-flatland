import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { getCurrentStack, NodeUpdateType, setCurrentStack, stack } from 'three/tsl'
import { EventNode } from 'three/webgpu'
import { BufferGeometry, InstancedMesh } from 'three'
import { Sprite2DMaterial } from '../materials/Sprite2DMaterial'
import {
  installInstanceEventUpdateBeforePatch,
  matchesInstanceBufferSyncCallbackSource,
} from './_instanceEventUpdateBeforePatch'

installInstanceEventUpdateBeforePatch()
const require = createRequire(import.meta.url)

describe('r185 instance event timing patch', () => {
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

  it('moves the r185 instance-buffer synchronization event before geometry upload', () => {
    const interleavedMatrix = {
      updateRanges: [] as unknown[],
      version: 0,
      clearUpdateRanges() {
        this.updateRanges.length = 0
      },
    }
    const interleavedColor = {
      updateRanges: [] as unknown[],
      version: 0,
      clearUpdateRanges() {
        this.updateRanges.length = 0
      },
    }
    const matrices = { updateRanges: [{}], version: 1 }
    const colors = { updateRanges: [{ start: 1 }], version: 2 }
    let callbackRuns = 0
    const event = new EventNode(EventNode.FRAME as typeof EventNode.OBJECT, () => {
      callbackRuns++
      interleavedMatrix.clearUpdateRanges()
      interleavedMatrix.updateRanges.push(...matrices.updateRanges)
      if (matrices.version !== interleavedMatrix.version) {
        interleavedMatrix.version = matrices.version
      }

      interleavedColor.clearUpdateRanges()
      interleavedColor.updateRanges.push(...colors.updateRanges)
      if (colors.version !== interleavedColor.version) {
        interleavedColor.version = colors.version
      }
    })

    expect(event.getUpdateType()).toBe(NodeUpdateType.FRAME)
    expect(event.getUpdateBeforeType()).toBe(NodeUpdateType.FRAME)

    const firstFrame = { frameId: 1 }
    event.updateBefore(firstFrame as never)
    event.update(firstFrame as never)
    expect(callbackRuns).toBe(1)
    expect(interleavedMatrix.updateRanges).toEqual(matrices.updateRanges)
    expect(interleavedMatrix.version).toBe(matrices.version)
    expect(interleavedColor.updateRanges).toEqual(colors.updateRanges)
    expect(interleavedColor.version).toBe(colors.version)

    // A pipeline built before the patch is registered only in Three's normal
    // update list. It must keep syncing rather than being disabled by a late install.
    event.update({ frameId: 2 } as never)
    expect(callbackRuns).toBe(2)
  })

  it('leaves user-authored frame events in the normal Three.js phase', () => {
    const event = new EventNode(EventNode.FRAME as typeof EventNode.OBJECT, () => {})

    expect(event.getUpdateType()).toBe(NodeUpdateType.FRAME)
    expect(event.getUpdateBeforeType()).toBe(NodeUpdateType.NONE)
  })

  it('does not remap a user callback that synchronizes one buffer', () => {
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

  it('classifies the live large-batch event created by Sprite2DMaterial', () => {
    const material = new Sprite2DMaterial()
    const mesh = new InstancedMesh(new BufferGeometry(), material, 2048)
    const nodeStack = stack()
    const previousStack = getCurrentStack()

    setCurrentStack(nodeStack)
    try {
      material.setupPosition({
        object: mesh,
        getUniformBufferLimit: () => 65_536,
        hasGeometryAttribute: () => false,
        needsPreviousData: () => false,
      } as never)
    } finally {
      setCurrentStack(previousStack)
    }

    const event = nodeStack.nodes.find(
      (node): node is EventNode => node instanceof EventNode && node.eventType === EventNode.FRAME
    )
    expect(event, 'large Sprite2DMaterial batches must register a frame sync event').toBeDefined()
    expect(event!.getUpdateBeforeType()).toBe(NodeUpdateType.FRAME)

    material.dispose()
    mesh.geometry.dispose()
  })
})
