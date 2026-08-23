import type { Sprite2DMaterial } from '../materials/Sprite2DMaterial'

interface AuthoredMaterialState {
  colorTransform: Sprite2DMaterial['colorTransform']
  globalUniforms: Sprite2DMaterial['globalUniforms']
  requiredChannels: Sprite2DMaterial['requiredChannels']
}

const authoredState = new WeakMap<Sprite2DMaterial, AuthoredMaterialState>()

export function retainFlatlandMaterialState(material: Sprite2DMaterial): void {
  if (authoredState.has(material)) return
  authoredState.set(material, {
    colorTransform: material.colorTransform,
    globalUniforms: material.globalUniforms,
    requiredChannels: material.requiredChannels,
  })
}

export function copyFlatlandMaterialState(target: Sprite2DMaterial, source: Sprite2DMaterial): void {
  const state = authoredState.get(source)
  if (state) authoredState.set(target, state)
}

export function restoreFlatlandMaterialState(material: Sprite2DMaterial): void {
  const state = authoredState.get(material)
  if (!state) return
  authoredState.delete(material)
  material.globalUniforms = state.globalUniforms
  material.colorTransform = state.colorTransform
  material.requiredChannels = state.requiredChannels
}
