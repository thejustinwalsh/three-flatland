import { MeshPhongNodeMaterial, MeshPhysicalNodeMaterial } from 'three/webgpu'
import type { NodeMaterialClass } from './create.js'

export class PlasticMaterial extends MeshPhongNodeMaterial {
  constructor() {
    super({
      specular: '#111',
      shininess: 100,
    })
  }
}

export class GlassMaterial extends MeshPhysicalNodeMaterial {
  constructor() {
    super({
      roughness: 0.1,
      reflectivity: 0.5,
      iridescence: 0.001,
      thickness: 0.05,
      metalness: 0.3,
      ior: 2,
    })
  }
}

export class MetalMaterial extends MeshPhysicalNodeMaterial {
  constructor() {
    super({
      iridescence: 0.001,
      metalness: 0.8,
      roughness: 0.1,
    })
  }
}

export const materialClasses = {
  glass: GlassMaterial,
  metal: MetalMaterial,
  plastic: PlasticMaterial,
}

export type PanelMaterialClass = NodeMaterialClass | keyof typeof materialClasses

export function resolvePanelMaterialClassProperty(input: PanelMaterialClass): NodeMaterialClass {
  if (typeof input != 'string') {
    return input
  }
  return materialClasses[input]
}
