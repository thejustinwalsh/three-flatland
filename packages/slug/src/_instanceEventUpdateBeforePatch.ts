// Three r185 schedules its internal InstancedMesh buffer synchronization after
// geometry upload. Slug can be consumed without three-flatland core, so keep
// this idempotent compatibility patch local until the upstream fix is released.
import { NodeUpdateType } from 'three/tsl'
import { EventNode } from 'three/webgpu'

interface RuntimeEventNode {
  eventType: string
  callback: (frame: RuntimeNodeFrame) => void
  updateBeforeType: string
  getUpdateBeforeType: (this: RuntimeEventNode) => string
  update: (this: RuntimeEventNode, frame: RuntimeNodeFrame) => void
  updateBefore: (this: RuntimeEventNode, frame: RuntimeNodeFrame) => void
}

interface RuntimeNodeFrame {
  frameId?: number
}

type EventNodePrototype = RuntimeEventNode & Record<string, unknown>

const PATCH_FLAG = '__instanceEventPhaseSplitPatched__'
const classifications = new WeakMap<object, boolean>()
const beforeFrameIds = new WeakMap<object, number>()

function hasAtLeastOccurrences(source: string, token: string, minimum: number): boolean {
  let count = 0
  let offset = 0
  while (offset < source.length) {
    const next = source.indexOf(token, offset)
    if (next === -1) return false
    count++
    if (count >= minimum) return true
    offset = next + token.length
  }
  return false
}

/** @internal Exported so the installed Three runtime artifact can guard this fingerprint in CI. */
export function matchesInstanceBufferSyncCallbackSource(callbackSource: string): boolean {
  return (
    hasAtLeastOccurrences(callbackSource, 'clearUpdateRanges', 2) &&
    hasAtLeastOccurrences(callbackSource, 'updateRanges.push', 2) &&
    hasAtLeastOccurrences(callbackSource, '.version', 6)
  )
}

function isInstanceBufferSyncEvent(event: RuntimeEventNode): boolean {
  if (event.eventType !== EventNode.FRAME) return false

  const cached = classifications.get(event)
  if (cached !== undefined) return cached

  const callbackSource = Function.prototype.toString.call(event.callback)
  const isSyncEvent = matchesInstanceBufferSyncCallbackSource(callbackSource)
  classifications.set(event, isSyncEvent)
  return isSyncEvent
}

export function installInstanceEventUpdateBeforePatch(): void {
  const proto = EventNode.prototype as unknown as EventNodePrototype
  if (proto[PATCH_FLAG]) return

  proto[PATCH_FLAG] = true
  const originalGetUpdateBeforeType = proto.getUpdateBeforeType
  const originalUpdate = proto.update
  const originalUpdateBefore = proto.updateBefore

  proto.getUpdateBeforeType = function (this: RuntimeEventNode) {
    return isInstanceBufferSyncEvent(this) ? NodeUpdateType.FRAME : originalGetUpdateBeforeType.call(this)
  }

  proto.updateBefore = function (this: RuntimeEventNode, frame: RuntimeNodeFrame) {
    if (isInstanceBufferSyncEvent(this) && frame.frameId !== undefined) {
      beforeFrameIds.set(this, frame.frameId)
    }
    originalUpdateBefore.call(this, frame)
  }

  proto.update = function (this: RuntimeEventNode, frame: RuntimeNodeFrame) {
    if (isInstanceBufferSyncEvent(this) && frame.frameId !== undefined && beforeFrameIds.get(this) === frame.frameId) {
      return
    }
    originalUpdate.call(this, frame)
  }
}
