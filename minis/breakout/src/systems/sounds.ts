import type { ZzFXParams, PlaySoundFn } from '../types'

// Sound presets as ZzFX parameter arrays

// Paddle hit - satisfying pop
export const PADDLE_HIT: ZzFXParams = [0.5, 0, 300, 0, 0.02, 0.05, 1]

// Wall bounce - soft thud
export const WALL_HIT: ZzFXParams = [0.3, 0.05, 200, 0, 0.015, 0.03, 3]

// Block break - bright chime
export const BLOCK_BREAK: ZzFXParams = [0.5, 0, 800, 0, 0.02, 0.08, 0]

// Ball launch - quick chirp
export const BALL_LAUNCH: ZzFXParams = [0.4, 0, 400, 0, 0.03, 0.06, 0, 1, 100]

// Game over - descending tone
export const GAME_OVER: ZzFXParams = [0.5, 0, 400, 0, 0.15, 0.25, 0, 1, -150, 0, -80, 0.08]

// Level clear - triumphant
export const LEVEL_CLEAR: ZzFXParams = [0.6, 0, 300, 0, 0.1, 0.2, 0, 1, 80, 0, 300, 0.05]

// Miss - quick low thud
export const MISS: ZzFXParams = [0.4, 0.1, 100, 0, 0.03, 0.08, 4]

// Game start - ascending
export const GAME_START: ZzFXParams = [0.5, 0, 250, 0, 0.05, 0.1, 0, 1, 150]

// Countdown tick - soft, short sine pip
export const COUNTDOWN_TICK: ZzFXParams = [0.15, 0, 500, 0, 0.015, 0.03, 0]

/**
 * Create a sound player bound to a zzfx function
 */
export function createSoundPlayer(zzfx: PlaySoundFn) {
  const lastSoundTimes = new Map<string, number>()
  const MIN_INTERVAL = 30 // ms debounce

  const play = (name: string, params: ZzFXParams) => {
    const now = Date.now()
    if (now - (lastSoundTimes.get(name) ?? 0) < MIN_INTERVAL) return
    lastSoundTimes.set(name, now)
    zzfx(...params)
  }

  return {
    paddleHit: () => play('paddleHit', PADDLE_HIT),
    wallHit: () => play('wallHit', WALL_HIT),
    blockBreak: () => play('blockBreak', BLOCK_BREAK),
    ballLaunch: () => play('ballLaunch', BALL_LAUNCH),
    gameOver: () => play('gameOver', GAME_OVER),
    levelClear: () => play('levelClear', LEVEL_CLEAR),
    miss: () => play('miss', MISS),
    gameStart: () => play('gameStart', GAME_START),
    countdownTick: () => play('countdownTick', COUNTDOWN_TICK),
  }
}

export type SoundPlayer = ReturnType<typeof createSoundPlayer>
