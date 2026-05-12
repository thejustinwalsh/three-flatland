/**
 * AudioBridge — the singleton that owns the AudioContext, the gain bus,
 * and the lazy-loaded zzfx + zzfxm imports. All audio in the docs site
 * routes through this module.
 *
 * Architecture:
 *
 *     AudioContext.destination
 *           ↑
 *      masterGain (SoundToggle 4-level)
 *           ├── sfxGain (no ducking — SFX is short)
 *           └── musicGain (jukebox slider, ducks when game plays music)
 *
 * Lazy load: `getBridge()` does NOT touch zzfx / zzfxm at module load.
 * First call dynamic-imports both and constructs the bridge. Subsequent
 * calls return the cached promise so the import is paid once per session.
 *
 * View-transition survival: the bridge lives on `window.__threeFlatlandAudio`
 * so re-mounted components (after `astro:after-swap`) reuse the same
 * AudioContext + gain nodes — music keeps playing across navigation.
 */

import type { ZzFxParams } from './types'
import {
    loadVolumeLevel,
    saveVolumeLevel,
    loadMusicVolume,
    saveMusicVolume,
    loadMusicUserStopped,
    saveMusicUserStopped,
    loadMusicTrackIndex,
    saveMusicTrackIndex,
    VOLUME_LEVELS,
    type VolumeLevel,
} from './storage'

export type Track = {
    id: string
    title: string
    credit?: string
    gem?: string
    bpm: number
    instruments: number[][]
    /** Pattern = Channel[]; Channel = [instrument, panning, ...notes]. */
    patterns: number[][][]
    sequence: number[]
}

export type TracksLibrary = {
    version: 1
    tracks: Track[]
}

export type AudioState = {
    masterLevel: VolumeLevel
    musicVolume: number
    musicPlaying: boolean
    musicTrackIndex: number
    musicUserStopped: boolean
    /** True when an external (mini-game) source has taken over the music
     * bus via `playExternalMusic()` — the jukebox controls disable
     * during this state. */
    musicDuckedExternal: boolean
    /** Current track displayed in the popover. When `musicDuckedExternal`,
     * this reflects the external source's track title; otherwise the
     * indexed library track. */
    currentTrack: Track | null
    /** The library of tracks available for the jukebox. Loaded async
     * from /audio/tracks.json on first bridge construction. */
    library: TracksLibrary | null
}

export type AudioStateListener = (state: AudioState) => void

const SINGLETON_KEY = '__threeFlatlandAudio'

declare global {
    interface Window {
        __threeFlatlandAudio?: AudioBridge
    }
}

class AudioBridge {
    readonly ctx: AudioContext
    readonly masterGain: GainNode
    readonly sfxGain: GainNode
    readonly musicGain: GainNode
    /** FFT analyser tapped off the music bus — visualizers (MusicPlayer
     * popover, future hero scopes) read frequency data each frame
     * via `getAnalyser()`. fftSize 128 → 64 bins → enough fidelity
     * for a small bar visualizer without burning CPU. */
    readonly musicAnalyser: AnalyserNode

    private zzfxModule: typeof import('zzfx') | null = null
    private zzfxmModule: typeof import('@zzfx-studio/zzfxm') | null = null

    private state: AudioState
    private listeners = new Set<AudioStateListener>()

    /** Active music source on our bus (jukebox playback). Null when paused
     * or when an external (game) source is driving the music bus. */
    private musicSource: AudioBufferSourceNode | null = null
    /** Position into the active track buffer at the moment of last pause —
     * used to resume from where we stopped instead of restarting. */
    private musicPosition = 0
    /** Stereo buffer for the active jukebox track. Built once on track
     * change so play/pause/restart don't re-synthesize. */
    private musicBuffer: AudioBuffer | null = null
    /** When the current source started, in `ctx.currentTime` seconds.
     * Used to compute `musicPosition` on pause. */
    private musicStartedAt = 0

    /** Pre-duck music volume so we can restore on unduck. */
    private preDuckMusicVolume = 0

    constructor(
        zzfx: typeof import('zzfx'),
        zzfxm: typeof import('@zzfx-studio/zzfxm'),
        library: TracksLibrary | null
    ) {
        this.zzfxModule = zzfx
        this.zzfxmModule = zzfxm

        this.ctx = new AudioContext()

        this.masterGain = this.ctx.createGain()
        this.sfxGain = this.ctx.createGain()
        this.musicGain = this.ctx.createGain()

        this.musicAnalyser = this.ctx.createAnalyser()
        this.musicAnalyser.fftSize = 128
        this.musicAnalyser.smoothingTimeConstant = 0.78

        this.sfxGain.connect(this.masterGain)
        // Music routes through the analyser before hitting master, so the
        // visualizer sees the raw music bus level (not affected by master
        // mute). Listeners get analyser data regardless of whether the
        // master is muted — the popover keeps animating during ducking,
        // just at the post-master volume.
        this.musicGain.connect(this.musicAnalyser)
        this.musicAnalyser.connect(this.masterGain)
        this.masterGain.connect(this.ctx.destination)

        const masterLevel = loadVolumeLevel()
        const musicVolume = loadMusicVolume()
        const trackIndex = loadMusicTrackIndex()
        const userStopped = loadMusicUserStopped()

        this.masterGain.gain.value = VOLUME_LEVELS[masterLevel]
        this.musicGain.gain.value = musicVolume
        this.sfxGain.gain.value = 1.0 // SFX bus = unit pre-master

        const trackList = library?.tracks ?? []
        const safeTrackIndex = Math.min(trackIndex, Math.max(0, trackList.length - 1))

        this.state = {
            masterLevel,
            musicVolume,
            musicPlaying: false,
            musicTrackIndex: safeTrackIndex,
            musicUserStopped: userStopped,
            musicDuckedExternal: false,
            currentTrack: trackList[safeTrackIndex] ?? null,
            library,
        }

        // NO construction-time autostart. Music is per-session: even with
        // `masterLevel > 0` persisted from a prior visit, music doesn't
        // start until the user explicitly clicks Play on this visit. The
        // tighter policy matches spec-compliant autoplay expectations and
        // avoids surprising returning users with audio they didn't ask
        // for in this session. `musicUserStopped` is now a per-session
        // hint (pause within a session, don't auto-resume on track
        // change); SoundToggle's `masterLevel` is the global mute gate
        // for all audio (SFX + music). When `masterLevel === 0`, NOTHING
        // plays — full mute — whether triggered from the popover, a
        // mini's first-interaction handler, or any SFX call.
    }

    // ────────── Subscriptions ──────────

    subscribe(listener: AudioStateListener): () => void {
        this.listeners.add(listener)
        listener(this.state)
        return () => {
            this.listeners.delete(listener)
        }
    }

    getState(): Readonly<AudioState> {
        return this.state
    }

    private emit(): void {
        for (const cb of this.listeners) cb(this.state)
    }

    // ────────── Master volume ──────────

    setMasterLevel(level: VolumeLevel): void {
        const prevLevel = this.state.masterLevel
        this.state.masterLevel = level
        saveVolumeLevel(level)
        // Snap the gain immediately so mute is felt within a frame.
        this.masterGain.gain.setTargetAtTime(VOLUME_LEVELS[level], this.ctx.currentTime, 0.01)
        // Auto-start music on first transition from mute → unmuted IF
        // the user hasn't explicitly stopped music before. This is the
        // "music defaults to autostart when audio is enabled" rule.
        const justUnmuted = prevLevel === 0 && level > 0
        if (justUnmuted && !this.state.musicUserStopped && !this.state.musicDuckedExternal) {
            const track = this.currentTrackOrFirst()
            if (track) this.playTrack(track, { fromUserGesture: true })
        }
        // Mute also pauses music to free the source — and frees the
        // BufferSource lock that prevents another playback while one is
        // active. Restore position on next unmute.
        if (level === 0 && this.state.musicPlaying) {
            this.pauseMusicInternal()
        }
        this.emit()
    }

    cycleMasterLevel(): VolumeLevel {
        const next = ((this.state.masterLevel + 1) % 4) as VolumeLevel
        this.setMasterLevel(next)
        return next
    }

    // ────────── SFX ──────────

    playSfx(params: ZzFxParams): void {
        if (this.state.masterLevel === 0) return
        if (!this.zzfxModule) return
        // Build samples from zzfx (pure DSP, no AudioContext touch) then
        // route through OUR context + sfxGain. This avoids leaking the
        // zzfx-internal AudioContext into the audible chain.
        const samples = this.zzfxModule.ZZFX.buildSamples(...params)
        const sampleArray =
            samples instanceof Float32Array ? samples : new Float32Array(samples as ArrayLike<number>)
        if (sampleArray.length === 0) return
        const buffer = this.ctx.createBuffer(1, sampleArray.length, this.ctx.sampleRate)
        buffer.getChannelData(0).set(sampleArray)
        const source = this.ctx.createBufferSource()
        source.buffer = buffer
        source.connect(this.sfxGain)
        source.start()
    }

    // ────────── Music ──────────

    private buildMusicBuffer(track: Track): AudioBuffer | null {
        if (!this.zzfxmModule) return null
        // Tracks ingested from zzfxm one-liners preserve elided params as
        // `null` (JSON has no notion of array holes). ZzFX's positional
        // defaults only trigger on `undefined`, so we coerce here. Numbers
        // pass through untouched.
        const denull = <T>(arr: T): T => {
            if (Array.isArray(arr)) {
                return arr.map((v) => (v === null ? undefined : Array.isArray(v) ? denull(v) : v)) as T
            }
            return arr
        }
        const instruments = denull(track.instruments) as unknown as number[][]
        const rawPatterns = denull(track.patterns) as unknown as number[][][]
        const sequence = denull(track.sequence) as unknown as number[]

        // Recover the canonical pattern row count from the GLOBAL max
        // channel length across the entire song. zzfx-studio's
        // `fmtChannel` serializer trims trailing zeros from each channel
        // independently, so when EVERY channel in a single pattern
        // happens to end with rests (e.g. a breakdown with only
        // sustained drone channels), the per-pattern max-channel-length
        // undercounts the true row count and that pattern plays slightly
        // shorter than intended — audible as a phase shift / ghost note
        // at the song loop boundary that compounds with each loop.
        //
        // The studio's generator hardcodes ROWS=32 (channel length 34),
        // and across an entire song at least one channel reaches the
        // canonical length because some non-zero note lands in the final
        // row somewhere. Using global-max as the canonical and padding
        // every pattern's channels to it recovers the row count for any
        // song where any channel anywhere in the song preserved its
        // trailing slot. The fix is additive — only zeros are introduced
        // — so it can never alter audible content.
        let canonicalLen = 0
        for (const pat of rawPatterns) {
            for (const ch of pat) {
                if (ch && ch.length > canonicalLen) canonicalLen = ch.length
            }
        }
        const patterns = rawPatterns.map((pat) =>
            pat.map((ch) => {
                const arr = ch ?? []
                if (arr.length >= canonicalLen) return arr
                const padded: number[] = new Array(canonicalLen)
                for (let i = 0; i < canonicalLen; i++) {
                    padded[i] = i < arr.length ? arr[i]! : 0
                }
                return padded
            })
        )

        const [left, right] = this.zzfxmModule.ZZFXM.build(instruments, patterns, sequence, track.bpm)
        if (!left || left.length === 0) return null
        const length = left.length
        const buffer = this.ctx.createBuffer(2, length, this.zzfxmModule.ZZFXM.sampleRate)
        buffer.getChannelData(0).set(left)
        buffer.getChannelData(1).set(right ?? left)
        return buffer
    }

    private currentTrackOrFirst(): Track | null {
        const tracks = this.state.library?.tracks
        if (!tracks || tracks.length === 0) return null
        return tracks[Math.min(this.state.musicTrackIndex, tracks.length - 1)] ?? tracks[0]
    }

    /** Set the active track. When master is unmuted, also starts the
     * source from the beginning. When master is muted but the call came
     * from a user gesture (next/prev click while muted), updates the
     * displayed track without starting audio — user is scrolling the
     * library. Resets `musicUserStopped` because any explicit "play this"
     * intent wipes the prior "I don't want music" preference. */
    playTrack(track: Track, opts: { fromUserGesture?: boolean } = {}): void {
        if (this.state.musicDuckedExternal) return // ignore while game owns the bus
        const muted = this.state.masterLevel === 0
        // Non-gesture call (autostart, programmatic queue) while muted:
        // don't even update state — that would alter the user's apparent
        // queue position without their action.
        if (muted && !opts.fromUserGesture) return
        // Reset user-stopped on explicit play.
        if (this.state.musicUserStopped) {
            this.state.musicUserStopped = false
            saveMusicUserStopped(false)
        }
        // State updates fire regardless of mute — the popover needs to
        // reflect the new track so the user can see what's queued.
        const sameTrack = this.state.currentTrack?.id === track.id && this.musicBuffer !== null
        if (!sameTrack) {
            this.state.currentTrack = track
            const idx = this.state.library?.tracks.findIndex((t) => t.id === track.id) ?? -1
            if (idx >= 0) {
                this.state.musicTrackIndex = idx
                saveMusicTrackIndex(idx)
            }
        }
        if (muted) {
            // Skipping while muted — kill any leftover source from a
            // pre-mute state, drop the stale buffer so the next unmute
            // rebuilds from the now-current track, and emit so the
            // popover updates the title/avatar/gem.
            this.stopMusicSource()
            this.musicBuffer = null
            this.state.musicPlaying = false
            this.musicPosition = 0
            this.emit()
            return
        }
        // Unmuted path — full play.
        if (!sameTrack) {
            this.musicBuffer = this.buildMusicBuffer(track)
        }
        this.startMusicSource(0)
        this.emit()
    }

    pauseMusic(): void {
        // User-initiated pause sets the "remember I stopped" flag so
        // subsequent unmutes don't auto-start music again.
        if (this.state.musicPlaying) {
            this.pauseMusicInternal()
            this.state.musicUserStopped = true
            saveMusicUserStopped(true)
            this.emit()
        }
    }

    resumeMusic(): void {
        if (this.state.musicPlaying) return
        if (this.state.musicDuckedExternal) return
        // Mute is full mute — when masterLevel === 0, NOTHING plays. SFX,
        // music, mini audio, all silent. Callers are expected to unmute
        // before calling resumeMusic; this guard is defense in depth so
        // any direct bridge consumer can't bypass the global mute.
        if (this.state.masterLevel === 0) return
        if (!this.musicBuffer) {
            const track = this.currentTrackOrFirst()
            if (track) this.musicBuffer = this.buildMusicBuffer(track)
        }
        if (!this.musicBuffer) return
        // Resume clears user-stopped (we're actively asking to play).
        if (this.state.musicUserStopped) {
            this.state.musicUserStopped = false
            saveMusicUserStopped(false)
        }
        this.startMusicSource(this.musicPosition)
        this.emit()
    }

    restartMusic(): void {
        if (this.state.musicDuckedExternal) return
        if (!this.state.currentTrack) return
        if (!this.musicBuffer) this.musicBuffer = this.buildMusicBuffer(this.state.currentTrack)
        if (!this.musicBuffer) return
        this.stopMusicSource()
        this.musicPosition = 0
        this.startMusicSource(0)
        this.emit()
    }

    nextTrack(): void {
        if (this.state.musicDuckedExternal) return
        const tracks = this.state.library?.tracks
        if (!tracks || tracks.length === 0) return
        const next = (this.state.musicTrackIndex + 1) % tracks.length
        this.state.musicTrackIndex = next
        saveMusicTrackIndex(next)
        this.advanceToTrack(tracks[next]!)
    }

    prevTrack(): void {
        if (this.state.musicDuckedExternal) return
        const tracks = this.state.library?.tracks
        if (!tracks || tracks.length === 0) return
        const prev = (this.state.musicTrackIndex - 1 + tracks.length) % tracks.length
        this.state.musicTrackIndex = prev
        saveMusicTrackIndex(prev)
        this.advanceToTrack(tracks[prev]!)
    }

    /** Honor current play state when moving between tracks. If music is
     * currently playing, start the new track. If paused / never started /
     * muted, just cue the new track for display — clicking skip changes
     * what's SELECTED, not the play state. The popover updates the title
     * + gem via the state emit, but no audio fires until the user
     * explicitly clicks Play. */
    private advanceToTrack(track: Track): void {
        if (this.state.musicPlaying) {
            this.playTrack(track, { fromUserGesture: true })
            return
        }
        // Cue the new track without playing. Stops any leftover source,
        // clears the cached buffer (which was for the old track), and
        // emits so the popover re-renders title/credit/gem/avatar.
        // Preserves `musicUserStopped` — the user's pause intent carries
        // over to the new track.
        this.stopMusicSource()
        this.musicBuffer = null
        this.musicPosition = 0
        this.state.currentTrack = track
        this.state.musicPlaying = false
        this.emit()
    }

    /** Live music position (seconds since track start, wrapping at the
     * loop boundary) + total duration in seconds. Used by the popover
     * progress bar + time display. Returns zeros when paused or no
     * buffer is loaded. */
    getMusicProgress(): { position: number; duration: number } {
        if (!this.musicBuffer) return { position: 0, duration: 0 }
        const duration = this.musicBuffer.duration
        if (this.state.musicPlaying) {
            const elapsed = this.ctx.currentTime - this.musicStartedAt
            return { position: elapsed % duration, duration }
        }
        return { position: this.musicPosition, duration }
    }

    setMusicVolume(v: number): void {
        const clamped = Math.max(0, Math.min(1, v))
        this.state.musicVolume = clamped
        saveMusicVolume(clamped)
        const target = this.state.musicDuckedExternal ? clamped * 0.1 : clamped
        this.musicGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.02)
        this.emit()
    }

    // External (game) music takeover — duck our music, store the title
    // for the popover, disable jukebox controls.
    duckForExternal(title: string): void {
        this.preDuckMusicVolume = this.state.musicVolume
        if (this.state.musicPlaying) {
            // Lower musicGain over 200ms.
            this.musicGain.gain.setTargetAtTime(this.state.musicVolume * 0.1, this.ctx.currentTime, 0.06)
        }
        this.state.musicDuckedExternal = true
        // Surface the external title via currentTrack — UI components key off
        // this so the popover title swaps to the game's track. The original
        // library track stays in `musicTrackIndex` so unduck restores it.
        this.state.currentTrack = {
            id: `__external:${title}`,
            title,
            credit: 'game',
            bpm: 0,
            instruments: [],
            patterns: [],
            sequence: [],
        }
        this.emit()
    }

    unduckFromExternal(): void {
        if (!this.state.musicDuckedExternal) return
        this.state.musicDuckedExternal = false
        const tracks = this.state.library?.tracks
        const restored = tracks?.[this.state.musicTrackIndex] ?? null
        this.state.currentTrack = restored
        // Ramp the music gain back over 400ms.
        this.musicGain.gain.setTargetAtTime(this.preDuckMusicVolume, this.ctx.currentTime, 0.12)
        this.emit()
    }

    // ────────── Internal music source plumbing ──────────

    private startMusicSource(offset: number): void {
        if (!this.musicBuffer) return
        this.stopMusicSource()
        const source = this.ctx.createBufferSource()
        source.buffer = this.musicBuffer
        source.loop = true
        source.connect(this.musicGain)
        source.start(0, offset % this.musicBuffer.duration)
        this.musicSource = source
        this.musicStartedAt = this.ctx.currentTime - offset
        this.state.musicPlaying = true
    }

    private pauseMusicInternal(): void {
        if (!this.musicSource || !this.musicBuffer) return
        const elapsed = this.ctx.currentTime - this.musicStartedAt
        this.musicPosition = elapsed % this.musicBuffer.duration
        this.stopMusicSource()
        this.state.musicPlaying = false
    }

    private stopMusicSource(): void {
        if (this.musicSource) {
            try {
                this.musicSource.stop()
            } catch {}
            this.musicSource.disconnect()
            this.musicSource = null
        }
    }
}

// ────────── Lazy loader ──────────

let bridgePromise: Promise<AudioBridge> | undefined

/** Get (and on first call, create) the audio bridge. Dynamically imports
 * zzfx + @zzfx-studio/zzfxm + fetches the tracks library. None of those
 * touch the network or AudioContext until this promise is first awaited. */
export function getBridge(): Promise<AudioBridge> {
    if (typeof window === 'undefined') {
        return Promise.reject(new Error('audio-bridge: not available in SSR'))
    }
    if (window[SINGLETON_KEY]) return Promise.resolve(window[SINGLETON_KEY]!)
    if (!bridgePromise) {
        bridgePromise = (async () => {
            const [zzfxMod, zzfxmMod, tracksRes] = await Promise.all([
                import('zzfx'),
                import('@zzfx-studio/zzfxm'),
                fetch(import.meta.env.BASE_URL + 'audio/tracks.json').catch(() => null),
            ])
            let library: TracksLibrary | null = null
            if (tracksRes && tracksRes.ok) {
                try {
                    library = (await tracksRes.json()) as TracksLibrary
                } catch {
                    library = null
                }
            }
            const bridge = new AudioBridge(zzfxMod, zzfxmMod, library)
            window[SINGLETON_KEY] = bridge
            return bridge
        })()
    }
    return bridgePromise
}

/** True if the bridge is ready in-memory. Synchronous; useful for guards
 * that should be no-ops when nothing has loaded yet. */
export function hasBridge(): boolean {
    return typeof window !== 'undefined' && !!window[SINGLETON_KEY]
}

/** Synchronously read the bridge if it's loaded. Returns undefined when
 * not yet initialized — callers should fall back to `getBridge()`. */
export function getBridgeSync(): AudioBridge | undefined {
    return typeof window !== 'undefined' ? window[SINGLETON_KEY] : undefined
}

export type { AudioBridge }

/* HMR — explicitly accept module updates so Vite doesn't full-reload
 * the page when this file or its imports change. The bridge is parked
 * on `window.__threeFlatlandAudio` which survives across module
 * re-execution; the new module-level `bridgePromise` defers to the
 * existing singleton on first `getBridge()` call after the update
 * (line 445 of this file). Net effect: music keeps playing through
 * dev iterations. */
if (import.meta.hot) {
    import.meta.hot.accept()
}
