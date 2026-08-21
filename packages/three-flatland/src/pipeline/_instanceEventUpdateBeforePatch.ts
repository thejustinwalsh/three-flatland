import { NodeUpdateType } from 'three/tsl'
import { EventNode } from 'three/webgpu'

/**
 * Restore the pre-upload timing of r185's instanced-buffer synchronization.
 *
 * Three.js r185 migrated `InstanceNode` to a TSL function and accidentally
 * registered its update-range synchronization with `OnFrameUpdate`. The
 * renderer runs frame updates after geometry upload, so a newly dirty range
 * arrives one frame late. Upstream corrected this by using
 * `OnBeforeFrameUpdate` in mrdoob/three.js#34162.
 *
 * TSL function bodies are built after material setup, so the internal event is
 * not available to capture synchronously. Identify the r185 callback by its
 * duplicated matrix/color buffer signature (`clearUpdateRanges`,
 * `updateRanges.push`, and `version`) and move only that event. Property names
 * survive normal bundler minification; unrelated user-authored
 * `OnFrameUpdate` events retain their normal frame phase.
 *
 * @internal
 */

interface RuntimeEventNode {
  eventType: string
  callback: (...args: unknown[]) => unknown
  updateType: string
  updateBeforeType: string
  getUpdateType: (this: RuntimeEventNode) => string
  getUpdateBeforeType: (this: RuntimeEventNode) => string
}

type EventNodePrototype = RuntimeEventNode & Record<string, unknown>

const PATCH_FLAG = '__instanceEventPhaseSplitPatched__'
const classifications = new WeakMap<object, boolean>()

function hasAtLeastOccurrences(source: string, token: string, minimum: number): boolean {
  let count = 0
  let offset = 0

  while ((offset = source.indexOf(token, offset)) !== -1) {
    count++
    if (count >= minimum) return true
    offset += token.length
  }

  return false
}

function isInstanceBufferSyncEvent(event: RuntimeEventNode): boolean {
  if (event.eventType !== EventNode.FRAME) return false

  const cached = classifications.get(event)
  if (cached !== undefined) return cached

  const callbackSource = Function.prototype.toString.call(event.callback)
  const isSyncEvent =
    hasAtLeastOccurrences(callbackSource, 'clearUpdateRanges', 2) &&
    hasAtLeastOccurrences(callbackSource, 'updateRanges.push', 2) &&
    hasAtLeastOccurrences(callbackSource, '.version', 8)
  classifications.set(event, isSyncEvent)
  return isSyncEvent
}

export function installInstanceEventUpdateBeforePatch(): void {
  const proto = EventNode.prototype as unknown as EventNodePrototype
  if (!proto[PATCH_FLAG]) {
    proto[PATCH_FLAG] = true
    const originalGetUpdateType = proto.getUpdateType
    const originalGetUpdateBeforeType = proto.getUpdateBeforeType

    proto.getUpdateType = function (this: RuntimeEventNode) {
      return isInstanceBufferSyncEvent(this) ? NodeUpdateType.NONE : originalGetUpdateType.call(this)
    }

    proto.getUpdateBeforeType = function (this: RuntimeEventNode) {
      return isInstanceBufferSyncEvent(this) ? NodeUpdateType.FRAME : originalGetUpdateBeforeType.call(this)
    }
  }
}
