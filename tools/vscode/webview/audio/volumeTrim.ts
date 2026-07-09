// The ONE mapping from the `threeFlatland.audio.playbackVolume` setting
// (a dB trim relative to today's baseline loudness) to the linear gain
// multiplier both play paths apply. Shared by the extension host (inline
// sidecar route — register.ts / audio-play's `volume` command field) and
// the tuner webview (audio.ts's ZZFX.volume scaling) — one function, so
// the two paths can't drift apart; the stakeholder tuned them by ear.
//
// 0 dB = multiplier 1.0 = exactly today's loudness (the stakeholder's
// "default to whatever you have now and treat it as baseline"). ±12 dB
// (≈ ×4 / ×0.25) is a preview-volume trim's useful range — enough to
// dial a harsh zap down or a quiet blip up without becoming a mixer.

export const PLAYBACK_TRIM_MIN_DB = -12
export const PLAYBACK_TRIM_MAX_DB = 12
export const DEFAULT_PLAYBACK_TRIM_DB = 0

/**
 * dB trim → linear amplitude multiplier (`10^(dB/20)`). Out-of-range
 * values clamp to ±12; anything non-numeric (a hand-edited settings.json
 * can hold garbage) falls back to the 0 dB baseline rather than throwing
 * or going silent.
 */
export function trimToMultiplier(db: unknown): number {
  const n = typeof db === 'number' && Number.isFinite(db) ? db : DEFAULT_PLAYBACK_TRIM_DB
  const clamped = Math.min(PLAYBACK_TRIM_MAX_DB, Math.max(PLAYBACK_TRIM_MIN_DB, n))
  return 10 ** (clamped / 20)
}
