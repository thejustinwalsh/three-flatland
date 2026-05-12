/**
 * createZzfxProxy — factory that returns a ZzFX-compatible play function
 * for mini-game consumers. Routes their `zzfx(...)` calls through the
 * docs-side bridge so the master mute applies, the SFX bus mixes with
 * docs UI sounds, and no duplicate AudioContext is created.
 *
 * Called from the docs side (HeroGame.tsx / ShowcaseGame.tsx) and passed
 * as a prop into `MiniBreakout` / future minis. When the mini runs
 * standalone (no docs host), it imports `zzfx` directly — see
 * `minis/breakout/src/App.tsx`.
 */

import { getBridge, getBridgeSync } from './bridge'
import type { PlaySoundFn, ZzFxParams } from './types'

export function createZzfxProxy(): PlaySoundFn {
    return (...params: ZzFxParams) => {
        // Hot path: if the bridge is already loaded, play synchronously.
        // This is the common case for any sound played after first
        // user interaction (audio unlock).
        const sync = getBridgeSync()
        if (sync) {
            sync.playSfx(params)
            return
        }
        // Cold path: trigger the lazy import; first call also unlocks
        // the AudioContext on the user's gesture. If we miss the first
        // gesture by a couple ms, the play call is dropped on the floor
        // (no audio context yet) — acceptable for game SFX which fire
        // continuously, not the first audio event of a session.
        getBridge()
            .then((b) => b.playSfx(params))
            .catch(() => {})
    }
}
