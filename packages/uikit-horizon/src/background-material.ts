import { isDarkMode } from '@three-flatland/uikit'
import { computed } from '@preact/signals-core'
import { Color } from 'three'
import { color, mix, uv } from 'three/tsl'
import { MeshBasicNodeMaterial } from 'three/webgpu'
import type { Node } from 'three/webgpu'

export const panelMaterialClass = computed(() =>
  isDarkMode.value ? DarkBackgroundMaterial : LightBackgroundMaterial
)

/**
 * Vertical UV gradient from `bottom` at v=0 to `top` at v=1.
 *
 * `createPanelNodeMaterial` picks this up as `panelBackgroundColorNode` and
 * splices it into `vec4(gradient, panelCoverage.a)` — replacing the RGB while
 * inheriting the panel's rounded-corner coverage. That is exactly what upstream
 * achieved by rewriting `#include <opaque_fragment>` to
 * `gl_FragColor = vec4(grad, diffuseColor.a)`, minus the GLSL.
 */
function verticalGradient(top: string, bottom: string): Node {
  return mix(color(new Color(bottom)), color(new Color(top)), uv().y.clamp(0, 1))
}

export class DarkBackgroundMaterial extends MeshBasicNodeMaterial {
  readonly panelBackgroundColorNode: Node = verticalGradient('#414141', '#272727')
}

export class LightBackgroundMaterial extends MeshBasicNodeMaterial {
  readonly panelBackgroundColorNode: Node = verticalGradient('#ffffff', '#f2f2f2')
}
