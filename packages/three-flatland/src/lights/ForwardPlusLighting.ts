import { DataTexture, FloatType, RGBAFormat, NearestFilter, Vector2, Vector3 } from 'three'
import { uniform, int, ivec2, textureLoad } from 'three/tsl'
import type { Light2D } from './Light2D'
import {
  registerDebugArray,
  registerDebugTexture,
  touchDebugArray,
  touchDebugTexture,
  unregisterDebugArray,
  unregisterDebugTexture,
} from '../debug/debug-sink'

/**
 * Screen-space tile edge in pixels.
 *
 * 16px gives finer-grained coverage of small fill lights (slime glows
 * ~40 world units) so the tile's closest-point score stays
 * representative of what the fragment would see at the tile center.
 * 32px showed visible blockiness on small fill lights because the
 * tile AABB could contain the light while its effective reach
 * barely extends to the tile's opposite corner — the scoring would
 * keep the light on the light's own side of the tile but evict it
 * by the far side, producing grid-aligned intensity falloff.
 *
 * CPU cost at 16px doubles vs 32px (more tiles), but dedup + the
 * reservoir path keep per-tile work bounded, and the per-fragment
 * shader loop is unchanged either way (MAX_LIGHTS_PER_TILE caps it).
 */
export const TILE_SIZE = 16

/**
 * Max lights any single tile can hold. Each tile dedicates
 * `MAX_LIGHTS_PER_TILE / 4 = 4` RGBA texels to light indices. Caps
 * the per-fragment shader loop iteration count — the inner loop
 * breaks early on the empty-slot sentinel, so tiles with fewer lights
 * pay only for what they hold.
 *
 * Raising this increases tile-texture footprint and the saturated-
 * tile shader worst case. Lowering it makes reservoir eviction kick
 * in sooner in dense scenes.
 */
export const MAX_LIGHTS_PER_TILE = 16

/**
 * Per-tile fill-light quota (sprites with `castsShadow: false`, e.g.
 * slime glows, atmospheric ambience). Fill lights saturating a tile
 * get deduplicated to the top-K by score; remaining in-range fills
 * are compensated via a luminance-preserving scale factor written to
 * the tile meta texel and applied in the shader. Keeps 1000-slime
 * scenes from drowning hero lights (torches) in tile competition
 * while preserving the "lots of soft fill" visual read.
 */
export const MAX_FILL_LIGHTS_PER_TILE = 2

/**
 * Number of fill-light categories with independent per-tile quotas
 * and compensation scales. Matches the meta texel channel count
 * (`.x/.y/.z/.w`) — 4 scalars of luminance compensation per tile,
 * one per category. Category 0 is the default for lights without a
 * `category` string set.
 */
export const FILL_CATEGORY_COUNT = 4

/**
 * Light-index blocks per tile — each block is one RGBA texel holding
 * 4 light indices. With MAX_LIGHTS_PER_TILE = 16 this is 4 blocks.
 */
export const BLOCKS_PER_TILE = MAX_LIGHTS_PER_TILE / 4

/**
 * Index of the first meta block within a tile's stride. Meta block
 * carries per-tile scalars consumed by the light shader:
 *
 *   meta.x = fillScale   (compensation for fill-light dedup; 1.0 if no fills skipped)
 *   meta.y = reserved
 *   meta.z = reserved
 *   meta.w = reserved
 */
export const META_BLOCK_INDEX = BLOCKS_PER_TILE

/**
 * Total RGBA texels consumed per tile. Sized to align each tile to a
 * 128-byte cache line on every target GPU class (mobile, desktop,
 * console) — stride 8 × 16 bytes/RGBA32F = 128 bytes. Reserves 3
 * meta slots beyond `fillScale` for future per-tile scalars without
 * needing another stride refactor.
 */
export const TILE_STRIDE = 8

/**
 * Fixed side-length of the tile-index DataTexture. Allocated once at
 * construction and NEVER resized — the previous tall-narrow layout
 * (`width = blocksPerTile`, `height = tileCount`) hit WebGPU's 8192
 * 2D-texture dimension limit at fullscreen (e.g. 1440p / 16-px tiles
 * ≈ 10k–14k rows), causing the GPU texture to allocate at a clipped
 * size and the shader to read zeros — visible as "lights disappear on
 * fullscreen, only ambient survives."
 *
 * 512 × 512 × RGBA32F = 1 MB GPU + CPU. Capacity is
 * `512² / TILE_STRIDE = 32,768` tiles — covers up to 4K CSS canvas
 * (3840×2160 → 32,400 tiles, 99% utilization) at TILE_SIZE=16.
 * Beyond 4K, bump TILE_SIZE to 32 or TILE_TEXTURE_DIM to 1024.
 */
export const TILE_TEXTURE_DIM = 512

export class ForwardPlusLighting {
  private _tileCountX = 0
  private _tileCountY = 0
  private _tileCount = 0

  private _tileData: Float32Array
  private _tileTexture: DataTexture
  /**
   * Per-tile light count (`length = _tileCount`). Promoted to a
   * persistent member so (a) no per-frame allocation, and (b) the
   * devtools registry can hold a stable reference to visualise which
   * tiles are saturated / empty.
   */
  private _lightCounts: Uint32Array = new Uint32Array(0)
  /**
   * Per-slot reservoir scores (`length = _tileCount * MAX_LIGHTS_PER_TILE`).
   * Same rationale — also exposed for debugging (per-tile quality).
   */
  private _tileScores: Float32Array = new Float32Array(0)
  /**
   * Per-slot category marker:
   *
   *   -1     hero slot (`castsShadow: true` light — never evicted by fills)
   *   0..3   fill slot holding a light with the given category bucket
   *
   * Lets the reservoir-eviction path compete each light against its
   * own category (fills in bucket 0 only displace other bucket-0
   * fills; buckets 1/2/3 likewise; heroes compete only among heroes).
   *
   * Length = `_tileCount * MAX_LIGHTS_PER_TILE`. `Int8Array` because
   * signed (need -1 for the hero marker).
   */
  private _tileSlotCategory: Int8Array = new Int8Array(0)
  /**
   * Per-tile per-category count of fill-light slots currently
   * claimed. Bounded by `MAX_FILL_LIGHTS_PER_TILE` per bucket.
   * Length = `_tileCount * FILL_CATEGORY_COUNT`.
   */
  private _tileFillCount: Uint8Array = new Uint8Array(0)
  /**
   * Per-tile per-category count of fill lights in range this frame —
   * how many fills in each bucket actually tried to claim a slot,
   * including those skipped by the quota. Divided by
   * `_tileFillCount[tileIdx * FILL_CATEGORY_COUNT + cat]` to derive
   * the per-tile per-category `fillScale` compensation factor.
   * Length = `_tileCount * FILL_CATEGORY_COUNT`.
   */
  private _tileFillInRange: Uint32Array = new Uint32Array(0)

  private _screenSize = new Vector2()
  private _worldSize = new Vector2()
  private _worldOffset = new Vector2()

  readonly tileCountXNode = uniform(1)
  readonly screenSizeNode = uniform(new Vector2(1, 1))
  readonly worldSizeNode = uniform(new Vector2(1, 1))
  readonly worldOffsetNode = uniform(new Vector2(0, 0))
  readonly ambientNode = uniform(new Vector3(0, 0, 0))

  constructor() {
    // Pre-allocate the tile texture at its maximum size. Never resized —
    // runtime `init()`/`resize()` updates only tile-count uniforms and
    // CPU-side bookkeeping arrays. Avoids the three.js-WebGPU resize
    // pitfall (replacing DataTexture.image orphans the backend's Source
    // cache) and sidesteps the WebGPU 8192 2D-texture dim limit that the
    // previous `height = tileCount` layout hit at fullscreen.
    const totalTexels = TILE_TEXTURE_DIM * TILE_TEXTURE_DIM
    this._tileData = new Float32Array(totalTexels * 4)
    this._tileTexture = new DataTexture(
      this._tileData,
      TILE_TEXTURE_DIM,
      TILE_TEXTURE_DIM,
      RGBAFormat,
      FloatType
    )
    this._tileTexture.minFilter = NearestFilter
    this._tileTexture.magFilter = NearestFilter
    this._tileTexture.needsUpdate = true
  }

  get tileTexture(): DataTexture {
    return this._tileTexture
  }

  get tileCountX(): number {
    return this._tileCountX
  }

  init(screenWidth: number, screenHeight: number): void {
    this._screenSize.set(screenWidth, screenHeight)
    this._tileCountX = Math.ceil(screenWidth / TILE_SIZE)
    this._tileCountY = Math.ceil(screenHeight / TILE_SIZE)
    this._tileCount = this._tileCountX * this._tileCountY

    this.tileCountXNode.value = this._tileCountX
    this.screenSizeNode.value.set(screenWidth, screenHeight)

    // Capacity check — if the viewport implies more tiles than the
    // fixed-size tile texture can hold, the last (out-of-capacity) tiles
    // will alias back into the texture via the linear-index mod. Warn so
    // callers know to bump TILE_TEXTURE_DIM or TILE_SIZE.
    const maxTiles = Math.floor((TILE_TEXTURE_DIM * TILE_TEXTURE_DIM) / TILE_STRIDE)
    if (this._tileCount > maxTiles) {
      console.warn(
        `[ForwardPlusLighting] ${this._tileCount} tiles exceeds texture capacity ${maxTiles}. ` +
          `Increase TILE_TEXTURE_DIM or TILE_SIZE. Excess tiles will alias.`
      )
    }

    // Grow-only CPU bookkeeping. These don't bind to the GPU so resize
    // is free — just allocate larger arrays when the tile count grows.
    // Never shrink (avoids churn when the window resizes down-then-up).
    if (this._lightCounts.length < this._tileCount) {
      this._lightCounts = new Uint32Array(this._tileCount)
      this._tileScores = new Float32Array(this._tileCount * MAX_LIGHTS_PER_TILE)
      this._tileSlotCategory = new Int8Array(this._tileCount * MAX_LIGHTS_PER_TILE)
      this._tileFillCount = new Uint8Array(this._tileCount * FILL_CATEGORY_COUNT)
      // Uint32 (not Uint16) because the debug-sink API only accepts
      // Float32/Uint32/Int32. The tile counter rarely exceeds a few
      // thousand fills in range per category, so the width upgrade is free.
      this._tileFillInRange = new Uint32Array(this._tileCount * FILL_CATEGORY_COUNT)
    }

    // (Re-)publish debug views. `registerDebugArray` is a no-op when
    // devtools isn't bundled (build-time gated), so this costs nothing
    // in production.
    registerDebugArray('forwardPlus.lightCounts', this._lightCounts, 'uint', {
      label: 'Lights per tile',
    })
    registerDebugArray('forwardPlus.tileScores', this._tileScores, 'float', {
      label: 'Reservoir scores',
    })
    registerDebugArray('forwardPlus.fillInRange', this._tileFillInRange, 'uint', {
      label: 'Fill lights in range (per tile)',
    })
    registerDebugTexture('forwardPlus.tiles', this._tileTexture, 'rgba32f', {
      label: 'Tile index DataTexture',
    })
  }

  resize(screenWidth: number, screenHeight: number): void {
    const newTileCountX = Math.ceil(screenWidth / TILE_SIZE)
    const newTileCountY = Math.ceil(screenHeight / TILE_SIZE)

    if (newTileCountX !== this._tileCountX || newTileCountY !== this._tileCountY) {
      this.init(screenWidth, screenHeight)
    }
  }

  setWorldBounds(worldSize: Vector2, worldOffset: Vector2): void {
    this._worldSize.copy(worldSize)
    this._worldOffset.copy(worldOffset)
    this.worldSizeNode.value.copy(worldSize)
    this.worldOffsetNode.value.copy(worldOffset)
  }

  update(lights: Light2D[]): void {
    if (this._tileCount === 0) return

    // Buffers are over-allocated vs. the current tile count — zero only
    // the portion we'll write to so per-frame cost doesn't scale with the
    // max-capacity tile texture (1MB).
    const usedTileFloats = this._tileCount * TILE_STRIDE * 4
    this._tileData.fill(0, 0, usedTileFloats)

    const lightCounts = this._lightCounts
    const tileScores = this._tileScores
    const tileSlotCategory = this._tileSlotCategory
    const tileFillCount = this._tileFillCount
    const tileFillInRange = this._tileFillInRange
    lightCounts.fill(0, 0, this._tileCount)
    tileScores.fill(0, 0, this._tileCount * MAX_LIGHTS_PER_TILE)
    // Zero out slot categories — -1 means "empty". Using fill() with
    // -1 on Int8Array writes 0xFF which reads back as -1.
    tileSlotCategory.fill(-1, 0, this._tileCount * MAX_LIGHTS_PER_TILE)
    tileFillCount.fill(0, 0, this._tileCount * FILL_CATEGORY_COUNT)
    tileFillInRange.fill(0, 0, this._tileCount * FILL_CATEGORY_COUNT)

    // Accumulate ambient lights into a single uniform — they affect every
    // pixel equally so they don't need Forward+ tile slots.
    let ambR = 0, ambG = 0, ambB = 0
    for (const light of lights) {
      if (!light.enabled || light.lightType !== 'ambient') continue
      ambR += light.color.r * light.intensity
      ambG += light.color.g * light.intensity
      ambB += light.color.b * light.intensity
    }
    this.ambientNode.value.set(ambR, ambG, ambB)

    const tileCountX = this._tileCountX
    const tileCountY = this._tileCountY
    const worldSizeX = this._worldSize.x
    const worldSizeY = this._worldSize.y
    const worldOffsetX = this._worldOffset.x
    const worldOffsetY = this._worldOffset.y
    const screenWidth = this._screenSize.x
    const screenHeight = this._screenSize.y

    // CPU tile bounds MUST agree with the shader's screen-pixel tile
    // division `tileX = floor(screenPos.x / TILE_SIZE)`. The intuitive
    // `worldSize / tileCount` subdivides world evenly but diverges
    // from the shader math whenever the viewport isn't a multiple of
    // TILE_SIZE (e.g., 1080-px heights give ceil(1080/32)=34 tiles of
    // world extent worldSize/34, but the shader's tile stride in
    // world coordinates is 32/1080 * worldSize — a ~0.1% per-tile
    // drift that accumulates to several world units by the last
    // row). The mismatch manifests as tile-wide checkerboard gaps in
    // assigned lights: fragments read a shader tile the CPU didn't
    // populate. Match the shader exactly:
    //
    //   tileWorldStride = TILE_SIZE / screenSize * worldSize
    //
    // The last tile may extend slightly past `worldSize` (because
    // tileCount * TILE_SIZE > screenSize for non-multiples), but
    // that "extra" area is off-screen so no fragments reference it.
    const tileWorldWidth = (TILE_SIZE / Math.max(1, screenWidth)) * worldSizeX
    const tileWorldHeight = (TILE_SIZE / Math.max(1, screenHeight)) * worldSizeY

    const tileWorldWidthInv = 1 / tileWorldWidth
    const tileWorldHeightInv = 1 / tileWorldHeight

    for (let lightIdx = 0; lightIdx < lights.length; lightIdx++) {
      const light = lights[lightIdx]!
      if (!light.enabled) continue
      if (light.lightType === 'ambient') continue

      const isDirectional = light.lightType === 'directional'
      const isFill = !light.castsShadow
      const importance = light.importance
      // `_categoryBucket` is a precomputed 0..3 hash of light.category
      // (see `categoryHash.ts`). Clamped defensively in case a user
      // mutated it directly.
      const categoryBucket = light._categoryBucket & (FILL_CATEGORY_COUNT - 1)
      const lx = light.position.x
      const ly = light.position.y
      const intensity = light.intensity
      const cutoff = light.distance
      const hasCutoff = cutoff > 0
      const cutoffSq = hasCutoff ? cutoff * cutoff : 0
      const cutoffInv = hasCutoff ? 1 / cutoff : 0
      const decay = light.decay

      // ── Per-light tile-range clamp ─────────────────────────────
      // Directional + no-cutoff lights touch every tile; everything
      // else only touches tiles whose AABB intersects the light's
      // bounding square `(lx ± cutoff, ly ± cutoff)`. For a scrolling
      // scene with many lights off-screen, most lights hit the
      // `continue` below and cost O(1) here instead of O(tileCount).
      let minTx: number
      let maxTx: number
      let minTy: number
      let maxTy: number
      if (isDirectional || !hasCutoff) {
        minTx = 0; maxTx = tileCountX - 1
        minTy = 0; maxTy = tileCountY - 1
      } else {
        minTx = Math.max(0, Math.floor((lx - cutoff - worldOffsetX) * tileWorldWidthInv))
        maxTx = Math.min(tileCountX - 1, Math.floor((lx + cutoff - worldOffsetX) * tileWorldWidthInv))
        minTy = Math.max(0, Math.floor((ly - cutoff - worldOffsetY) * tileWorldHeightInv))
        maxTy = Math.min(tileCountY - 1, Math.floor((ly + cutoff - worldOffsetY) * tileWorldHeightInv))
        // Entirely off-screen — light's bounding box doesn't overlap
        // the viewport at all. Most off-screen lights hit this branch.
        if (minTx > maxTx || minTy > maxTy) continue
      }

      // Accumulator-style tile-world coordinates to avoid recomputing
      // `ty * tileWorldHeight + worldOffsetY` inside the loop: start
      // at the min-row edge and step by `tileWorldHeight` each
      // iteration. Same pattern for x inside the row loop.
      let tileMinY = minTy * tileWorldHeight + worldOffsetY
      for (let ty = minTy; ty <= maxTy; ty++, tileMinY += tileWorldHeight) {
        const tileMaxY = tileMinY + tileWorldHeight
        const closestY = ly < tileMinY ? tileMinY : ly > tileMaxY ? tileMaxY : ly
        const dyAABB = ly - closestY
        const dySq = dyAABB * dyAABB
        // Row-level reject — even the closest Y on this row is out of
        // reach. Redundant with the range clamp in theory, but cheap
        // and catches edge rows where the clamp included tiles whose
        // closest-Y sits just outside `cutoff`.
        if (hasCutoff && dySq >= cutoffSq) continue

        let tileMinX = minTx * tileWorldWidth + worldOffsetX
        for (let tx = minTx; tx <= maxTx; tx++, tileMinX += tileWorldWidth) {
          let score: number
          if (isDirectional) {
            score = intensity
          } else {
            const tileMaxX = tileMinX + tileWorldWidth
            const closestX = lx < tileMinX ? tileMinX : lx > tileMaxX ? tileMaxX : lx
            const dxAABB = lx - closestX
            const distSq = dxAABB * dxAABB + dySq
            if (hasCutoff && distSq >= cutoffSq) continue

            // Fast-math scoring. `score` is a ranking-only quantity
            // (only relative ordering matters for tile slot
            // eviction), so we minimise sqrt / pow where the common
            // decay values allow:
            //   decay = 2 → base = intensity / max(distSq, 1)      no sqrt for base
            //   decay = 0 → base = intensity                       no dist math at all
            //   decay = 1 → base = intensity / max(dist, 1)        needs sqrt
            //   other    → base = intensity / max(pow(dist, d), 1) needs sqrt + pow
            // Falloff `1 - dist / cutoff` still needs dist — but
            // only when the light has a finite cutoff, and if decay
            // already forced a sqrt we reuse it.
            const needDist = hasCutoff || (decay !== 2 && decay !== 0)
            const dist = needDist ? Math.sqrt(distSq) : 0
            let base: number
            if (decay === 2) {
              base = intensity / Math.max(distSq, 1)
            } else if (decay === 0) {
              base = intensity
            } else if (decay === 1) {
              base = intensity / Math.max(dist, 1)
            } else {
              base = intensity / Math.max(Math.pow(dist, decay), 1)
            }
            const falloff = hasCutoff ? 1 - dist * cutoffInv : 1
            score = base * falloff
          }
          if (score <= 0) continue
          // Per-light importance bias — multiplicative so it stacks
          // cleanly with the physical score. Default 1.0 for most
          // lights; hero lights (torches) typically bump to 10 to keep
          // them immune to eviction by dense cosmetic clusters.
          score *= importance

          const tileIdx = ty * tileCountX + tx
          const count = lightCounts[tileIdx]!
          const scoreBase = tileIdx * MAX_LIGHTS_PER_TILE
          // Tile stride includes meta blocks; light blocks occupy the
          // first BLOCKS_PER_TILE texels. texelBase is in floats.
          const texelBase = tileIdx * TILE_STRIDE * 4

          if (isFill) {
            // Per-tile per-category counters drive both the quota and
            // the compensation-scaling math downstream.
            const fillKey = tileIdx * FILL_CATEGORY_COUNT + categoryBucket
            tileFillInRange[fillKey] = tileFillInRange[fillKey]! + 1
            const fillCountOfCat = tileFillCount[fillKey]!

            if (fillCountOfCat < MAX_FILL_LIGHTS_PER_TILE) {
              // This category's quota not met. Try to claim any
              // remaining tile slot. Fills never evict heroes or
              // other categories — they only fill empty space.
              if (count < MAX_LIGHTS_PER_TILE) {
                const blockIdx = count >> 2
                const elementIdx = count & 3
                this._tileData[texelBase + blockIdx * 4 + elementIdx] = lightIdx + 1
                tileScores[scoreBase + count] = score
                tileSlotCategory[scoreBase + count] = categoryBucket
                lightCounts[tileIdx] = count + 1
                tileFillCount[fillKey] = fillCountOfCat + 1
              }
              // Tile full (other categories / heroes claimed all
              // slots). Skip — the in-range bump above still counts
              // toward this category's compensation scale.
              continue
            }

            // Quota met for this category. Compete only within this
            // category's existing slots — find the weakest occupant
            // of the same bucket and evict only if the incoming
            // score is strictly higher (`>` prevents thrash at equal
            // scores).
            let minFillSlot = -1
            let minFillScore = Infinity
            for (let s = 0; s < MAX_LIGHTS_PER_TILE; s++) {
              if (tileSlotCategory[scoreBase + s] !== categoryBucket) continue
              const v = tileScores[scoreBase + s]!
              if (v < minFillScore) {
                minFillScore = v
                minFillSlot = s
              }
            }
            if (minFillSlot >= 0 && score > minFillScore) {
              const blockIdx = minFillSlot >> 2
              const elementIdx = minFillSlot & 3
              this._tileData[texelBase + blockIdx * 4 + elementIdx] = lightIdx + 1
              tileScores[scoreBase + minFillSlot] = score
              // tileSlotCategory stays at `categoryBucket`.
            }
            continue
          }

          // Hero light path (castsShadow=true — torches, sun,
          // cutscene key lights). Heroes compete only among heroes
          // and claim any free slot first.
          if (count < MAX_LIGHTS_PER_TILE) {
            const blockIdx = count >> 2
            const elementIdx = count & 3
            this._tileData[texelBase + blockIdx * 4 + elementIdx] = lightIdx + 1
            tileScores[scoreBase + count] = score
            tileSlotCategory[scoreBase + count] = -1  // hero sentinel
            lightCounts[tileIdx] = count + 1
            continue
          }

          // Tile full — heroes compete only with other heroes.
          // Evicting a fill with a hero would violate the quota
          // invariants the compensation math depends on; skip and
          // let the reservoir converge.
          let minHeroSlot = -1
          let minHeroScore = Infinity
          for (let s = 0; s < MAX_LIGHTS_PER_TILE; s++) {
            if (tileSlotCategory[scoreBase + s] !== -1) continue
            const v = tileScores[scoreBase + s]!
            if (v < minHeroScore) {
              minHeroScore = v
              minHeroSlot = s
            }
          }
          if (minHeroSlot >= 0 && score > minHeroScore) {
            const blockIdx = minHeroSlot >> 2
            const elementIdx = minHeroSlot & 3
            this._tileData[texelBase + blockIdx * 4 + elementIdx] = lightIdx + 1
            tileScores[scoreBase + minHeroSlot] = score
          }
        }
      }
    }

    // Compensation pass — per-category `fillScale = inRange / kept`.
    // Each tile's meta texel packs 4 scales into .x/.y/.z/.w, one
    // per fill-light category bucket. Categories with zero kept
    // lights fall back to 1.0 (no-op multiplier), so the shader can
    // always multiply blindly without branching on "is this tile
    // empty for my bucket".
    for (let tileIdx = 0; tileIdx < this._tileCount; tileIdx++) {
      const metaBase = (tileIdx * TILE_STRIDE + META_BLOCK_INDEX) * 4
      const fillBase = tileIdx * FILL_CATEGORY_COUNT
      for (let cat = 0; cat < FILL_CATEGORY_COUNT; cat++) {
        const kept = tileFillCount[fillBase + cat]!
        const inRange = tileFillInRange[fillBase + cat]!
        this._tileData[metaBase + cat] = kept > 0 ? inRange / kept : 1
      }
    }

    this._tileTexture.needsUpdate = true

    // Notify devtools the arrays changed this frame (no-op in prod).
    touchDebugArray('forwardPlus.lightCounts')
    touchDebugArray('forwardPlus.tileScores')
    touchDebugArray('forwardPlus.fillInRange')
    touchDebugTexture('forwardPlus.tiles')
  }

  createTileLookup() {
    const tileTexture = this._tileTexture
    const tileStride = int(TILE_STRIDE)
    const texWidth = int(TILE_TEXTURE_DIM)
    // Each tile occupies TILE_STRIDE consecutive RGBA texels in a flat
    // linear order — BLOCKS_PER_TILE light-index texels followed by
    // meta texels. Convert `(tileIndex, slotIndex)` → linear texel
    // index → 2D `(x, y)` in the fixed TILE_TEXTURE_DIM² texture.
    return (tileIndex: ReturnType<typeof int>, slotIndex: ReturnType<typeof int>) => {
      const blockOffset = slotIndex.div(int(4))
      const elementOffset = slotIndex.mod(int(4))
      const linearTexel = tileIndex.mul(tileStride).add(blockOffset)
      const x = linearTexel.mod(texWidth)
      const y = linearTexel.div(texWidth)
      return int(textureLoad(tileTexture, ivec2(x, y)).element(elementOffset))
    }
  }

  /**
   * Shader-side accessor for the per-tile meta texel. Returns the
   * full vec4 — `.x` is `fillScale`, `.y`/`.z`/`.w` reserved for
   * future per-tile scalars.
   *
   * Consumers read `fillScale` once at the start of their per-fragment
   * work and multiply it into non-shadow-casting light contributions
   * to preserve luminance when the fill-light quota culls some fills.
   */
  createTileMetaLookup() {
    const tileTexture = this._tileTexture
    const tileStride = int(TILE_STRIDE)
    const metaIndex = int(META_BLOCK_INDEX)
    const texWidth = int(TILE_TEXTURE_DIM)
    return (tileIndex: ReturnType<typeof int>) => {
      const linearTexel = tileIndex.mul(tileStride).add(metaIndex)
      const x = linearTexel.mod(texWidth)
      const y = linearTexel.div(texWidth)
      return textureLoad(tileTexture, ivec2(x, y))
    }
  }

  dispose(): void {
    this._tileTexture.dispose()
    unregisterDebugArray('forwardPlus.lightCounts')
    unregisterDebugArray('forwardPlus.tileScores')
    unregisterDebugArray('forwardPlus.fillInRange')
    unregisterDebugTexture('forwardPlus.tiles')
  }
}
