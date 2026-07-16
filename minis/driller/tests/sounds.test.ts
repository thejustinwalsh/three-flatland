import { createWorld } from 'koota'
import { describe, expect, it, vi } from 'vitest'
import type { ZzFXParams } from '../src/types'
import {
  bindSoundPlayer,
  createSoundPlayer,
  playSound,
  SFX,
  type SfxName,
} from '../src/systems/sounds'

describe('ZzFX sound routing', () => {
  it('keeps every studio preset in the native 21-parameter format', () => {
    for (const params of Object.values(SFX)) expect(params).toHaveLength(21)
  })

  it('routes sounds only to the player bound to that world', () => {
    const firstWorld = createWorld()
    const secondWorld = createWorld()
    const firstPlay = vi.fn<(name: SfxName) => void>()
    const secondPlay = vi.fn<(name: SfxName) => void>()
    const unbind = bindSoundPlayer(firstWorld, { play: firstPlay })
    bindSoundPlayer(secondWorld, { play: secondPlay })

    playSound(firstWorld, 'drill')
    expect(firstPlay).toHaveBeenCalledWith('drill')
    expect(secondPlay).not.toHaveBeenCalled()

    unbind()
    playSound(firstWorld, 'blockLand')
    expect(firstPlay).toHaveBeenCalledTimes(1)
  })

  it('debounces noisy collapse cues without suppressing later impacts', () => {
    let time = 100
    const zzfx = vi.fn<(...params: ZzFXParams) => void>()
    const player = createSoundPlayer(zzfx, () => time)

    player.play('blockLand')
    time += 40
    player.play('blockLand')
    expect(zzfx).toHaveBeenCalledTimes(1)

    time += 100
    player.play('blockLand')
    expect(zzfx).toHaveBeenCalledTimes(2)
    expect(zzfx.mock.calls[0]).toEqual([...SFX.blockLand])
  })

  it('treats locked or failed browser audio as non-fatal', () => {
    const player = createSoundPlayer(() => {
      throw new Error('AudioContext is locked')
    })

    expect(() => player.play('respawn')).not.toThrow()
  })
})
