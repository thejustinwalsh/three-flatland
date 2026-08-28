import type { Texture } from 'three'
import { Break, If, Loop, float, floor, int, ivec2, textureLoad, vec2, vec3, vec4 } from 'three/tsl'
import type Node from 'three/src/nodes/core/Node.js'
import { worldToUV } from './coordUtils'

/** Ray interval inside an axis-aligned world rectangle. `x > y` means no hit. */
export function rayBoundsInterval(
  origin: Node<'vec2'>,
  direction: Node<'vec2'>,
  boundsSize: Node<'vec2'>,
  boundsOffset: Node<'vec2'>
): Node<'vec2'> {
  const epsilon = float(1e-6)
  const parallelX = direction.x.abs().lessThan(epsilon)
  const parallelY = direction.y.abs().lessThan(epsilon)
  const safeDirection = vec2(parallelX.select(epsilon, direction.x), parallelY.select(epsilon, direction.y))
  const inverseDirection = float(1).div(safeDirection)
  const boundsMax = boundsOffset.add(boundsSize)
  const t0 = boundsOffset.sub(origin).mul(inverseDirection)
  const t1 = boundsMax.sub(origin).mul(inverseDirection)
  const near = t0.x.min(t1.x).max(t0.y.min(t1.y))
  const far = t0.x.max(t1.x).min(t0.y.max(t1.y))
  const parallelOutside = parallelX
    .and(origin.x.lessThan(boundsOffset.x).or(origin.x.greaterThan(boundsMax.x)))
    .or(parallelY.and(origin.y.lessThan(boundsOffset.y).or(origin.y.greaterThan(boundsMax.y))))
  return parallelOutside.select(vec2(1, -1), vec2(near, far))
}

/**
 * Integer supercover traversal between quantized lighting-grid cells.
 *
 * The walk is division-free after quantizing the two endpoints. Corner
 * crossings conservatively test both side-adjacent cells so one-cell walls
 * cannot leak through a shared corner. Returns
 * `<transmittance, reachedTraceLimit>`.
 */
export function traceDdaIntegerOcclusion(
  occlusionTexture: Texture,
  occlusionTextureSize: Node<'vec2'>,
  rayOrigin: Node<'vec2'>,
  rayDirection: Node<'vec2'>,
  traceEntry: Node<'float'>,
  traceExit: Node<'float'>,
  intersectsWorld: Node<'bool'>,
  worldSize: Node<'vec2'>,
  worldOffset: Node<'vec2'>,
  gridWidth: number,
  gridHeight: number,
  maxSteps: number
): Node<'vec2'> {
  const gridSize = vec2(float(gridWidth), float(gridHeight))
  const gridMax = ivec2(int(gridWidth - 1), int(gridHeight - 1))
  const worldToCell = (worldPosition: Node<'vec2'>): Node<'ivec2'> => {
    const worldUV = worldToUV(worldPosition, worldSize, worldOffset).clamp(0, 1)
    const textureUV = vec2(worldUV.x, float(1).sub(worldUV.y))
    const cell = floor(textureUV.mul(gridSize)).clamp(vec2(0), gridSize.sub(float(0.0001)))
    return ivec2(int(cell.x), int(cell.y))
  }
  const occupiedAt = (cell: Node<'ivec2'>): Node<'bool'> => {
    const clampedCell = ivec2(
      cell.x.lessThan(int(0)).select(int(0), cell.x.greaterThan(gridMax.x).select(gridMax.x, cell.x)),
      cell.y.lessThan(int(0)).select(int(0), cell.y.greaterThan(gridMax.y).select(gridMax.y, cell.y))
    )
    const texelFloat = floor(vec2(clampedCell).add(float(0.5)).div(gridSize).mul(occlusionTextureSize)).clamp(
      vec2(0),
      occlusionTextureSize.sub(float(1))
    )
    const inBounds = cell.x
      .greaterThanEqual(int(0))
      .and(cell.x.lessThanEqual(gridMax.x))
      .and(cell.y.greaterThanEqual(int(0)))
      .and(cell.y.lessThanEqual(gridMax.y))
    return inBounds.and(
      textureLoad(occlusionTexture, ivec2(int(texelFloat.x), int(texelFloat.y))).a.greaterThan(float(0.5))
    )
  }

  const startWorld = rayOrigin.add(rayDirection.mul(traceEntry))
  const endWorld = rayOrigin.add(rayDirection.mul(traceExit))
  const cell = worldToCell(startWorld).toVar()
  const endCell = worldToCell(endWorld)
  const delta = ivec2(endCell.x.sub(cell.x).abs(), endCell.y.sub(cell.y).abs())
  const stepDirection = ivec2(
    endCell.x.greaterThan(cell.x).select(int(1), endCell.x.lessThan(cell.x).select(int(-1), int(0))),
    endCell.y.greaterThan(cell.y).select(int(1), endCell.y.lessThan(cell.y).select(int(-1), int(0)))
  )
  const advancedX = int(0).toVar()
  const advancedY = int(0).toVar()
  const transmittance = float(1).toVar()
  const reachedTraceLimit = intersectsWorld.not().select(float(1), float(0)).toVar()

  Loop(maxSteps, () => {
    If(intersectsWorld.not(), () => {
      Break()
    })
    If(occupiedAt(cell), () => {
      transmittance.assign(float(0))
      Break()
    })
    const reachedEnd = cell.x.equal(endCell.x).and(cell.y.equal(endCell.y))
    If(reachedEnd, () => {
      reachedTraceLimit.assign(float(1))
      Break()
    })

    const onlyY = delta.x.equal(int(0))
    const onlyX = delta.y.equal(int(0))
    const crossingX = advancedX.mul(int(2)).add(int(1)).mul(delta.y)
    const crossingY = advancedY.mul(int(2)).add(int(1)).mul(delta.x)
    const stepX = onlyY.not().and(onlyX.or(crossingX.lessThan(crossingY)))
    const stepY = onlyX.not().and(onlyY.or(crossingY.lessThan(crossingX)))
    const stepCorner = onlyX.not().and(onlyY.not()).and(crossingX.equal(crossingY))

    If(stepCorner, () => {
      const neighborX = ivec2(cell.x.add(stepDirection.x), cell.y)
      const neighborY = ivec2(cell.x, cell.y.add(stepDirection.y))
      If(occupiedAt(neighborX).or(occupiedAt(neighborY)), () => {
        transmittance.assign(float(0))
        Break()
      })
      cell.x.addAssign(stepDirection.x)
      cell.y.addAssign(stepDirection.y)
      advancedX.addAssign(int(1))
      advancedY.addAssign(int(1))
    })
    If(stepX, () => {
      cell.x.addAssign(stepDirection.x)
      advancedX.addAssign(int(1))
    })
    If(stepY, () => {
      cell.y.addAssign(stepDirection.y)
      advancedY.addAssign(int(1))
    })
  })

  return vec2(transmittance, reachedTraceLimit)
}

/**
 * Integer supercover traversal that resolves the first emissive texel or wall.
 *
 * RGB contains captured sprite radiance. Alpha is a traversal result:
 * `-1` = blocked by an occluder, `0` = step budget exhausted,
 * `1` = reached the requested trace limit, `2` = hit emissive sprite pixels.
 * Emission is sampled before occupancy so a luminous silhouette never
 * self-shadows merely because it shares a grid cell with its visible sprite.
 */
export function traceDdaIntegerRadiance(
  occlusionTexture: Texture,
  occlusionTextureSize: Node<'vec2'>,
  emissiveTexture: Texture,
  rayOrigin: Node<'vec2'>,
  rayDirection: Node<'vec2'>,
  traceEntry: Node<'float'>,
  traceExit: Node<'float'>,
  intersectsWorld: Node<'bool'>,
  worldSize: Node<'vec2'>,
  worldOffset: Node<'vec2'>,
  gridWidth: number,
  gridHeight: number,
  maxSteps: number
): Node<'vec4'> {
  const gridSize = vec2(float(gridWidth), float(gridHeight))
  const gridMax = ivec2(int(gridWidth - 1), int(gridHeight - 1))
  const inBounds = (cell: Node<'ivec2'>): Node<'bool'> =>
    cell.x
      .greaterThanEqual(int(0))
      .and(cell.x.lessThanEqual(gridMax.x))
      .and(cell.y.greaterThanEqual(int(0)))
      .and(cell.y.lessThanEqual(gridMax.y))
  const clampCell = (cell: Node<'ivec2'>): Node<'ivec2'> =>
    ivec2(
      cell.x.lessThan(int(0)).select(int(0), cell.x.greaterThan(gridMax.x).select(gridMax.x, cell.x)),
      cell.y.lessThan(int(0)).select(int(0), cell.y.greaterThan(gridMax.y).select(gridMax.y, cell.y))
    )
  const worldToCell = (worldPosition: Node<'vec2'>): Node<'ivec2'> => {
    const worldUV = worldToUV(worldPosition, worldSize, worldOffset).clamp(0, 1)
    const textureUV = vec2(worldUV.x, float(1).sub(worldUV.y))
    const cell = floor(textureUV.mul(gridSize)).clamp(vec2(0), gridSize.sub(float(0.0001)))
    return ivec2(int(cell.x), int(cell.y))
  }
  const occlusionAt = (cell: Node<'ivec2'>): Node<'vec2'> => {
    const clampedCell = clampCell(cell)
    const texelFloat = floor(vec2(clampedCell).add(float(0.5)).div(gridSize).mul(occlusionTextureSize)).clamp(
      vec2(0),
      occlusionTextureSize.sub(float(1))
    )
    const sample = textureLoad(occlusionTexture, ivec2(int(texelFloat.x), int(texelFloat.y)))
    return inBounds(cell).select(vec2(sample.r, sample.a), vec2(0))
  }
  const emissionAt = (cell: Node<'ivec2'>): Node<'vec4'> => {
    const sample = textureLoad(emissiveTexture, clampCell(cell))
    return inBounds(cell).select(sample, vec4(0))
  }

  const startWorld = rayOrigin.add(rayDirection.mul(traceEntry))
  const endWorld = rayOrigin.add(rayDirection.mul(traceExit))
  const cell = worldToCell(startWorld).toVar()
  const endCell = worldToCell(endWorld)
  const delta = ivec2(endCell.x.sub(cell.x).abs(), endCell.y.sub(cell.y).abs())
  const stepDirection = ivec2(
    endCell.x.greaterThan(cell.x).select(int(1), endCell.x.lessThan(cell.x).select(int(-1), int(0))),
    endCell.y.greaterThan(cell.y).select(int(1), endCell.y.lessThan(cell.y).select(int(-1), int(0)))
  )
  const advancedX = int(0).toVar()
  const advancedY = int(0).toVar()
  const radiance = vec3(0).toVar()
  const result = intersectsWorld.not().select(float(1), float(0)).toVar()
  // A probe may begin inside the silhouette of the receiver being shaded
  // (the knight, a slime, or a wall face). Treat that initial connected run
  // of occupied cells as a receiver-side ray bias: leave it before applying
  // normal occlusion. Without this, every shadow caster kills all of its own
  // rays at step zero and renders with a dark moat. Once the ray reaches open
  // space, every later occupied cell blocks normally.
  const receiverPending = occlusionAt(cell)
    .y.greaterThan(float(0.5))
    .and(intersectsWorld)
    .select(float(1), float(0))
    .toVar()
  const emitterPending = float(0).toVar()

  const acceptEmission = (sample: Node<'vec4'>): void => {
    If(sample.rgb.length().greaterThan(float(0.00001)), () => {
      radiance.assign(sample.rgb)
      result.assign(float(2))
      Break()
    })
  }

  Loop(maxSteps, () => {
    If(intersectsWorld.not(), () => {
      Break()
    })

    acceptEmission(emissionAt(cell))
    const currentOcclusion = occlusionAt(cell)
    const currentOccupied = currentOcclusion.y.greaterThan(float(0.5))
    const currentEmitter = currentOcclusion.x.greaterThan(float(0.5))
    If(receiverPending.greaterThan(float(0.5)).and(currentOccupied.not()), () => {
      receiverPending.assign(float(0))
    })
    const testsOcclusion = receiverPending.lessThan(float(0.5))
    If(testsOcclusion.and(emitterPending.greaterThan(float(0.5))).and(currentEmitter.not()), () => {
      result.assign(float(-1))
      Break()
    })
    If(testsOcclusion.and(currentOccupied).and(currentEmitter.not()), () => {
      result.assign(float(-1))
      Break()
    })
    If(testsOcclusion.and(currentEmitter), () => {
      emitterPending.assign(float(1))
    })
    const reachedEnd = cell.x.equal(endCell.x).and(cell.y.equal(endCell.y))
    If(reachedEnd, () => {
      result.assign(emitterPending.greaterThan(float(0.5)).select(float(-1), float(1)))
      Break()
    })

    const onlyY = delta.x.equal(int(0))
    const onlyX = delta.y.equal(int(0))
    const crossingX = advancedX.mul(int(2)).add(int(1)).mul(delta.y)
    const crossingY = advancedY.mul(int(2)).add(int(1)).mul(delta.x)
    const stepX = onlyY.not().and(onlyX.or(crossingX.lessThan(crossingY)))
    const stepY = onlyX.not().and(onlyY.or(crossingY.lessThan(crossingX)))
    const stepCorner = onlyX.not().and(onlyY.not()).and(crossingX.equal(crossingY))

    If(stepCorner, () => {
      const neighborX = ivec2(cell.x.add(stepDirection.x), cell.y)
      const neighborY = ivec2(cell.x, cell.y.add(stepDirection.y))
      const emissionX = emissionAt(neighborX)
      const emissionY = emissionAt(neighborY)
      acceptEmission(emissionX.rgb.length().greaterThan(emissionY.rgb.length()).select(emissionX, emissionY))
      const occlusionX = occlusionAt(neighborX)
      const occlusionY = occlusionAt(neighborY)
      const emitterX = occlusionX.x.greaterThan(float(0.5))
      const emitterY = occlusionY.x.greaterThan(float(0.5))
      const wallX = occlusionX.y.greaterThan(float(0.5)).and(emitterX.not())
      const wallY = occlusionY.y.greaterThan(float(0.5)).and(emitterY.not())
      const testsCornerOcclusion = receiverPending.lessThan(float(0.5))
      If(testsCornerOcclusion.and(wallX.or(wallY)), () => {
        result.assign(float(-1))
        Break()
      })
      If(testsCornerOcclusion.and(emitterX.or(emitterY)), () => {
        emitterPending.assign(float(1))
      })
      If(testsCornerOcclusion.and(emitterPending.greaterThan(float(0.5))).and(emitterX.or(emitterY).not()), () => {
        result.assign(float(-1))
        Break()
      })
      cell.x.addAssign(stepDirection.x)
      cell.y.addAssign(stepDirection.y)
      advancedX.addAssign(int(1))
      advancedY.addAssign(int(1))
    })
    If(stepX, () => {
      cell.x.addAssign(stepDirection.x)
      advancedX.addAssign(int(1))
    })
    If(stepY, () => {
      cell.y.addAssign(stepDirection.y)
      advancedY.addAssign(int(1))
    })
  })

  return vec4(radiance, result)
}
