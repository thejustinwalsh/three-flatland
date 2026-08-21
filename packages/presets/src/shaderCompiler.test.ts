import { BufferAttribute, PlaneGeometry, Vector2 } from 'three'
import { float, uniform, vec2, vec3, vec4 } from 'three/tsl'
import type Node from 'three/src/nodes/core/Node.js'
import {
  compileFragmentNode,
  createShaderTexture,
  shaderSources,
  validateShaderSources,
  type ShaderBackend,
  type ShaderSource,
} from '@three-flatland/tsl-test'
import { afterAll, describe, expect, it } from 'vitest'
import { LightStore } from 'three-flatland'
import { DefaultLightEffect } from './lighting/DefaultLightEffect'
import { NormalMapProvider } from './lighting/NormalMapProvider'

const shaders = new Map<string, ShaderSource>()
const texture = createShaderTexture()

function spriteGeometry() {
  const geometry = new PlaneGeometry(1, 1)
  geometry.setAttribute(
    'instanceSystem',
    new BufferAttribute(new Float32Array([1, 1, 3, 0, 1, 1, 3, 0, 1, 1, 3, 0, 1, 1, 3, 0]), 4)
  )
  geometry.setAttribute(
    'instanceExtras',
    new BufferAttribute(new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]), 4)
  )
  return geometry
}

function capture(label: string, backend: ShaderBackend, factory: () => Node) {
  const program = compileFragmentNode(factory, backend, { geometry: spriteGeometry() })
  expect(program.diagnostics, `${backend} ${label} logged shader code-generation errors`).toEqual([])
  for (const shader of shaderSources(program, label)) {
    shaders.set(`${shader.backend}:${shader.stage}:${shader.output}`, shader)
  }
}

function lightingNode(withOptionalBranches: boolean) {
  const effect = new DefaultLightEffect()
  if (withOptionalBranches) {
    Object.assign(effect._constants, {
      bandsEnabled: false,
      glowEnabled: true,
      pixelSnapEnabled: true,
      rimEnabled: true,
      shadowFilter: 'nearest',
      shadowPixelSnapEnabled: true,
    })
  }

  const lightFn = effect.build(
    new LightStore({ maxLights: 4 }),
    uniform(new Vector2(320, 180)),
    uniform(new Vector2(-160, -90)),
    texture
  )
  const context = {
    color: vec4(0.2, 0.4, 0.6, 0.8),
    atlasUV: vec2(0.25, 0.75),
    worldPosition: vec2(12, 24),
    normal: vec3(0, 0, 1),
    elevation: float(0.25),
  }
  return lightFn(context)
}

afterAll(async () => {
  try {
    await validateShaderSources([...shaders.values()])
  } finally {
    texture.dispose()
  }
}, 60_000)

describe.each<ShaderBackend>(['wgsl', 'glsl'])('%s preset TSL compatibility', (backend) => {
  it('compiles default lighting', () => {
    capture('default-lighting', backend, () => lightingNode(false))
  })

  it('compiles optional lighting branches', () => {
    capture('optional-lighting', backend, () => lightingNode(true))
  })

  it.each(['normal', 'elevation'] as const)('compiles the normal-map %s channel', (channel) => {
    const channelNode = NormalMapProvider.channelNode
    expect(channelNode).not.toBeNull()
    capture(`normal-map-${channel}`, backend, () => {
      const result = channelNode!(channel, {
        atlasUV: vec2(0.25, 0.75),
        constants: { normalMap: texture },
        attrs: {},
        baseTexture: texture,
      })
      return channel === 'normal' ? vec4(result as Node<'vec3'>, 1) : vec4(vec3(0, 0, 1), result as Node<'float'>)
    })
  })
})
