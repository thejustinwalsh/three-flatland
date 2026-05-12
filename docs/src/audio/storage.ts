/**
 * Audio storage — all localStorage interaction for the audio system
 * lives here so the bridge can stay focused on AudioContext lifecycle.
 *
 * Keys:
 *   flatland-sound-volume  — master volume level (0|1|2|3)
 *   flatland-music-volume  — music-bus slider value (0..1 float)
 *   flatland-music-user-stopped — boolean, set when user explicitly pauses
 *                                  music. Suppresses auto-start on
 *                                  subsequent SoundToggle unmutes.
 *   flatland-music-track   — current track index (integer)
 *
 * Legacy key migration: `flatland-sound-enabled` (boolean, pre-v2)
 * maps to volume level 2 (medium) when true, 0 (mute) when false.
 */

export type VolumeLevel = 0 | 1 | 2 | 3

/** Master volume scaling — applied to BOTH SFX and music bus master gain. */
export const VOLUME_LEVELS: Record<VolumeLevel, number> = {
    0: 0, // mute
    1: 0.3, // low (30% master)
    2: 0.6, // medium
    3: 1.0, // high (full)
}

const KEY_VOLUME = 'flatland-sound-volume'
const KEY_VOLUME_LEGACY = 'flatland-sound-enabled'
const KEY_MUSIC_VOLUME = 'flatland-music-volume'
const KEY_MUSIC_USER_STOPPED = 'flatland-music-user-stopped'
const KEY_MUSIC_TRACK = 'flatland-music-track'

/** Default music-bus level when first enabled (BG ambient, ~30% of music
 * gain pre-master). User can override via the music popover volume slider. */
export const DEFAULT_MUSIC_VOLUME = 0.3

export function loadVolumeLevel(): VolumeLevel {
    if (typeof localStorage === 'undefined') return 0
    const stored = localStorage.getItem(KEY_VOLUME)
    if (stored !== null) {
        const n = parseInt(stored, 10)
        if (n >= 0 && n <= 3) return n as VolumeLevel
    }
    const legacy = localStorage.getItem(KEY_VOLUME_LEGACY)
    if (legacy === 'true') {
        localStorage.removeItem(KEY_VOLUME_LEGACY)
        return 2
    }
    if (legacy === 'false') {
        localStorage.removeItem(KEY_VOLUME_LEGACY)
        return 0
    }
    return 0
}

export function saveVolumeLevel(level: VolumeLevel): void {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(KEY_VOLUME, String(level))
}

export function hasVolumePreference(): boolean {
    if (typeof localStorage === 'undefined') return false
    return localStorage.getItem(KEY_VOLUME) !== null || localStorage.getItem(KEY_VOLUME_LEGACY) !== null
}

export function loadMusicVolume(): number {
    if (typeof localStorage === 'undefined') return DEFAULT_MUSIC_VOLUME
    const stored = localStorage.getItem(KEY_MUSIC_VOLUME)
    if (stored === null) return DEFAULT_MUSIC_VOLUME
    const n = parseFloat(stored)
    if (Number.isFinite(n) && n >= 0 && n <= 1) return n
    return DEFAULT_MUSIC_VOLUME
}

export function saveMusicVolume(v: number): void {
    if (typeof localStorage === 'undefined') return
    const clamped = Math.max(0, Math.min(1, v))
    localStorage.setItem(KEY_MUSIC_VOLUME, String(clamped))
}

export function loadMusicUserStopped(): boolean {
    if (typeof localStorage === 'undefined') return false
    return localStorage.getItem(KEY_MUSIC_USER_STOPPED) === 'true'
}

export function saveMusicUserStopped(stopped: boolean): void {
    if (typeof localStorage === 'undefined') return
    if (stopped) localStorage.setItem(KEY_MUSIC_USER_STOPPED, 'true')
    else localStorage.removeItem(KEY_MUSIC_USER_STOPPED)
}

export function loadMusicTrackIndex(): number {
    if (typeof localStorage === 'undefined') return 0
    const stored = localStorage.getItem(KEY_MUSIC_TRACK)
    if (stored === null) return 0
    const n = parseInt(stored, 10)
    return Number.isFinite(n) && n >= 0 ? n : 0
}

export function saveMusicTrackIndex(index: number): void {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(KEY_MUSIC_TRACK, String(Math.max(0, Math.floor(index))))
}
