import { FrontSide } from 'three'
import { float, vec4 } from 'three/tsl'
import type { Node, NodeMaterial } from 'three/webgpu'
import { createPanelMaterialNodes } from './shader.js'

export type NodeMaterialClass = { new (): NodeMaterial }

export type PanelMaterialInfo = { type: 'instanced' } | { type: 'normal'; data: Float32Array }

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
  const { colorNode, normalNode } = createPanelMaterialNodes(info)
  material.side = FrontSide
  material.clipShadows = true
  material.transparent = true
  material.toneMapped = false
  material.shadowSide = FrontSide
  material.alphaTest = 0.01
  // A class may replace the RGB while keeping the panel's coverage alpha — see
  // `PanelBackgroundColorNodeProvider`. Coverage MUST stay in `.a`, because the
  // shadow path reads `colorNode.a` and nothing else (spec §2.1).
  const background = (material as PanelBackgroundColorNodeProvider).panelBackgroundColorNode
  material.colorNode = background != null ? vec4(background, colorNode.w) : colorNode
  material.normalNode = normalNode
  // Coverage alpha (including material opacity) lives entirely in colorNode.a —
  // neutralize NodeMaterial's default `materialOpacity` multiply so it is not
  // applied twice. `opacityNode` is invisible to the shadow path (spec §2.2).
  material.opacityNode = float(1)
  return material
}
