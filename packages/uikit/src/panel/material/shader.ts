import type { WebGLProgramParametersWithUniforms } from 'three'

// STUB: ported in U1/U2. Upstream injects GLSL fragment/vertex chunks; the fork
// replaces this with a TSL coverage-graph Fn() (spec §5.3).
export function compilePanelDepthMaterial(
  _parameters: WebGLProgramParametersWithUniforms,
  _instanced: boolean
): void {
  throw new Error('ported in U1/U2')
}

// STUB: ported in U1/U2. See compilePanelDepthMaterial above.
export function compilePanelMaterial(
  _parameters: WebGLProgramParametersWithUniforms,
  _instanced: boolean
): void {
  throw new Error('ported in U1/U2')
}
