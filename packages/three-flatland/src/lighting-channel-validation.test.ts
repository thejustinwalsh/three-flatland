import { describe, it, expect, vi, afterEach } from 'vitest'
import { Flatland } from './Flatland'
import { Sprite2D } from './sprites/Sprite2D'
import { createLightEffect } from './lights/LightEffect'
import { createMaterialEffect } from './materials/MaterialEffect'
import { vec3, vec4 } from 'three/tsl'

// Minimal lit effect that declares a channel dependency.
const LitRequiringNormal = createLightEffect({
  name: 'litRequiringNormal',
  schema: {} as const,
  requires: ['normal'] as const,
  light: () => (ctx) => vec4(ctx.color.rgb, ctx.color.a),
})

// Provider that supplies the 'normal' channel.
const FakeNormalProvider = createMaterialEffect({
  name: 'fakeNormal',
  schema: {} as const,
  provides: ['normal'] as const,
  channelNode: () => vec3(0, 0, 1),
})

describe('Flatland — channel provider validation (dev-only)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('warns when a lit sprite is added and lighting requires a channel not provided', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const flatland = new Flatland()
    flatland.setLighting(new LitRequiringNormal())

    const sprite = new Sprite2D()
    sprite.name = 'test-sprite'
    flatland.add(sprite)
    // Validation is deferred to the next render() so R3F's child
    // MaterialEffect attaches have time to land. In a headless test, drain
    // the queue manually.
    flatland._flushPendingChannelValidation()

    const messages = warn.mock.calls.map((c) => String(c[0]))
    expect(messages.some((m) => m.includes('test-sprite'))).toBe(true)
    expect(messages.some((m) => m.includes('normal'))).toBe(true)
  })

  it('does NOT warn when the sprite has a provider for the required channel', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const flatland = new Flatland()
    flatland.setLighting(new LitRequiringNormal())

    const sprite = new Sprite2D()
    sprite.name = 'ok-sprite'
    sprite.addEffect(new FakeNormalProvider())
    flatland.add(sprite)

    const offending = warn.mock.calls
      .map((c) => String(c[0]))
      .filter((m) => m.includes('ok-sprite'))
    expect(offending).toEqual([])
  })

  it('does NOT warn when the sprite opts out of lighting', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const flatland = new Flatland()
    flatland.setLighting(new LitRequiringNormal())

    const sprite = new Sprite2D()
    sprite.name = 'unlit-sprite'
    sprite.lit = false
    flatland.add(sprite)

    const offending = warn.mock.calls
      .map((c) => String(c[0]))
      .filter((m) => m.includes('unlit-sprite'))
    expect(offending).toEqual([])
  })

  it('dedupes warnings — one per sprite', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const flatland = new Flatland()

    const a = new Sprite2D()
    a.name = 'a'
    flatland.add(a)

    // setLighting triggers a full walk — warns once for `a`.
    flatland.setLighting(new LitRequiringNormal())

    // Removing and re-adding must not double-warn.
    flatland.remove(a)
    flatland.add(a)

    const forA = warn.mock.calls
      .map((c) => String(c[0]))
      .filter((m) => m.includes('"a"'))
    expect(forA.length).toBe(1)
  })

  it('validates sprites that existed before setLighting was called', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const flatland = new Flatland()

    const s = new Sprite2D()
    s.name = 'early'
    flatland.add(s)
    // No warning yet — no lighting attached.
    expect(warn.mock.calls.length).toBe(0)

    flatland.setLighting(new LitRequiringNormal())
    const messages = warn.mock.calls.map((c) => String(c[0]))
    expect(messages.some((m) => m.includes('early'))).toBe(true)
  })
})
