import { describe, expect, it } from 'vitest'
import { NodeUpdateType } from 'three/tsl'
import EventNode from 'three/src/nodes/utils/EventNode.js'
import './_instanceEventUpdateBeforePatch'

describe('r185 instance event timing patch', () => {
  it('moves the r185 instance-buffer synchronization event before geometry upload', () => {
    const interleaved = {
      updateRanges: [] as unknown[],
      version: 0,
      clearUpdateRanges() {
        this.updateRanges.length = 0
      },
    }
    const matrices = { updateRanges: [{}], version: 1 }
    const event = new EventNode(EventNode.FRAME as typeof EventNode.OBJECT, () => {
      interleaved.clearUpdateRanges()
      interleaved.updateRanges.push(...matrices.updateRanges)
      interleaved.version = matrices.version
    })

    expect(event.getUpdateType()).toBe(NodeUpdateType.NONE)
    expect(event.getUpdateBeforeType()).toBe(NodeUpdateType.FRAME)
  })

  it('leaves user-authored frame events in the normal Three.js phase', () => {
    const event = new EventNode(EventNode.FRAME as typeof EventNode.OBJECT, () => {})

    expect(event.getUpdateType()).toBe(NodeUpdateType.FRAME)
    expect(event.getUpdateBeforeType()).toBe(NodeUpdateType.NONE)
  })
})
