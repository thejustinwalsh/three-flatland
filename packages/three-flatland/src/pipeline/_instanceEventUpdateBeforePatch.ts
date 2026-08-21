import { NodeUpdateType } from 'three/tsl'
import EventNode from 'three/src/nodes/utils/EventNode.js'

/**
 * Restore the pre-upload timing of r185's instanced-buffer synchronization.
 *
 * Three.js r185 migrated `InstanceNode` to a TSL function and accidentally
 * registered its update-range synchronization with `OnFrameUpdate`. The
 * renderer runs frame updates after geometry upload, so a newly dirty range
 * arrives one frame late. Upstream corrected this by using
 * `OnBeforeFrameUpdate` in mrdoob/three.js#34162.
 *
 * r185 creates only one frame `EventNode`, for this synchronization. Move that
 * event to the matching before-frame phase until the package can target a
 * Three.js release containing the upstream fix.
 *
 * @internal
 */

interface EventNodePrototype {
  updateType: string
  updateBeforeType: string
  getUpdateType(): string
  getUpdateBeforeType(): string
}

type RuntimeEventNode = EventNodePrototype & { eventType: string }

const PATCH_FLAG = '__instanceEventPhaseSplitPatched__'
const proto = EventNode.prototype as unknown as EventNodePrototype & Record<string, unknown>

if (!proto[PATCH_FLAG]) {
  proto[PATCH_FLAG] = true

  proto.getUpdateType = function (this: RuntimeEventNode) {
    return this.eventType === EventNode.FRAME ? NodeUpdateType.NONE : this.updateType
  }

  proto.getUpdateBeforeType = function (this: RuntimeEventNode) {
    return this.eventType === EventNode.FRAME ? NodeUpdateType.FRAME : this.updateBeforeType
  }
}
