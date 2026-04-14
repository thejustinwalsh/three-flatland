import { describe, it, expect, vi, afterEach } from 'vitest'
import { Flatland } from './Flatland'
import { createLightEffect } from './lights/LightEffect'
import { vec4 } from 'three/tsl'

const LitNoShadows = createLightEffect({
  name: 'litNoShadows',
  schema: {} as const,
  needsShadows: false,
  light: () => (ctx) => vec4(ctx.color.rgb, ctx.color.a),
})

const LitWithShadows = createLightEffect({
  name: 'litWithShadows',
  schema: {} as const,
  needsShadows: true,
  light: () => (ctx) => vec4(ctx.color.rgb, ctx.color.a),
})

describe('Flatland shadow pipeline wire-up', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('does not instantiate SDFGenerator / OcclusionPass for a non-shadow effect', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const flatland = new Flatland()
    flatland.setLighting(new LitNoShadows())

    const fp = flatland as unknown as {
      _sdfGenerator: object | null
      _occlusionPass: object | null
    }
    expect(fp._sdfGenerator).toBeNull()
    expect(fp._occlusionPass).toBeNull()
  })

  it('instantiates SDFGenerator and OcclusionPass for a needsShadows effect', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const flatland = new Flatland()
    flatland.setLighting(new LitWithShadows())

    const fp = flatland as unknown as {
      _sdfGenerator: object | null
      _occlusionPass: object | null
    }
    expect(fp._sdfGenerator).not.toBeNull()
    expect(fp._occlusionPass).not.toBeNull()
  })

  it('tears down the shadow pipeline when switching to a non-shadow effect', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const flatland = new Flatland()
    flatland.setLighting(new LitWithShadows())

    const fp = flatland as unknown as {
      _sdfGenerator: object | null
      _occlusionPass: object | null
      _shadowInitialized: boolean
    }
    expect(fp._sdfGenerator).not.toBeNull()

    flatland.setLighting(new LitNoShadows())
    expect(fp._sdfGenerator).toBeNull()
    expect(fp._occlusionPass).toBeNull()
    expect(fp._shadowInitialized).toBe(false)
  })

  it('does not tear down when swapping between two needsShadows effects', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const flatland = new Flatland()
    flatland.setLighting(new LitWithShadows())

    const fp = flatland as unknown as {
      _sdfGenerator: object | null
      _occlusionPass: object | null
    }
    const sdf1 = fp._sdfGenerator
    const occ1 = fp._occlusionPass

    flatland.setLighting(new LitWithShadows())

    // Instances reused — no churn of GPU resources across effect swaps.
    expect(fp._sdfGenerator).toBe(sdf1)
    expect(fp._occlusionPass).toBe(occ1)
  })

  it('dispose() releases shadow pipeline resources', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const flatland = new Flatland()
    flatland.setLighting(new LitWithShadows())

    const fp = flatland as unknown as {
      _sdfGenerator: object | null
      _occlusionPass: object | null
    }
    expect(fp._sdfGenerator).not.toBeNull()

    flatland.dispose()

    expect(fp._sdfGenerator).toBeNull()
    expect(fp._occlusionPass).toBeNull()
  })
})
