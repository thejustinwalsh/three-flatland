import { Vector3 } from 'three'
import type { Camera, Object3D } from 'three'
import type { Component } from '../components/component.js'
import { parseNumberValue } from '../properties/values.js'
import { computeA11yScreenRect } from './projection.js'

/**
 * Spatial navigation ordering for world-space roots (spec §4.2) — pure functions, no per-frame
 * signal wiring. Construction order is only a sane focus order for flat screen-space layouts; for
 * diegetic 3D the order must follow the scene as the camera moves.
 */

export interface SpatialNavContext {
  camera: Camera
  viewport: { x: number; y: number; width: number; height: number }
}

export type SpatialNavDirection = 'left' | 'right' | 'up' | 'down'

interface ProjectedCenter {
  x: number
  y: number
}

interface OrderEntry {
  component: Component
  inputIndex: number
  center: ProjectedCenter | null
  /** projected rect height — the "line height" used for reading-order row clustering */
  height: number
  world: Vector3
  group: string
  order: number | undefined
  row: number
}

/**
 * Projected-center baseline recorded whenever a fresh order is accepted (never while a previous
 * order is being kept), so sub-threshold camera jitter accumulates against the last accepted pose
 * instead of resetting every call. `null` = the component was unprojectable at the baseline.
 */
const orderBaseline = new WeakMap<Component, ProjectedCenter | null>()

const worldHelper = new Vector3()

function isComponent(object: Object3D): object is Component {
  return (object as Partial<Component>).properties != null
}

/**
 * Group key (spec §4.2, best-effort): explicit `a11yGroup` wins; otherwise walk up from the
 * component (inclusive, so a landmark names its own group) to the nearest `role: 'landmark'`
 * ancestor and use its `a11yGroup ?? ariaLabel ?? ''`; components with no landmark ancestor share
 * the anonymous '' group.
 */
function groupKeyOf(component: Component): string {
  const explicit = component.properties.value.a11yGroup
  if (explicit != null) {
    return explicit
  }
  let node: Object3D | null = component
  while (node != null) {
    if (isComponent(node)) {
      const properties = node.properties.value
      if (properties.role === 'landmark') {
        return properties.a11yGroup ?? properties.ariaLabel ?? ''
      }
    }
    node = node.parent
  }
  return ''
}

function projectEntry(
  component: Component,
  inputIndex: number,
  { camera, viewport }: SpatialNavContext
): OrderEntry {
  const world = new Vector3()
  // Component.getWorldPosition refreshes the world chain and yields the panel center (the unit
  // quad is centered on the matrixWorld translation).
  component.getWorldPosition(world)
  const rect = computeA11yScreenRect(component.matrixWorld, camera, viewport)
  const rawOrder = component.properties.value.a11yOrder
  return {
    component,
    inputIndex,
    center: rect == null ? null : { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 },
    height: rect?.h ?? 0,
    world,
    group: groupKeyOf(component),
    order: rawOrder == null ? undefined : parseNumberValue(rawOrder),
    row: 0,
  }
}

/**
 * Reading-order row clustering: sorted by projected center y, an entry joins the current row when
 * its center sits within half the smaller projected height ("~one line-height") of the row anchor;
 * otherwise it anchors a new row. Rows then read left-to-right.
 */
function assignRows(entries: Array<OrderEntry>): void {
  const byY = [...entries].sort((a, b) => a.center!.y - b.center!.y)
  let row = -1
  let anchor: OrderEntry | undefined
  for (const entry of byY) {
    if (
      anchor == null ||
      entry.center!.y - anchor.center!.y > Math.min(entry.height, anchor.height) / 2
    ) {
      row++
      anchor = entry
    }
    entry.row = row
  }
}

function compareReading(a: OrderEntry, b: OrderEntry): number {
  return a.row - b.row || a.center!.x - b.center!.x || a.inputIndex - b.inputIndex
}

/**
 * Computes the spatial focus order (spec §4.2):
 *
 * 1. Unprojectable components (behind the camera / degenerate projection) are peeled off and
 *    appended last, in input order.
 * 2. The rest are grouped by {@link groupKeyOf} and groups sort nearest-first by the camera
 *    distance of their bounding center (average of member world centers).
 * 3. Within a group, members with a numeric `a11yOrder` come first (ascending), then the rest in
 *    projected reading order — row-major top-to-bottom (see {@link assignRows}), left-to-right.
 *
 * Hysteresis rule: when `previousOrder` holds exactly the same component set, the previous order is
 * returned verbatim unless at least one component's projected center moved more than `hysteresisPx`
 * (default 24) since the baseline recorded with the last accepted order — becoming (un)projectable
 * counts as moving. Whenever a fresh order is returned the baseline is re-recorded.
 */
export function computeSpatialOrder(
  components: ReadonlyArray<Component>,
  ctx: SpatialNavContext,
  options?: { hysteresisPx?: number; previousOrder?: ReadonlyArray<Component> }
): Array<Component> {
  ctx.camera.updateWorldMatrix(true, false)
  const entries = components.map((component, index) => projectEntry(component, index, ctx))

  const { previousOrder } = options ?? {}
  if (previousOrder != null && isSameComponentSet(previousOrder, components)) {
    const hysteresisPx = options?.hysteresisPx ?? 24
    if (!entries.some((entry) => movedPastThreshold(entry, hysteresisPx))) {
      return [...previousOrder]
    }
  }
  for (const entry of entries) {
    orderBaseline.set(entry.component, entry.center)
  }

  const projectable = entries.filter((entry) => entry.center != null)
  const unprojectable = entries.filter((entry) => entry.center == null)

  const groups = new Map<string, Array<OrderEntry>>()
  for (const entry of projectable) {
    const members = groups.get(entry.group)
    if (members == null) {
      groups.set(entry.group, [entry])
    } else {
      members.push(entry)
    }
  }

  const cameraPosition = ctx.camera.getWorldPosition(worldHelper)
  const sortedGroups = [...groups.values()].sort((a, b) => {
    return groupDistance(a, cameraPosition) - groupDistance(b, cameraPosition)
  })

  const result: Array<Component> = []
  for (const members of sortedGroups) {
    assignRows(members)
    members.sort((a, b) => {
      if (a.order != null && b.order != null) {
        return a.order - b.order || compareReading(a, b)
      }
      if (a.order != null || b.order != null) {
        return a.order != null ? -1 : 1
      }
      return compareReading(a, b)
    })
    for (const { component } of members) {
      result.push(component)
    }
  }
  for (const { component } of unprojectable) {
    result.push(component)
  }
  return result
}

function groupDistance(members: Array<OrderEntry>, cameraPosition: Vector3): number {
  let x = 0
  let y = 0
  let z = 0
  for (const { world } of members) {
    x += world.x
    y += world.y
    z += world.z
  }
  const count = members.length
  return cameraPosition.distanceTo(worldCenterHelper.set(x / count, y / count, z / count))
}

const worldCenterHelper = new Vector3()

function isSameComponentSet(
  previous: ReadonlyArray<Component>,
  current: ReadonlyArray<Component>
): boolean {
  if (previous.length !== current.length) {
    return false
  }
  const set = new Set(current)
  return previous.every((component) => set.has(component))
}

function movedPastThreshold(entry: OrderEntry, hysteresisPx: number): boolean {
  const baseline = orderBaseline.get(entry.component)
  if (baseline === undefined) {
    // never baselined → cannot prove it stayed put
    return true
  }
  if (baseline === null || entry.center == null) {
    return baseline !== entry.center
  }
  const dx = entry.center.x - baseline.x
  const dy = entry.center.y - baseline.y
  return Math.hypot(dx, dy) > hysteresisPx
}

/**
 * Directional focus move (spec §4.2): projects every component's center to screen px and, from the
 * current component's projected center (or the viewport center when there is no current component
 * or it is unprojectable), returns the nearest component — projected euclidean distance — whose
 * center lies strictly in the requested half-plane (`left`: x < origin.x, `right`: x > origin.x,
 * `up`: y < origin.y, `down`: y > origin.y). Returns undefined when none qualifies.
 */
export function focusDirectional(
  components: ReadonlyArray<Component>,
  current: Component | undefined,
  dir: SpatialNavDirection,
  ctx: SpatialNavContext
): Component | undefined {
  ctx.camera.updateWorldMatrix(true, false)
  const origin = {
    x: ctx.viewport.x + ctx.viewport.width / 2,
    y: ctx.viewport.y + ctx.viewport.height / 2,
  }
  if (current != null) {
    const center = projectCenter(current, ctx)
    if (center != null) {
      origin.x = center.x
      origin.y = center.y
    }
  }

  let best: Component | undefined
  let bestDistance = Infinity
  for (const component of components) {
    if (component === current) {
      continue
    }
    const center = projectCenter(component, ctx)
    if (center == null || !inHalfPlane(center, origin, dir)) {
      continue
    }
    const distance = Math.hypot(center.x - origin.x, center.y - origin.y)
    if (distance < bestDistance) {
      bestDistance = distance
      best = component
    }
  }
  return best
}

function projectCenter(component: Component, ctx: SpatialNavContext): ProjectedCenter | null {
  component.updateWorldMatrix(true, false)
  const rect = computeA11yScreenRect(component.matrixWorld, ctx.camera, ctx.viewport)
  return rect == null ? null : { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 }
}

function inHalfPlane(
  center: ProjectedCenter,
  origin: ProjectedCenter,
  dir: SpatialNavDirection
): boolean {
  switch (dir) {
    case 'left':
      return center.x < origin.x
    case 'right':
      return center.x > origin.x
    case 'up':
      return center.y < origin.y
    case 'down':
      return center.y > origin.y
  }
}
