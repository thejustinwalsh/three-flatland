import { describe, expect, it } from 'vitest'
import { NodeUpdateType } from 'three/tsl'
import { EventNode } from 'three/webgpu'
import { installInstanceEventUpdateBeforePatch } from './_instanceEventUpdateBeforePatch'

installInstanceEventUpdateBeforePatch()

describe('r185 instance event timing patch', () => {
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
    const event = new EventNode(EventNode.FRAME as typeof EventNode.OBJECT, () => {
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

    expect(event.getUpdateType()).toBe(NodeUpdateType.NONE)
    expect(event.getUpdateBeforeType()).toBe(NodeUpdateType.FRAME)

    event.updateBefore({} as never)
    expect(interleavedMatrix.updateRanges).toEqual(matrices.updateRanges)
    expect(interleavedMatrix.version).toBe(matrices.version)
    expect(interleavedColor.updateRanges).toEqual(colors.updateRanges)
    expect(interleavedColor.version).toBe(colors.version)
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
})
