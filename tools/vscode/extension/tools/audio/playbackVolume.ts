// Extension-side read of the `threeFlatland.audio.playbackVolume` trim —
// thin vscode-config glue over the SHARED dB→multiplier mapping in
// webview/audio/volumeTrim.ts (same webview-module import precedent as
// lm/core.ts's params.ts import). Both play paths — the inline sidecar
// (register.ts → audio-play's `volume` command field) and the tuner
// webview's gain (host.ts init payload + zzfx/config push) — resolve
// through this one function, so they cannot drift apart; the stakeholder
// matched them by ear.
import * as vscode from 'vscode'
import { trimToMultiplier } from '../../../webview/audio/volumeTrim'

export const PLAYBACK_VOLUME_SETTING = 'threeFlatland.audio.playbackVolume'

/** The current trim as a linear gain multiplier — 1.0 at the 0 dB default. */
export function getPlaybackVolumeMultiplier(): number {
  return trimToMultiplier(
    vscode.workspace.getConfiguration().get<number>(PLAYBACK_VOLUME_SETTING, 0)
  )
}
