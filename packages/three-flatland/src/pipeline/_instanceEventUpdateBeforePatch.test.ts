import { describe, expect, it } from 'vitest'
import { NodeUpdateType } from 'three/tsl'
import EventNode from 'three/src/nodes/utils/EventNode.js'
import './_instanceEventUpdateBeforePatch'

describe('r185 instance event timing patch', () => {
  it('moves frame events before geometry upload', () => {
    const event = new EventNode(EventNode.FRAME as typeof EventNode.OBJECT, () => {})

    expect(event.getUpdateType()).toBe(NodeUpdateType.NONE)
    expect(event.getUpdateBeforeType()).toBe(NodeUpdateType.FRAME)
  })

  it('leaves non-frame events unchanged', () => {
    const event = new EventNode(EventNode.OBJECT, () => {})

    expect(event.getUpdateType()).toBe(NodeUpdateType.OBJECT)
    expect(event.getUpdateBeforeType()).toBe(NodeUpdateType.NONE)
  })
})
