/**
 * Ambient type declarations for the `zzfx` npm package — `KilledByAPixel/
 * ZzFX` v1.3.2 ships without `.d.ts` files. Mirrors the runtime exports
 * from `node_modules/zzfx/ZzFX.js` (`export function zzfx`, `export const
 * ZZFX`, `export class ZZFXSound`). Copied from `tools/vscode/webview/
 * zzfx/zzfx.d.ts` — keep in sync if the pinned zzfx version changes.
 */
declare module 'zzfx' {
  type ZzFxParams = (number | undefined)[]

  /** Play a ZzFX sound via the package's internal AudioContext. */
  export function zzfx(...params: ZzFxParams): AudioBufferSourceNode

  /** Lower-level namespace — exposes the shared AudioContext + volume so
   * callers can resume it inside a user-gesture handler before playing. */
  export const ZZFX: {
    volume: number
    sampleRate: number
    audioContext: AudioContext
    play(...params: ZzFxParams): AudioBufferSourceNode
    playSamples(
      sampleChannels: number[][] | Float32Array[],
      volumeScale?: number,
      rate?: number,
      pan?: number,
      loop?: boolean
    ): AudioBufferSourceNode
    buildSamples(...params: ZzFxParams): Float32Array
  }

  export class ZZFXSound {
    constructor(...params: ZzFxParams)
  }
}
