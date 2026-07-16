/** Ambient declarations for KilledByAPixel/ZzFX v1.3.2. */
declare module 'zzfx' {
  type ZzFxParams = (number | undefined)[]

  export function zzfx(...params: ZzFxParams): AudioBufferSourceNode

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
