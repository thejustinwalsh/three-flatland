import { MeshDepthMaterial, MeshDistanceMaterial, RGBADepthPacking } from 'three'
import type { WebGLProgramParametersWithUniforms, WebGLRenderer } from 'three'
import type { PanelMaterialInfo } from './create.js'

// STUB: ported in U1/U2. Correction #1 (design spec §2) — this whole module is dead
// under the common Renderer (`customDepthMaterial`/`customDistanceMaterial` are never
// read by `renderers/common/`); shadow silhouettes come from `colorNode.a` + `alphaTest`
// instead (spec §5.3). Kept only so `panel/instance/mesh.ts` / `components/image.ts`
// module-scope construction doesn't throw at import time — only the render-time
// `onBeforeCompile` bodies throw. Deleted for real once U1 lands.

export class PanelDistanceMaterial extends MeshDistanceMaterial {
  constructor(private info: PanelMaterialInfo) {
    super()
    if (this.defines == null) {
      this.defines = {}
    }
    this.defines.USE_UV = ''
    this.clipShadows = true
  }

  onBeforeCompile(_parameters: WebGLProgramParametersWithUniforms, _renderer: WebGLRenderer): void {
    void this.info
    throw new Error('ported in U1/U2')
  }
}

export class PanelDepthMaterial extends MeshDepthMaterial {
  constructor(private info: PanelMaterialInfo) {
    super({ depthPacking: RGBADepthPacking })
    if (this.defines == null) {
      this.defines = {}
    }
    this.defines.USE_UV = ''
    this.clipShadows = true
  }

  onBeforeCompile(_parameters: WebGLProgramParametersWithUniforms, _renderer: WebGLRenderer): void {
    void this.info
    throw new Error('ported in U1/U2')
  }
}

export const instancedPanelDepthMaterial = new PanelDepthMaterial({ type: 'instanced' })
export const instancedPanelDistanceMaterial = new PanelDistanceMaterial({ type: 'instanced' })
