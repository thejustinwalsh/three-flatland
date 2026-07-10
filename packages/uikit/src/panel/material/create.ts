import type { Material } from 'three'

export type MaterialClass = { new (...args: Array<any>): Material }

type InstanceOf<T> = T extends { new (): infer K } ? K : never

export type PanelMaterialInfo = { type: 'instanced' } | { type: 'normal'; data: Float32Array }

export type PanelMaterial = InstanceOf<ReturnType<typeof createPanelMaterial>>

// STUB: ported in U1/U2. Upstream builds a GLSL-injecting Material via onBeforeCompile;
// the fork replaces this with a TSL NodeMaterial factory (spec §5.1).
export function createPanelMaterial<T extends MaterialClass>(
  _MaterialClass: T,
  _info: PanelMaterialInfo
): Material {
  throw new Error('ported in U1/U2')
}
