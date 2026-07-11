import { Vector3 } from 'three'
import {
  type BoundingBox,
  Content,
  type ContentOutProperties,
  contentOutPropertiesSchema,
} from './content.js'
import { computed, signal } from '@preact/signals-core'
import { abortableEffect, loadResourceWithParams } from '../utils.js'
import { loadSVGShapes } from '@three-flatland/slug'
import type { RegisteredSVG } from '@three-flatland/slug'
import type { BaseOutProperties, InProperties, WithSignal } from '../properties/index.js'
import type { RenderContext } from '../context.js'
import { string } from 'zod'
import type { z } from 'zod'
import { createInPropertiesSchema, defineSchema } from '../properties/schema.js'
import { computedGlobalContentMatrix } from '../svg/matrix.js'
import { createInstancedShapes } from '../svg/render/index.js'
import { getSharedShapeSet, svgCache } from '../svg/shape-set.js'

export const svgOutPropertiesSchema = /* @__PURE__ */ defineSchema(() =>
  contentOutPropertiesSchema.extend({
    src: string().optional(),
    content: string().optional(),
  })
)
export const SvgPropertiesSchema = /* @__PURE__ */ defineSchema(() =>
  createInPropertiesSchema(svgOutPropertiesSchema)
)

export type SvgOutProperties = ContentOutProperties & {
  keepAspectRatio?: boolean
  src?: string
  content?: string
}
export type SvgProperties = z.input<typeof SvgPropertiesSchema>

/**
 * Renders SVG paths through `@three-flatland/slug`'s `SlugShapeBatch` — one
 * draw call for every icon sharing a `SlugShapeSet` (see `svg/render/`),
 * resolution-independent, no render targets. Upstream's `Svg` tessellates a
 * `Mesh` + `MeshBasicMaterial` per path per instance (hundreds of icons is
 * hundreds-to-thousands of draw calls); this rewrite keeps the public API
 * (`src`, `content`, `width`, `height`, `fill`, `keepAspectRatio`) and
 * constructor signature identical — only the rendering internals change.
 */
export class Svg<
  OutProperties extends SvgOutProperties = SvgOutProperties,
> extends Content<OutProperties> {
  constructor(
    inputProperties?: InProperties<OutProperties>,
    initialClasses?: Array<InProperties<BaseOutProperties> | string>,
    protected inputConfig?: {
      renderContext?: RenderContext
      defaultOverrides?: InProperties<OutProperties>
      defaults?: WithSignal<OutProperties>
    }
  ) {
    const boundingBox = signal<BoundingBox | undefined>(undefined)
    super(inputProperties, initialClasses, {
      ...inputConfig,
      remeasureOnChildrenChange: false,
      depthWriteDefault: false,
      supportFillProperty: true,
      boundingBox,
    })

    const svgResult = signal<RegisteredSVG | undefined>(undefined)
    // Every `Svg` instance registers its paths into the ONE module-level
    // shared `SlugShapeSet` (`svg/shape-set.ts`), so `ShapeGroupManager`
    // (keyed by `SlugShapeSet` identity) batches ALL icons — not just
    // repeats of the same source — into a single draw call. `svgCache`
    // below only dedupes redundant re-parses of the SAME source; the
    // cross-source batching comes from the shared set, not this cache.
    loadResourceWithParams(
      svgResult,
      loadSvg,
      undefined,
      this.abortSignal,
      computed(() => ({
        src: this.properties.value.src,
        content: this.properties.value.content,
      }))
    )

    abortableEffect(() => {
      const result = svgResult.value
      if (result == null) {
        boundingBox.value = undefined
        return
      }
      // Normalize the viewBox the SAME way `slug/svg`'s `parseSVG` normalized
      // every path's contours (longer side = 1, y flipped up) — `boundingBox`
      // and shape-space MUST share one frame for `Content`'s proportional
      // box math to place shapes correctly (see `svg/matrix.ts`).
      const s = 1 / Math.max(result.viewBox.width, result.viewBox.height)
      const width = result.viewBox.width * s
      const height = result.viewBox.height * s
      boundingBox.value = {
        center: new Vector3(width * 0.5, height * 0.5, 0),
        size: new Vector3(width, height, 0.00001),
      }
    }, this.abortSignal)

    const parentClippingRect = computed(() => this.parentContainer.value?.clippingRect.value)
    const globalContentMatrix = computedGlobalContentMatrix(this)

    createInstancedShapes(
      {
        root: this.root,
        svgSignal: svgResult,
        orderInfo: this.orderInfo,
        properties: this.properties,
        globalContentMatrix,
        isVisible: this.isVisible,
        abortSignal: this.abortSignal,
      },
      parentClippingRect
    )
  }

  add(): this {
    throw new Error(`the svg component can not have any children`)
  }

  clone(recursive?: boolean): this {
    const cloned = new Svg(this.inputProperties, this.initialClasses, this.inputConfig) as this
    this.copyInto(cloned, recursive)
    return cloned
  }
}

/**
 * Resolves `src`/`content` into a `RegisteredSVG`, registering into the
 * shared `SlugShapeSet` (`svg/shape-set.ts`) so every `Svg` instance
 * batches together. Exported for tests only — not part of the public API.
 */
export async function loadSvg({
  src,
  content,
}: {
  src?: string
  content?: string
}): Promise<RegisteredSVG | undefined> {
  if (src == null && content == null) {
    return undefined
  }
  const key = src ?? content!
  let promise = svgCache.get(key)
  if (promise == null) {
    svgCache.set(key, (promise = loadSVGShapes(key, getSharedShapeSet())))
  }
  return promise
}
