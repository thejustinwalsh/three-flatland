import { toDenseArgs, type ZzfxParams } from './params'

// `zzfx` constructs its own `AudioContext` as a MODULE-LEVEL side effect
// (`export const ZZFX = { ..., audioContext: new AudioContext, ... }`).
// Browsers create an AudioContext "suspended" unless it's constructed
// synchronously inside a user-gesture handler — so we dynamic-import the
// package (deferring that construction) from inside the Play button's
// click handler, and explicitly resume() before playing. Both parts are
// required: importing eagerly at module scope would construct the context
// on panel load rather than on gesture; resuming is still needed even
// when the import itself happens inside the gesture, because some
// browsers don't auto-resume a context created moments earlier in the
// same tick.
let modulePromise: Promise<typeof import('zzfx')> | null = null

function loadZzfx() {
  if (!modulePromise) modulePromise = import('zzfx')
  return modulePromise
}

/**
 * Plays `params` through zzfx. Must be called from inside (or shortly
 * after) a user gesture — see the module doc comment above.
 */
export async function playParams(params: ZzfxParams): Promise<void> {
  const { zzfx, ZZFX } = await loadZzfx()
  if (ZZFX.audioContext.state === 'suspended') {
    await ZZFX.audioContext.resume()
  }
  zzfx(...toDenseArgs(params))
}
