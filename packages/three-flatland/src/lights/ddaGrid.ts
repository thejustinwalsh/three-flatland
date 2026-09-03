import type { Texture } from 'three'
import { Break, Continue, If, Loop, float, floor, int, ivec2, textureLoad, uint, vec2, vec3, vec4 } from 'three/tsl'
import type Node from 'three/src/nodes/core/Node.js'
import { worldToUV } from './coordUtils'
import { DDA_MASK_BYTE_SCALE, type DdaHierarchyLevel } from './DdaHierarchy'

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

const DDA_TIME_FIXED_SCALE = 4096
const DDA_TIME_SENTINEL = 0x3fffffff
const DDA_TIME_MAX = DDA_TIME_SENTINEL / DDA_TIME_FIXED_SCALE

/**
 * Parametric fixed-point supercover traversal on one globally anchored grid.
 *
 * Floating-point geometry establishes the entry cell and boundary distances
 * once. The hot loop then compares and increments Q12.12 `tMax` / `tDelta`
 * integers. The interval endpoint contributes only `traceSpan`, never the ray
 * slope, so every longer interval preserves the exact prefix of a shorter one.
 * This is the fixed-point Amanatides-Woo invariant that endpoint-derived
 * Bresenham traversal violated.
 *
 * Corner crossings conservatively test both side-adjacent cells so one-cell
 * walls cannot leak through a shared corner. Returns
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
  const gridSize = vec2(float(gridWidth), float(gridHeight)).toConst()
  const gridMax = ivec2(int(gridWidth - 1), int(gridHeight - 1)).toConst()
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

  const startWorld = rayOrigin.add(rayDirection.mul(traceEntry)).toConst()
  const startWorldUV = worldToUV(startWorld, worldSize, worldOffset).clamp(0, 1).toConst()
  const startTextureUV = vec2(startWorldUV.x, float(1).sub(startWorldUV.y)).toConst()
  const gridPosition = startTextureUV
    .mul(gridSize)
    .clamp(vec2(0), gridSize.sub(float(0.0001)))
    .toConst()
  const gridDirection = vec2(
    rayDirection.x.div(worldSize.x).mul(gridSize.x),
    rayDirection.y.div(worldSize.y).mul(gridSize.y).mul(float(-1))
  ).toConst()
  const parallelX = gridDirection.x.abs().lessThan(float(1e-8)).toConst()
  const parallelY = gridDirection.y.abs().lessThan(float(1e-8)).toConst()
  const stepDirection = ivec2(
    parallelX.select(int(0), gridDirection.x.greaterThan(float(0)).select(int(1), int(-1))),
    parallelY.select(int(0), gridDirection.y.greaterThan(float(0)).select(int(1), int(-1)))
  ).toConst()
  // Give exact internal boundaries to the cell the ray actually enters.
  const ownedPosition = gridPosition
    .add(vec2(stepDirection).mul(float(1e-5)))
    .clamp(vec2(0), gridSize.sub(float(0.0001)))
    .toConst()
  const cell = ivec2(int(floor(ownedPosition.x)), int(floor(ownedPosition.y))).toVar()
  const nextBoundary = vec2(
    stepDirection.x.greaterThan(int(0)).select(float(cell.x.add(int(1))), float(cell.x)),
    stepDirection.y.greaterThan(int(0)).select(float(cell.y.add(int(1))), float(cell.y))
  ).toConst()
  const quantizeTime = (value: Node<'float'>): Node<'int'> =>
    int(floor(value.clamp(float(0), float(DDA_TIME_MAX)).mul(float(DDA_TIME_FIXED_SCALE)).add(float(0.5))))
  const tDeltaX = quantizeTime(float(1).div(gridDirection.x.abs())).toConst()
  const tDeltaY = quantizeTime(float(1).div(gridDirection.y.abs())).toConst()
  const safeTDeltaX = tDeltaX.lessThan(int(1)).select(int(1), tDeltaX).toConst()
  const safeTDeltaY = tDeltaY.lessThan(int(1)).select(int(1), tDeltaY).toConst()
  const tDelta = ivec2(
    parallelX.select(int(DDA_TIME_SENTINEL), safeTDeltaX),
    parallelY.select(int(DDA_TIME_SENTINEL), safeTDeltaY)
  ).toConst()
  const tMax = ivec2(
    parallelX.select(int(DDA_TIME_SENTINEL), quantizeTime(nextBoundary.x.sub(gridPosition.x).div(gridDirection.x))),
    parallelY.select(int(DDA_TIME_SENTINEL), quantizeTime(nextBoundary.y.sub(gridPosition.y).div(gridDirection.y)))
  ).toVar()
  const traceSpan = quantizeTime(traceExit.sub(traceEntry).max(float(0))).toConst()
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
    const nextCrossing = tMax.x.lessThan(tMax.y).select(tMax.x, tMax.y).toConst()
    If(nextCrossing.greaterThanEqual(traceSpan), () => {
      reachedTraceLimit.assign(float(1))
      Break()
    })

    const stepCorner = tMax.x.sub(tMax.y).abs().lessThanEqual(int(1)).toConst()
    const stepX = stepCorner.not().and(tMax.x.lessThan(tMax.y)).toConst()
    const stepY = stepCorner.not().and(tMax.y.lessThan(tMax.x)).toConst()

    If(stepCorner, () => {
      const neighborX = ivec2(cell.x.add(stepDirection.x), cell.y)
      const neighborY = ivec2(cell.x, cell.y.add(stepDirection.y))
      If(occupiedAt(neighborX).or(occupiedAt(neighborY)), () => {
        transmittance.assign(float(0))
        Break()
      })
      cell.x.addAssign(stepDirection.x)
      cell.y.addAssign(stepDirection.y)
      tMax.x.addAssign(tDelta.x)
      tMax.y.addAssign(tDelta.y)
    })
    If(stepX, () => {
      cell.x.addAssign(stepDirection.x)
      tMax.x.addAssign(tDelta.x)
    })
    If(stepY, () => {
      cell.y.addAssign(stepDirection.y)
      tMax.y.addAssign(tDelta.y)
    })
  })

  return vec2(transmittance, reachedTraceLimit)
}

/**
 * Parametric fixed-point supercover traversal that resolves the first
 * emissive texel or wall.
 *
 * RGB contains captured sprite radiance. Alpha is a traversal result:
 * `-1` = blocked by an occluder, `0` = step budget exhausted,
 * `1` = reached the requested trace limit, `2` = hit emissive sprite pixels.
 * Emission is sampled before occupancy so a luminous silhouette never
 * self-shadows merely because it shares a grid cell with its visible sprite.
 */
export function traceDdaIntegerRadiance(
  hierarchyLevels: readonly DdaHierarchyLevel[],
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
  maxSteps: number,
  maxHierarchyLevel = 0
): Node<'vec4'> {
  const leafLevel = hierarchyLevels[0]
  if (!leafLevel) throw new Error('traceDdaIntegerRadiance requires a conservative leaf hierarchy')
  const gridSize = vec2(float(gridWidth), float(gridHeight)).toConst()
  const emissionAt = (cell: Node<'ivec2'>): Node<'vec3'> => textureLoad(emissiveTexture, cell).rgb.toConst()
  const clampIntNode = (value: Node<'int'>, max: number): Node<'int'> =>
    value.lessThan(int(0)).select(int(0), value.greaterThan(int(max)).select(int(max), value))
  const hierarchySignalThreshold = float(0.5 / DDA_MASK_BYTE_SCALE).toConst()
  const hierarchySignalsAt = (level: number, cell: Node<'ivec2'>): Node<'vec3'> => {
    const hierarchy = hierarchyLevels[level - 1]!
    const hierarchyCell = ivec2(
      clampIntNode(cell.x.shiftRight(level), hierarchy.width - 1),
      clampIntNode(cell.y.shiftRight(level), hierarchy.height - 1)
    ).toConst()
    return textureLoad(hierarchy.texture, hierarchyCell).rgb.toConst()
  }
  const fineSignalsAt = (cell: Node<'ivec2'>): Node<'vec3'> => {
    const leafCell = ivec2(
      clampIntNode(cell.x.shiftRight(1), leafLevel.width - 1),
      clampIntNode(cell.y.shiftRight(1), leafLevel.height - 1)
    ).toConst()
    const packed = textureLoad(leafLevel.texture, leafCell).rgb.toConst()
    const occupiedMask = uint(floor(packed.r.mul(float(DDA_MASK_BYTE_SCALE)).add(float(0.5)))).toConst()
    const emitterMask = uint(floor(packed.g.mul(float(DDA_MASK_BYTE_SCALE)).add(float(0.5)))).toConst()
    const emissionMask = uint(floor(packed.b.mul(float(DDA_MASK_BYTE_SCALE)).add(float(0.5)))).toConst()
    const bitIndex = uint(cell.x.bitAnd(int(1)).add(cell.y.bitAnd(int(1)).mul(int(2)))).toConst()
    const bit = uint(1).shiftLeft(bitIndex).toConst()
    return vec3(
      occupiedMask.bitAnd(bit).greaterThan(uint(0)).select(float(1), float(0)),
      emitterMask.bitAnd(bit).greaterThan(uint(0)).select(float(1), float(0)),
      emissionMask.bitAnd(bit).greaterThan(uint(0)).select(float(1), float(0))
    )
  }

  const startWorld = rayOrigin.add(rayDirection.mul(traceEntry)).toConst()
  const startWorldUV = worldToUV(startWorld, worldSize, worldOffset).clamp(0, 1).toConst()
  const startTextureUV = vec2(startWorldUV.x, float(1).sub(startWorldUV.y)).toConst()
  const gridPosition = startTextureUV
    .mul(gridSize)
    .clamp(vec2(0), gridSize.sub(float(0.0001)))
    .toConst()
  const gridDirection = vec2(
    rayDirection.x.div(worldSize.x).mul(gridSize.x),
    rayDirection.y.div(worldSize.y).mul(gridSize.y).mul(float(-1))
  ).toConst()
  const parallelX = gridDirection.x.abs().lessThan(float(1e-8)).toConst()
  const parallelY = gridDirection.y.abs().lessThan(float(1e-8)).toConst()
  const stepDirection = ivec2(
    parallelX.select(int(0), gridDirection.x.greaterThan(float(0)).select(int(1), int(-1))),
    parallelY.select(int(0), gridDirection.y.greaterThan(float(0)).select(int(1), int(-1)))
  ).toConst()
  const ownedPosition = gridPosition
    .add(vec2(stepDirection).mul(float(1e-5)))
    .clamp(vec2(0), gridSize.sub(float(0.0001)))
    .toConst()
  const cell = ivec2(int(floor(ownedPosition.x)), int(floor(ownedPosition.y))).toVar()
  const nextBoundary = vec2(
    stepDirection.x.greaterThan(int(0)).select(float(cell.x.add(int(1))), float(cell.x)),
    stepDirection.y.greaterThan(int(0)).select(float(cell.y.add(int(1))), float(cell.y))
  ).toConst()
  const quantizeTime = (value: Node<'float'>): Node<'int'> =>
    int(floor(value.clamp(float(0), float(DDA_TIME_MAX)).mul(float(DDA_TIME_FIXED_SCALE)).add(float(0.5))))
  const tDeltaX = quantizeTime(float(1).div(gridDirection.x.abs())).toConst()
  const tDeltaY = quantizeTime(float(1).div(gridDirection.y.abs())).toConst()
  const safeTDeltaX = tDeltaX.lessThan(int(1)).select(int(1), tDeltaX).toConst()
  const safeTDeltaY = tDeltaY.lessThan(int(1)).select(int(1), tDeltaY).toConst()
  const tDelta = ivec2(
    parallelX.select(int(DDA_TIME_SENTINEL), safeTDeltaX),
    parallelY.select(int(DDA_TIME_SENTINEL), safeTDeltaY)
  ).toConst()
  const tMax = ivec2(
    parallelX.select(int(DDA_TIME_SENTINEL), quantizeTime(nextBoundary.x.sub(gridPosition.x).div(gridDirection.x))),
    parallelY.select(int(DDA_TIME_SENTINEL), quantizeTime(nextBoundary.y.sub(gridPosition.y).div(gridDirection.y)))
  ).toVar()
  const traceSpan = quantizeTime(traceExit.sub(traceEntry).max(float(0))).toConst()
  const radiance = vec3(0).toVar()
  const result = intersectsWorld.not().select(float(1), float(0)).toVar()
  // A probe may begin inside the silhouette of the receiver being shaded
  // (the knight, a slime, or a wall face). Treat that initial connected run
  // of occupied cells as a receiver-side ray bias: leave it before applying
  // normal occlusion. Without this, every shadow caster kills all of its own
  // rays at step zero and renders with a dark moat. Once the ray reaches open
  // space, every later occupied cell blocks normally.
  // Start in receiver-bias mode unconditionally. An open first cell clears it
  // during iteration zero; an occupied first cell keeps it until the ray exits
  // that initial silhouette. This avoids loading the same starting occlusion
  // texel both here and again at the top of the loop.
  const receiverPending = intersectsWorld.select(float(1), float(0)).toVar()
  const emitterPending = float(0).toVar()

  const acceptEmission = (sample: Node<'vec3'>): void => {
    // Squared magnitude preserves the comparison without a sqrt per cell.
    If(sample.dot(sample).greaterThan(float(1e-10)), () => {
      radiance.assign(sample)
      result.assign(float(2))
      Break()
    })
  }

  If(intersectsWorld, () => {
    Loop(maxSteps, () => {
      // Descend from the coarsest legal level. The hierarchy stores exact OR
      // presence, so only proven-empty blocks can skip. A non-empty parent
      // falls through to its child and ultimately the exact 2x2 leaf mask.
      for (let level = Math.min(maxHierarchyLevel, hierarchyLevels.length); level >= 1; level--) {
        const coarseScale = 2 ** level
        const coarseSignals = hierarchySignalsAt(level, cell).toConst()
        const coarseEmpty = coarseSignals.x
          .lessThan(hierarchySignalThreshold)
          .and(coarseSignals.y.lessThan(hierarchySignalThreshold))
          .and(coarseSignals.z.lessThan(hierarchySignalThreshold))
          .and(receiverPending.lessThan(float(0.5)))
          .and(emitterPending.lessThan(float(0.5)))
          .toConst()
        If(coarseEmpty, () => {
          const remainderX = cell.x.bitAnd(int(coarseScale - 1)).toConst()
          const remainderY = cell.y.bitAnd(int(coarseScale - 1)).toConst()
          const cellsToBoundaryX = stepDirection.x
            .greaterThan(int(0))
            .select(int(coarseScale).sub(remainderX), remainderX.add(int(1)))
            .toConst()
          const cellsToBoundaryY = stepDirection.y
            .greaterThan(int(0))
            .select(int(coarseScale).sub(remainderY), remainderY.add(int(1)))
            .toConst()
          const coarseCrossingX = parallelX
            .select(int(DDA_TIME_SENTINEL), tMax.x.add(tDelta.x.mul(cellsToBoundaryX.sub(int(1)))))
            .toConst()
          const coarseCrossingY = parallelY
            .select(int(DDA_TIME_SENTINEL), tMax.y.add(tDelta.y.mul(cellsToBoundaryY.sub(int(1)))))
            .toConst()
          // At an exact coarse corner, descend instead of skipping so both
          // side-adjacent blocks are conservatively considered.
          const coarseCorner = coarseCrossingX.sub(coarseCrossingY).abs().lessThanEqual(int(1)).toConst()
          If(coarseCorner.not(), () => {
            const skipCrossing = coarseCrossingX
              .lessThan(coarseCrossingY)
              .select(coarseCrossingX, coarseCrossingY)
              .toConst()
            If(skipCrossing.greaterThanEqual(traceSpan), () => {
              result.assign(float(1))
              Break()
            })

            // The chosen coarse boundary has a known crossing count. Only the
            // other axis needs a variable divide, halving the expensive
            // integer divisions used by the previous fixed-mip skip.
            If(coarseCrossingX.lessThan(coarseCrossingY), () => {
              const crossesY = tMax.y
                .lessThanEqual(skipCrossing)
                .select(skipCrossing.sub(tMax.y).div(tDelta.y).add(int(1)), int(0))
                .toConst()
              cell.x.addAssign(stepDirection.x.mul(cellsToBoundaryX))
              cell.y.addAssign(stepDirection.y.mul(crossesY))
              tMax.x.addAssign(tDelta.x.mul(cellsToBoundaryX))
              tMax.y.addAssign(tDelta.y.mul(crossesY))
              Continue()
            }).Else(() => {
              const crossesX = tMax.x
                .lessThanEqual(skipCrossing)
                .select(skipCrossing.sub(tMax.x).div(tDelta.x).add(int(1)), int(0))
                .toConst()
              cell.x.addAssign(stepDirection.x.mul(crossesX))
              cell.y.addAssign(stepDirection.y.mul(cellsToBoundaryY))
              tMax.x.addAssign(tDelta.x.mul(crossesX))
              tMax.y.addAssign(tDelta.y.mul(cellsToBoundaryY))
              Continue()
            })
          })
        })
      }

      const currentSignals = fineSignalsAt(cell).toConst()
      If(currentSignals.z.greaterThan(float(0.5)), () => {
        acceptEmission(emissionAt(cell))
      })
      const currentOccupied = currentSignals.x.greaterThan(float(0.5)).toConst()
      const currentEmitter = currentSignals.y.greaterThan(float(0.5)).toConst()
      If(receiverPending.greaterThan(float(0.5)).and(currentOccupied.not()), () => {
        receiverPending.assign(float(0))
      })
      const testsOcclusion = receiverPending.lessThan(float(0.5)).toConst()
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
      const nextCrossing = tMax.x.lessThan(tMax.y).select(tMax.x, tMax.y).toConst()
      If(nextCrossing.greaterThanEqual(traceSpan), () => {
        result.assign(emitterPending.greaterThan(float(0.5)).select(float(-1), float(1)))
        Break()
      })

      const stepCorner = tMax.x.sub(tMax.y).abs().lessThanEqual(int(1)).toConst()
      const stepX = stepCorner.not().and(tMax.x.lessThan(tMax.y)).toConst()
      const stepY = stepCorner.not().and(tMax.y.lessThan(tMax.x)).toConst()

      If(stepCorner, () => {
        const neighborX = ivec2(cell.x.add(stepDirection.x), cell.y).toConst()
        const neighborY = ivec2(cell.x, cell.y.add(stepDirection.y)).toConst()
        const signalsX = fineSignalsAt(neighborX).toConst()
        const signalsY = fineSignalsAt(neighborY).toConst()
        const emissionX = vec3(0).toVar()
        const emissionY = vec3(0).toVar()
        If(signalsX.z.greaterThan(float(0.5)), () => {
          emissionX.assign(emissionAt(neighborX))
        })
        If(signalsY.z.greaterThan(float(0.5)), () => {
          emissionY.assign(emissionAt(neighborY))
        })
        acceptEmission(emissionX.dot(emissionX).greaterThan(emissionY.dot(emissionY)).select(emissionX, emissionY))
        const emitterX = signalsX.y.greaterThan(float(0.5)).toConst()
        const emitterY = signalsY.y.greaterThan(float(0.5)).toConst()
        const wallX = signalsX.x.greaterThan(float(0.5)).and(emitterX.not()).toConst()
        const wallY = signalsY.x.greaterThan(float(0.5)).and(emitterY.not()).toConst()
        const testsCornerOcclusion = receiverPending.lessThan(float(0.5)).toConst()
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
        tMax.x.addAssign(tDelta.x)
        tMax.y.addAssign(tDelta.y)
      })
      If(stepX, () => {
        cell.x.addAssign(stepDirection.x)
        tMax.x.addAssign(tDelta.x)
      })
      If(stepY, () => {
        cell.y.addAssign(stepDirection.y)
        tMax.y.addAssign(tDelta.y)
      })
    })
  })

  return vec4(radiance, result)
}
