import { type Signal, computed } from '@preact/signals-core'
import { type Matrix4, Plane, Vector3 } from 'three'
import type { Box3, Line3, Matrix3, Sphere, Vector2Tuple } from 'three'
import { Overflow } from 'yoga-layout/load'
import type { Container } from './components/container.js'
import type { Component } from './components/component.js'
import type { Fix_TS_56_Float32Array } from './utils.js'

const dotLt45deg = Math.cos((45 / 180) * Math.PI)

const helperPlanes = [new Plane(), new Plane(), new Plane(), new Plane()]
const positionHelper = new Vector3()

export class ClippingRect {
  public readonly planes: Array<Plane>

  private readonly facePlane: Plane
  private readonly originalCenter: Vector3

  constructor(
    globalMatrix: Matrix4,
    centerX: number,
    centerY: number,
    width: number,
    height: number
  ) {
    this.originalCenter = new Vector3(centerX, centerY, 0).applyMatrix4(globalMatrix)
    this.facePlane = new Plane(new Vector3(0, 0, 1), 0).applyMatrix4(globalMatrix)
    const halfWidth = width / 2
    const halfHeight = height / 2
    const top = centerY + halfHeight
    const right = centerX + halfWidth
    const bottom = -centerY + halfHeight
    const left = -centerX + halfWidth

    this.planes = [
      new Plane(new Vector3(0, -1, 0), bottom).applyMatrix4(globalMatrix),
      new Plane(new Vector3(-1, 0, 0), left).applyMatrix4(globalMatrix),
      new Plane(new Vector3(0, 1, 0), top).applyMatrix4(globalMatrix),
      new Plane(new Vector3(1, 0, 0), right).applyMatrix4(globalMatrix),
    ]
  }

  min({ planes }: ClippingRect): this {
    for (let i = 0; i < 4; i++) {
      const p1 = this.facePlane
      const p2 = planes[i]!
      const n1n2DotProduct = p1.normal.dot(p2.normal)
      if (Math.abs(n1n2DotProduct) > 0.99) {
        return this //projection unsuccessfull => clipping rect is 90 deg rotated
      }
      const helperPlane = helperPlanes[i]!
      if (Math.abs(n1n2DotProduct) < 0.01) {
        //projection unnecassary => already correctly projected
        helperPlane.copy(p2)
        continue
      }
      helperPlane.normal.crossVectors(p1.normal, p2.normal).normalize().cross(p1.normal).negate()
      //from: https://en.wikipedia.org/wiki/Plane%E2%80%93plane_intersection
      const divisor = 1 - n1n2DotProduct * n1n2DotProduct
      const c1 = (p1.constant - p2.constant * n1n2DotProduct) / divisor
      const c2 = (p2.constant - p1.constant * n1n2DotProduct) / divisor
      positionHelper.copy(p1.normal).multiplyScalar(c1).addScaledVector(p2.normal, c2)
      helperPlane.constant = -positionHelper.dot(helperPlane.normal)
    }

    //2. step: find index offset (e.g. if the child was rotate by 90deg in z-axis)
    const indexOffset = 0
    const firstPlaneNormal = this.planes[0]!.normal
    while (helperPlanes[indexOffset]!.normal.dot(firstPlaneNormal) > dotLt45deg) {
      break
    }
    //3. step: minimize (if the helper plane is smaller => copy from the planes because they have the original orientation)
    for (let i = 0; i < 4; i++) {
      const plane = this.planes[i]!
      const otherPlaneIndex = (i + indexOffset) % 4
      if (
        helperPlanes[otherPlaneIndex]!.distanceToPoint(this.originalCenter) <
        plane.distanceToPoint(this.originalCenter)
      ) {
        plane.copy(planes[otherPlaneIndex]!)
      }
    }
    return this
  }

  toArray(array: ArrayLike<number>, offset: number) {
    for (let i = 0; i < 4; i++) {
      const { normal, constant } = this.planes[i]!
      normal.toArray(array, offset)
      ;(array as Array<number>)[offset + 3] = constant
      offset += 4
    }
  }
}

const helperPoints = [new Vector3(), new Vector3(), new Vector3(), new Vector3()]
const multiplier = [
  [-0.5, -0.5],
  [0.5, -0.5],
  [0.5, 0.5],
  [-0.5, 0.5],
] as const

export function computedIsClipped(
  parent: Signal<Container | undefined>,
  globalMatrix: Signal<Matrix4 | undefined>,
  size: Signal<Vector2Tuple | undefined>,
  pixelSizeSignal: Signal<number>
): Signal<boolean> {
  return computed(() => {
    const parentValue = parent.value
    if (parentValue == null) {
      return false
    }
    const sizeValue = size.value
    if (sizeValue == null) {
      return true
    }
    const global = globalMatrix.value
    const rect = parentValue.clippingRect.value
    if (rect == null || global == null) {
      return false
    }
    const [width, height] = sizeValue
    const pixelSize = pixelSizeSignal.value
    for (let i = 0; i < 4; i++) {
      const [mx, my] = multiplier[i]!
      helperPoints[i]!.set(mx * pixelSize * width, my * pixelSize * height, 0).applyMatrix4(global)
    }

    const { planes } = rect
    let allOutside: boolean
    for (let planeIndex = 0; planeIndex < 4; planeIndex++) {
      const clippingPlane = planes[planeIndex]!
      allOutside = true
      for (let pointIndex = 0; pointIndex < 4; pointIndex++) {
        const point = helperPoints[pointIndex]!
        if (clippingPlane.distanceToPoint(point) >= 0) {
          //inside
          allOutside = false
        }
      }
      if (allOutside) {
        return true
      }
    }
    return false
  })
}

export function computedClippingRect(
  globalMatrix: Signal<Matrix4 | undefined>,
  { overflow, borderInset, size }: Component,
  pixelSizeSignal: Signal<number>,
  parentClippingRect: Signal<ClippingRect | undefined> | undefined
): Signal<ClippingRect | undefined> {
  return computed(() => {
    const global = globalMatrix.value
    const parentClippingRectValue = parentClippingRect?.value
    if (global == null || overflow.value === Overflow.Visible) {
      return parentClippingRectValue
    }
    const sizeValue = size.value
    const borderInsetValue = borderInset.value
    if (sizeValue == null || borderInsetValue == null) {
      return undefined
    }
    const [width, height] = sizeValue
    const [top, right, bottom, left] = borderInsetValue
    const pixelSize = pixelSizeSignal.value
    const rect = new ClippingRect(
      global,
      ((right - left) * pixelSize) / 2,
      ((top - bottom) * pixelSize) / 2,
      (width - left - right) * pixelSize,
      (height - top - bottom) * pixelSize
    )
    if (parentClippingRectValue != null) {
      rect.min(parentClippingRectValue)
    }
    return rect
  })
}

export const NoClippingPlane = new Plane(new Vector3(-1, 0, 0), Number.MAX_SAFE_INTEGER)
export const defaultClippingData: Fix_TS_56_Float32Array = new Float32Array(16)
for (let i = 0; i < 4; i++) {
  NoClippingPlane.normal.toArray(defaultClippingData, i * 4)
  defaultClippingData[i * 4 + 3] = NoClippingPlane.constant
}

export function createGlobalClippingPlanes(component: Component) {
  const getGlobalMatrix = () => component.root.peek().component.parent?.matrixWorld
  // `matrixWorld` above is mutated in place (an ancestor moving never changes its
  // reference), so it can't be compared directly — `matrixVersion` is the cheap
  // per-root stand-in, bumped whenever that combined world transform actually
  // changes (see `Component.updateWorldMatrix`).
  const getMatrixVersion = () => component.root.peek().matrixVersion
  const planes = new Array(4)
    .fill(undefined)
    .map<Plane>(
      (_, i) =>
        new RelativePlane(
          () => component.parentContainer.peek()?.clippingRect.value?.planes[i],
          getGlobalMatrix,
          getMatrixVersion
        )
    )
  return planes
}

const helperPlane = new Plane()

class RelativePlane implements Plane {
  get normal(): Vector3 {
    this.refresh()
    return this.resolved.normal
  }
  get constant(): number {
    this.refresh()
    return this.resolved.constant
  }
  isPlane = true as const

  /** last resolved (local plane × global matrix) result — see `refresh` */
  private readonly resolved = new Plane()
  private cachedLocalPlane: Plane | undefined
  private cachedGlobalMatrix: Matrix4 | undefined
  private cachedMatrixVersion = -1
  private initialized = false

  constructor(
    private getLocalPlane: () => Plane | undefined,
    private getGlobalMatrix: () => Matrix4 | undefined,
    private getMatrixVersion: () => number
  ) {}

  /**
   * Recomputes `resolved` only when the local plane reference or the root's
   * world transform actually changed since the last call — a clipping plane
   * is read (normal + constant, often both) once per rendered descendant
   * every frame, so an unmemoized `applyMatrix4` here is O(descendants) work
   * repeated for content that never moved.
   */
  private refresh(): void {
    const localPlane = this.getLocalPlane()
    const globalMatrix = this.getGlobalMatrix()
    const matrixVersion = this.getMatrixVersion()
    if (
      this.initialized &&
      localPlane === this.cachedLocalPlane &&
      globalMatrix === this.cachedGlobalMatrix &&
      matrixVersion === this.cachedMatrixVersion
    ) {
      return
    }
    this.initialized = true
    this.cachedLocalPlane = localPlane
    this.cachedGlobalMatrix = globalMatrix
    this.cachedMatrixVersion = matrixVersion
    if (localPlane == null || globalMatrix == null) {
      this.resolved.copy(NoClippingPlane)
      return
    }
    this.resolved.copy(localPlane).applyMatrix4(globalMatrix)
  }

  private computeInto(target: Plane): Plane {
    this.refresh()
    return target.copy(this.resolved)
  }

  set(_normal: Vector3, _constant: number): Plane {
    return this
  }
  setComponents(_x: number, _y: number, _z: number, _w: number): Plane {
    return this
  }
  setFromNormalAndCoplanarPoint(_normal: Vector3, _point: Vector3): Plane {
    return this
  }
  setFromCoplanarPoints(_a: Vector3, _b: Vector3, _c: Vector3): Plane {
    return this
  }
  clone(): this {
    return this.computeInto(new Plane()) as this
  }
  copy(plane: Plane): this {
    this.computeInto(plane)
    return this
  }
  normalize(): Plane {
    return this
  }
  negate(): Plane {
    return this
  }
  distanceToPoint(point: Vector3): number {
    return this.computeInto(helperPlane).distanceToPoint(point)
  }
  distanceToSphere(sphere: Sphere): number {
    return this.computeInto(helperPlane).distanceToSphere(sphere)
  }
  projectPoint(point: Vector3, target: Vector3): Vector3 {
    return this.computeInto(helperPlane).projectPoint(point, target)
  }
  intersectLine(line: Line3, target: Vector3): Vector3 | null {
    return this.computeInto(helperPlane).intersectLine(line, target)
  }
  intersectsLine(line: Line3): boolean {
    return this.computeInto(helperPlane).intersectsLine(line)
  }
  intersectsBox(box: Box3): boolean {
    return this.computeInto(helperPlane).intersectsBox(box)
  }
  intersectsSphere(sphere: Sphere): boolean {
    return this.computeInto(helperPlane).intersectsSphere(sphere)
  }
  coplanarPoint(target: Vector3): Vector3 {
    return this.computeInto(helperPlane).coplanarPoint(target)
  }
  applyMatrix4(_matrix: Matrix4, _optionalNormalMatrix?: Matrix3): Plane {
    return this
  }
  translate(_offset: Vector3): Plane {
    return this
  }
  equals(plane: Plane): boolean {
    return this.computeInto(helperPlane).equals(plane)
  }
  isIntersectionLine(l: any) {
    return this.computeInto(helperPlane).isIntersectionLine(l)
  }
}
