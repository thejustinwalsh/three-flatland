/**
 * Ambient type declarations for the `zzfx` npm package — `KilledByAPixel/
 * ZzFX` v1.3.2 ships without `.d.ts` files. Mirrors the runtime exports
 * from `node_modules/zzfx/ZzFX.js` (`export function zzfx`, `export const
 * ZZFX`, `export class ZZFXSound`).
 *
 * The 21-param `ZzFxParams` shape lives in `./types.ts`; this file only
 * declares the package's external surface so TypeScript stops warning
 * about implicit-any imports.
 */
declare module 'zzfx' {
    type ZzFxParams = (number | undefined)[]

    /** Play a ZzFX sound via the package's internal AudioContext. */
    export function zzfx(...params: ZzFxParams): AudioBufferSourceNode

    /** Lower-level namespace — provides `buildSamples` (pure DSP, no
     * AudioContext touch) which the bridge uses to route playback
     * through its own gain bus. */
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
