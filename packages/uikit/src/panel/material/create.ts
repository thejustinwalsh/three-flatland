import { FrontSide, type Plane } from 'three'
import { float, vec4 } from 'three/tsl'
import type { Node, NodeMaterial } from 'three/webgpu'
import { createPanelMaterialNodes } from './shader.js'

export type NodeMaterialClass = { new (): NodeMaterial }

/**
 * `instanced` materials carry a build-time `clipPlaneCount` (0..4): the group
 * that owns the batch fixes it — `0` for an all-unclipped batch (zero clip ALU),
 * `4` for a clipped batch (see perf win #3 / `instancedClipCoverage`).
 *
 * `normal` (non-instanced) materials may pass live world-space
 * `clippingPlanes` (from `createGlobalClippingPlanes`) to opt into the uniform
 * clip path — the panel clips itself via a coverage multiply in `colorNode`.
 */
export type PanelMaterialInfo =
  | { type: 'instanced'; clipPlaneCount: number }
  | { type: 'normal'; data: Float32Array; clippingPlanes?: Array<Plane> }

export type PanelMaterial = NodeMaterial

/**
 * Opt-in hook for a panel material class that wants to supply its own RGB — a
 * gradient, say — while inheriting the panel's coverage alpha (rounded corners,
 * opacity, per-instance clip).
 *
 * This replaces upstream's trick of patching `#include <opaque_fragment>` to
 * write `gl_FragColor = vec4(grad, diffuseColor.a)`. Same semantics: the RGB is
 * replaced outright (so borders do not show through), the alpha is the panel's.
 */
export interface PanelBackgroundColorNodeProvider {
  panelBackgroundColorNode?: Node
}

/**
 * Build a panel material from ANY node material class (MeshBasicNodeMaterial,
 * MeshPhysicalNodeMaterial, …) — the TSL replacement for upstream's
 * `createPanelMaterial` + `onBeforeCompile` GLSL patching (spec §5.1).
 *
 * `alphaTest` replaces the manual `discard` and applies in the main AND shadow
 * passes; full panel coverage lives in `colorNode.a` so shadow silhouettes stay
 * correct without PanelDepth/DistanceMaterial (spec §2.1/§2.2).
 */
export function createPanelNodeMaterial<T extends NodeMaterialClass>(
  MaterialClass: T,
  info: PanelMaterialInfo
): InstanceType<T> {
  const material = new MaterialClass() as InstanceType<T>
  const { colorNode, normalNode, positionNode } = createPanelMaterialNodes(info)
  material.side = FrontSide
  // NOTE: no `material.clipShadows` / `material.clippingPlanes` — both are
  // legacy-WebGLRenderer flags; the common (WebGPU) renderer reads clipping
  // state exclusively from ClippingGroups (ClippingContext.getGroupContext).
  // Panel clipping instead lives in `colorNode.a` (attribute lanes or the
  // uniform clip path), which the shadow pass reads too (spec §2.1).
  material.transparent = true
  material.toneMapped = false
  material.shadowSide = FrontSide
  material.alphaTest = 0.01
  // A class may replace the RGB while keeping the panel's coverage alpha — see
  // `PanelBackgroundColorNodeProvider`. Coverage MUST stay in `.a`, because the
  // shadow path reads `colorNode.a` and nothing else (spec §2.1).
  const background = (material as PanelBackgroundColorNodeProvider).panelBackgroundColorNode
  material.colorNode = background != null ? vec4(background, colorNode.w) : colorNode
  // `normalNode` computes the bent-panel surface normal for LIT materials. Assigning it to an unlit
  // `MeshBasicNodeMaterial` (uikit's default — every UI panel) is a shading no-op, but it still pulls
  // the normal/tangent/bitangent vertex attributes into the compiled program, taking the instanced
  // panel to 17 attributes — one past WebGL2's 16-attribute limit. WebGPU tolerates the overflow, but
  // under the WebGPU renderer's WebGL2 fallback the vertex shader fails to link ("Attribute location
  // out of range") and EVERY panel drops out (only text, a different material, survives). Basic
  // materials never shade with the normal, so skip it for them: no visual change, no WebGPU cost, and
  // the panel program drops back to 14 attributes so the WebGL2 fallback renders panels correctly.
  // (`lights` is true on all node materials incl. basic, so `isMeshBasicNodeMaterial` is the signal.)
  if ((material as { isMeshBasicNodeMaterial?: boolean }).isMeshBasicNodeMaterial !== true) {
    material.normalNode = normalNode
  }
  // Half-pixel edge headroom (see `dilatedPanelPosition`): applied in main and
  // shadow passes alike, so coverage silhouettes stay in sync.
  material.positionNode = positionNode
  // Coverage alpha (including material opacity) lives entirely in colorNode.a —
  // neutralize NodeMaterial's default `materialOpacity` multiply so it is not
  // applied twice. `opacityNode` is invisible to the shadow path (spec §2.2).
  material.opacityNode = float(1)
  // Panel clipping is a coverage multiply — never a discard (Q2). Opt out of
  // the renderer's clipping-context injection (ClippingNode discards per plane
  // in its default scope), so a panel material stays uniformity-warning-free
  // even when it renders inside a ClippingGroup(-contract) subtree, e.g. an
  // Image nested under a clipped Content. Redundant anyway: the panel's own
  // clip rect already includes every ancestor (ClippingRect.min).
  material.setupClipping = (() => null) as unknown as NodeMaterial['setupClipping']
  material.setupHardwareClipping = () => {
    material.hardwareClipping = false
  }
  return material
}
