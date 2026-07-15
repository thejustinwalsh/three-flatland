// Shared config keys for the audio tool — pulled out of register.ts so
// provider.ts can read them without an import cycle (register.ts already
// imports from provider.ts to construct the CodeLens provider).
export const INLINE_PLAYBACK_SETTING = 'threeFlatland.audio.inlinePlayback.enabled'
