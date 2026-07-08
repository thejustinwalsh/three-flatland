import { describe, expect, it, vi } from 'vitest'
import { createCommandHandler, type AudioBackend } from './commandHandler.js'
import type { PlaybackStats, PlayToneSynthCommand, PlayWadSynthCommand, Song } from './protocol.js'

const SONG: Song = {
  instruments: [[1, 0, 220]],
  patterns: [[[0, 0, 12, 12]]],
  sequence: [0],
  bpm: 120,
}

const SILENT_STATS: PlaybackStats = {
  peak: 0,
  silent: true,
  playing: false,
  durationSeconds: 0,
  elapsedSeconds: 0,
}

function fakeBackend(stats: PlaybackStats = SILENT_STATS): AudioBackend & {
  playCalls: { params: number[]; volume: number }[]
  playSongCalls: { song: Song; volume: number }[]
  songHandles: { stop: ReturnType<typeof vi.fn> }[]
  playFileCalls: { path: string; volume: number }[]
  fileHandles: { stop: ReturnType<typeof vi.fn> }[]
  /** Fires the pending `onStarted` for the i-th playFile call with a
   * fresh handle — the test's stand-in for "the async decode finished
   * and the source started" (#46), controllable so ordering races
   * against later commands can be exercised deterministically. */
  startFile: (index: number) => { stop: ReturnType<typeof vi.fn> }
  /** Populated asynchronously (after `handleCommand` has already
   * returned) when `playFile` is called with the `'FAIL_ASYNC'` sentinel
   * path — stands in for the real sidecar.ts backend's `send({ok:false,
   * cmd:'playFile', ...})` call on a decode failure, which this fake
   * can't reach directly (it has no `send`), but must still prove is
   * reachable and never swallowed. */
  asyncPlayFileErrors: string[]
  playToneSynthCalls: { cmd: Omit<PlayToneSynthCommand, 'cmd'>; volume: number }[]
  toneSynthHandles: { stop: ReturnType<typeof vi.fn> }[]
  playWadSynthCalls: { config: PlayWadSynthCommand['config']; volume: number }[]
  wadSynthHandles: { stop: ReturnType<typeof vi.fn> }[]
} {
  const playCalls: { params: number[]; volume: number }[] = []
  const playSongCalls: { song: Song; volume: number }[] = []
  const songHandles: { stop: ReturnType<typeof vi.fn> }[] = []
  const playFileCalls: { path: string; volume: number }[] = []
  const fileHandles: { stop: ReturnType<typeof vi.fn> }[] = []
  const playFileStarts: ((handle: { stop(): void }) => void)[] = []
  const asyncPlayFileErrors: string[] = []
  const playToneSynthCalls: { cmd: Omit<PlayToneSynthCommand, 'cmd'>; volume: number }[] = []
  const toneSynthHandles: { stop: ReturnType<typeof vi.fn> }[] = []
  const playWadSynthCalls: { config: PlayWadSynthCommand['config']; volume: number }[] = []
  const wadSynthHandles: { stop: ReturnType<typeof vi.fn> }[] = []
  return {
    playCalls,
    playSongCalls,
    songHandles,
    playFileCalls,
    fileHandles,
    startFile: (index) => {
      const handle = { stop: vi.fn() }
      fileHandles.push(handle)
      playFileStarts[index]!(handle)
      return handle
    },
    asyncPlayFileErrors,
    playToneSynthCalls,
    toneSynthHandles,
    playWadSynthCalls,
    wadSynthHandles,
    play: (params, volume) => {
      playCalls.push({ params, volume })
    },
    playSong: (song, volume) => {
      playSongCalls.push({ song, volume })
      const handle = { stop: vi.fn() }
      songHandles.push(handle)
      return handle
    },
    playFile: (path, volume, onStarted) => {
      playFileCalls.push({ path, volume })
      playFileStarts.push(onStarted)
      if (path === 'FAIL_ASYNC') {
        // Real decode failures land after handleCommand has already
        // returned its synchronous "accepted" ack — simulate that here
        // with a microtask rather than resolving inline.
        queueMicrotask(() => asyncPlayFileErrors.push('decode failed: bad header'))
      }
    },
    playToneSynth: (cmd, volume) => {
      playToneSynthCalls.push({ cmd, volume })
      const handle = { stop: vi.fn() }
      toneSynthHandles.push(handle)
      return handle
    },
    playWadSynth: (config, volume) => {
      playWadSynthCalls.push({ config, volume })
      const handle = { stop: vi.fn() }
      wadSynthHandles.push(handle)
      return handle
    },
    getStats: () => stats,
  }
}

describe('createCommandHandler', () => {
  it('play forwards params to the backend, defaulting the volume multiplier to 1, and acks', () => {
    const backend = fakeBackend()
    const handler = createCommandHandler(backend)
    const response = handler.handleCommand({ cmd: 'play', params: [1, 0, 440] })
    expect(response).toEqual({ ok: true, cmd: 'play' })
    expect(backend.playCalls).toEqual([{ params: [1, 0, 440], volume: 1 }])
  })

  it('play passes an explicit volume multiplier through unchanged — the user trim reaches the output gain', () => {
    const backend = fakeBackend()
    const handler = createCommandHandler(backend)
    handler.handleCommand({ cmd: 'play', params: [1, 0, 440], volume: 0.25 })
    expect(backend.playCalls).toEqual([{ params: [1, 0, 440], volume: 0.25 }])
  })

  it('playSong starts the song via the backend (volume defaulted to 1) and acks', () => {
    const backend = fakeBackend()
    const handler = createCommandHandler(backend)
    const response = handler.handleCommand({ cmd: 'playSong', song: SONG })
    expect(response).toEqual({ ok: true, cmd: 'playSong' })
    expect(backend.playSongCalls).toEqual([{ song: SONG, volume: 1 }])
    expect(backend.songHandles[0]!.stop).not.toHaveBeenCalled()
  })

  it('playSong passes an explicit volume multiplier through — both play paths carry the same trim', () => {
    const backend = fakeBackend()
    const handler = createCommandHandler(backend)
    handler.handleCommand({ cmd: 'playSong', song: SONG, volume: 2 })
    expect(backend.playSongCalls).toEqual([{ song: SONG, volume: 2 }])
  })

  it('a second playSong stops the first song before starting the new one — never stacks', () => {
    const backend = fakeBackend()
    const handler = createCommandHandler(backend)
    handler.handleCommand({ cmd: 'playSong', song: SONG })
    const firstHandle = backend.songHandles[0]!
    handler.handleCommand({ cmd: 'playSong', song: { ...SONG, bpm: 140 } })

    expect(firstHandle.stop).toHaveBeenCalledTimes(1)
    expect(backend.playSongCalls).toHaveLength(2)
    // The second handle is the one now "current" — proven below by stopSong
    // only stopping it once, not the (already-stopped) first handle again.
    expect(backend.songHandles[1]!.stop).not.toHaveBeenCalled()
  })

  it('stopSong stops the current song and clears it', () => {
    const backend = fakeBackend()
    const handler = createCommandHandler(backend)
    handler.handleCommand({ cmd: 'playSong', song: SONG })
    const response = handler.handleCommand({ cmd: 'stopSong' })
    expect(response).toEqual({ ok: true, cmd: 'stopSong' })
    expect(backend.songHandles[0]!.stop).toHaveBeenCalledTimes(1)
  })

  it('stopSong with no song playing is a no-op that still acks', () => {
    const backend = fakeBackend()
    const handler = createCommandHandler(backend)
    const response = handler.handleCommand({ cmd: 'stopSong' })
    expect(response).toEqual({ ok: true, cmd: 'stopSong' })
  })

  it('stopSong after a song already stopped does not double-stop the handle', () => {
    const backend = fakeBackend()
    const handler = createCommandHandler(backend)
    handler.handleCommand({ cmd: 'playSong', song: SONG })
    handler.handleCommand({ cmd: 'stopSong' })
    handler.handleCommand({ cmd: 'stopSong' })
    expect(backend.songHandles[0]!.stop).toHaveBeenCalledTimes(1)
  })

  it('stop stops the current song the same way stopSong does', () => {
    const backend = fakeBackend()
    const handler = createCommandHandler(backend)
    handler.handleCommand({ cmd: 'playSong', song: SONG })
    const response = handler.handleCommand({ cmd: 'stop' })
    expect(response).toEqual({ ok: true, cmd: 'stop' })
    expect(backend.songHandles[0]!.stop).toHaveBeenCalledTimes(1)
  })

  it('playFile forwards path/volume to the backend, defaulting volume to 1, and acks synchronously — it never blocks/awaits the decode', () => {
    const backend = fakeBackend()
    const handler = createCommandHandler(backend)
    const response = handler.handleCommand({ cmd: 'playFile', path: '/tmp/x.wav' })
    expect(response).toEqual({ ok: true, cmd: 'playFile' })
    expect(backend.playFileCalls).toEqual([{ path: '/tmp/x.wav', volume: 1 }])
  })

  it('playFile passes an explicit volume multiplier through unchanged', () => {
    const backend = fakeBackend()
    const handler = createCommandHandler(backend)
    handler.handleCommand({ cmd: 'playFile', path: '/tmp/x.wav', volume: 0.5 })
    expect(backend.playFileCalls).toEqual([{ path: '/tmp/x.wav', volume: 0.5 }])
  })

  it("an async decode failure surfaces through the backend's own async-error channel, not swallowed — and handleCommand already returned before it fires", async () => {
    const backend = fakeBackend()
    const handler = createCommandHandler(backend)
    const response = handler.handleCommand({ cmd: 'playFile', path: 'FAIL_ASYNC' })
    expect(response).toEqual({ ok: true, cmd: 'playFile' })
    // Nothing async has had a chance to run yet at this point — proves
    // handleCommand returned before the microtask playFile() queued
    // could flush.
    expect(backend.asyncPlayFileErrors).toEqual([])

    await vi.waitFor(() => expect(backend.asyncPlayFileErrors).toHaveLength(1))
    expect(backend.asyncPlayFileErrors[0]).toMatch(/decode failed/)
  })

  // #46 — files join the one-current-source lifecycle: a decoded file's
  // source registers as THE stoppable source (so the Play⇄Stop toggle's
  // stop actually stops it), every play route replaces the previous
  // source, and the async decode can't resurrect a superseded play.
  describe('playFile as the current stoppable source (#46)', () => {
    it("a decoded file's source registers as current — stopSong stops it", () => {
      const backend = fakeBackend()
      const handler = createCommandHandler(backend)
      handler.handleCommand({ cmd: 'playFile', path: '/tmp/x.wav' })
      const handle = backend.startFile(0)

      handler.handleCommand({ cmd: 'stopSong' })
      expect(handle.stop).toHaveBeenCalledTimes(1)
    })

    it('stop stops a playing file the same way stopSong does', () => {
      const backend = fakeBackend()
      const handler = createCommandHandler(backend)
      handler.handleCommand({ cmd: 'playFile', path: '/tmp/x.wav' })
      const handle = backend.startFile(0)

      handler.handleCommand({ cmd: 'stop' })
      expect(handle.stop).toHaveBeenCalledTimes(1)
    })

    it('playFile replaces the current song — one sound at a time, never stacked', () => {
      const backend = fakeBackend()
      const handler = createCommandHandler(backend)
      handler.handleCommand({ cmd: 'playSong', song: SONG })
      const songHandle = backend.songHandles[0]!

      handler.handleCommand({ cmd: 'playFile', path: '/tmp/x.wav' })
      expect(songHandle.stop).toHaveBeenCalledTimes(1)

      // The decoded file is now the current source, not the (stopped) song.
      const fileHandle = backend.startFile(0)
      handler.handleCommand({ cmd: 'stopSong' })
      expect(fileHandle.stop).toHaveBeenCalledTimes(1)
      expect(songHandle.stop).toHaveBeenCalledTimes(1)
    })

    it('playSong replaces a playing file', () => {
      const backend = fakeBackend()
      const handler = createCommandHandler(backend)
      handler.handleCommand({ cmd: 'playFile', path: '/tmp/x.wav' })
      const fileHandle = backend.startFile(0)

      handler.handleCommand({ cmd: 'playSong', song: SONG })
      expect(fileHandle.stop).toHaveBeenCalledTimes(1)
      expect(backend.songHandles[0]!.stop).not.toHaveBeenCalled()
    })

    it('a decode that lands AFTER a newer play stops its own late source and never clobbers the current one', () => {
      const backend = fakeBackend()
      const handler = createCommandHandler(backend)
      handler.handleCommand({ cmd: 'playFile', path: '/tmp/slow.wav' })
      handler.handleCommand({ cmd: 'playSong', song: SONG })

      // The slow decode finishes now — its source would layer over the
      // song if it started; the handler must stop it on arrival instead.
      const lateHandle = backend.startFile(0)
      expect(lateHandle.stop).toHaveBeenCalledTimes(1)

      // And the song is still the current source.
      handler.handleCommand({ cmd: 'stopSong' })
      expect(backend.songHandles[0]!.stop).toHaveBeenCalledTimes(1)
    })

    it('a decode that lands after an explicit stop is stopped on arrival too', () => {
      const backend = fakeBackend()
      const handler = createCommandHandler(backend)
      handler.handleCommand({ cmd: 'playFile', path: '/tmp/slow.wav' })
      handler.handleCommand({ cmd: 'stopSong' })

      const lateHandle = backend.startFile(0)
      expect(lateHandle.stop).toHaveBeenCalledTimes(1)
    })
  })

  // #47 — Tone.js/Wad synth findings join the same one-current-source
  // lifecycle as playSong/playFile: synchronous construction (mirrors
  // playSong exactly, neither backend call involves an async decode
  // step), replace-never-stack, stoppable via stopSong/stop.
  describe('playToneSynth', () => {
    it('forwards the command to the backend, defaulting volume to 1, and acks', () => {
      const backend = fakeBackend()
      const handler = createCommandHandler(backend)
      const response = handler.handleCommand({
        cmd: 'playToneSynth',
        synthType: 'Synth',
        note: 'C4',
        duration: '8n',
      })
      expect(response).toEqual({ ok: true, cmd: 'playToneSynth' })
      // The handler passes the whole command through (mirroring
      // playSong's case, per commandHandler.ts) rather than stripping
      // `cmd` — harmless since AudioBackend.playToneSynth's param type
      // only requires the payload fields, not exactly those fields.
      expect(backend.playToneSynthCalls).toEqual([
        {
          cmd: { cmd: 'playToneSynth', synthType: 'Synth', note: 'C4', duration: '8n' },
          volume: 1,
        },
      ])
    })

    it('passes an explicit volume multiplier through unchanged', () => {
      const backend = fakeBackend()
      const handler = createCommandHandler(backend)
      handler.handleCommand({
        cmd: 'playToneSynth',
        synthType: 'NoiseSynth',
        duration: 0.05,
        volume: 0.4,
      })
      expect(backend.playToneSynthCalls[0]!.volume).toBe(0.4)
    })

    it('a second playToneSynth stops the first — never stacks', () => {
      const backend = fakeBackend()
      const handler = createCommandHandler(backend)
      handler.handleCommand({
        cmd: 'playToneSynth',
        synthType: 'Synth',
        note: 'C4',
        duration: '8n',
      })
      const firstHandle = backend.toneSynthHandles[0]!
      handler.handleCommand({
        cmd: 'playToneSynth',
        synthType: 'Synth',
        note: 'E4',
        duration: '8n',
      })

      expect(firstHandle.stop).toHaveBeenCalledTimes(1)
      expect(backend.toneSynthHandles[1]!.stop).not.toHaveBeenCalled()
    })

    it('stopSong stops the current tone synth', () => {
      const backend = fakeBackend()
      const handler = createCommandHandler(backend)
      handler.handleCommand({
        cmd: 'playToneSynth',
        synthType: 'Synth',
        note: 'C4',
        duration: '8n',
      })
      const response = handler.handleCommand({ cmd: 'stopSong' })
      expect(response).toEqual({ ok: true, cmd: 'stopSong' })
      expect(backend.toneSynthHandles[0]!.stop).toHaveBeenCalledTimes(1)
    })

    it('a backend that throws produces a Nack, not an uncaught exception', () => {
      const handler = createCommandHandler({
        play: vi.fn(),
        playSong: () => ({ stop: vi.fn() }),
        playFile: vi.fn(),
        playToneSynth: () => {
          throw new Error("'PluckSynth' can't be a PolySynth voice")
        },
        playWadSynth: () => ({ stop: vi.fn() }),
        getStats: () => SILENT_STATS,
      })
      const response = handler.handleCommand({
        cmd: 'playToneSynth',
        synthType: 'PolySynth',
        voiceType: 'PluckSynth',
        note: ['C4'],
        duration: 1,
      })
      expect(response).toEqual({
        ok: false,
        cmd: 'playToneSynth',
        error: "'PluckSynth' can't be a PolySynth voice",
      })
    })
  })

  describe('playWadSynth', () => {
    it('forwards the config to the backend, defaulting volume to 1, and acks', () => {
      const backend = fakeBackend()
      const handler = createCommandHandler(backend)
      const response = handler.handleCommand({
        cmd: 'playWadSynth',
        config: { source: 'square' },
      })
      expect(response).toEqual({ ok: true, cmd: 'playWadSynth' })
      expect(backend.playWadSynthCalls).toEqual([{ config: { source: 'square' }, volume: 1 }])
    })

    it('passes an explicit volume multiplier through unchanged', () => {
      const backend = fakeBackend()
      const handler = createCommandHandler(backend)
      handler.handleCommand({ cmd: 'playWadSynth', config: { source: 'noise' }, volume: 0.7 })
      expect(backend.playWadSynthCalls[0]!.volume).toBe(0.7)
    })

    it('a second playWadSynth stops the first — never stacks', () => {
      const backend = fakeBackend()
      const handler = createCommandHandler(backend)
      handler.handleCommand({ cmd: 'playWadSynth', config: { source: 'square' } })
      const firstHandle = backend.wadSynthHandles[0]!
      handler.handleCommand({ cmd: 'playWadSynth', config: { source: 'sawtooth' } })

      expect(firstHandle.stop).toHaveBeenCalledTimes(1)
      expect(backend.wadSynthHandles[1]!.stop).not.toHaveBeenCalled()
    })

    it('stop stops the current wad synth the same way stopSong does', () => {
      const backend = fakeBackend()
      const handler = createCommandHandler(backend)
      handler.handleCommand({ cmd: 'playWadSynth', config: { source: 'triangle' } })
      const response = handler.handleCommand({ cmd: 'stop' })
      expect(response).toEqual({ ok: true, cmd: 'stop' })
      expect(backend.wadSynthHandles[0]!.stop).toHaveBeenCalledTimes(1)
    })

    it('playToneSynth replaces a playing wad synth and vice versa — one current source across both engines', () => {
      const backend = fakeBackend()
      const handler = createCommandHandler(backend)
      handler.handleCommand({ cmd: 'playWadSynth', config: { source: 'square' } })
      const wadHandle = backend.wadSynthHandles[0]!

      handler.handleCommand({
        cmd: 'playToneSynth',
        synthType: 'Synth',
        note: 'C4',
        duration: '8n',
      })
      expect(wadHandle.stop).toHaveBeenCalledTimes(1)
      expect(backend.toneSynthHandles[0]!.stop).not.toHaveBeenCalled()
    })
  })

  it("shutdown just acks — process teardown is the wiring layer's job, not the handler's", () => {
    const backend = fakeBackend()
    const handler = createCommandHandler(backend)
    const response = handler.handleCommand({ cmd: 'shutdown' })
    expect(response).toEqual({ ok: true, cmd: 'shutdown' })
  })

  it('a backend that throws on play() produces a Nack, not an uncaught exception', () => {
    const handler = createCommandHandler({
      play: () => {
        throw new Error('boom')
      },
      playSong: () => ({ stop: vi.fn() }),
      playFile: vi.fn(),
      playToneSynth: () => ({ stop: vi.fn() }),
      playWadSynth: () => ({ stop: vi.fn() }),
      getStats: () => SILENT_STATS,
    })
    const response = handler.handleCommand({ cmd: 'play', params: [1] })
    expect(response).toEqual({ ok: false, cmd: 'play', error: 'boom' })
  })

  it('a backend that throws on playSong() produces a Nack and does not corrupt the current-song state', () => {
    const backend = fakeBackend()
    let shouldThrow = false
    const throwing: AudioBackend = {
      play: backend.play,
      playSong: (song, volume) => {
        if (shouldThrow) throw new Error('song failed')
        return backend.playSong(song, volume)
      },
      playFile: backend.playFile,
      playToneSynth: backend.playToneSynth,
      playWadSynth: backend.playWadSynth,
      getStats: backend.getStats,
    }
    const handler = createCommandHandler(throwing)
    handler.handleCommand({ cmd: 'playSong', song: SONG })
    const firstHandle = backend.songHandles[0]!

    shouldThrow = true
    const response = handler.handleCommand({ cmd: 'playSong', song: SONG })
    expect(response).toEqual({ ok: false, cmd: 'playSong', error: 'song failed' })

    // The failed playSong stopped the previous song (replace-before-start
    // semantics) but never got a new handle back — currentSong must be
    // cleared BEFORE that stop() call, not after, or a stopSong here
    // would find the same stale handle still referenced and call .stop()
    // on it a second time.
    const stopSongResponse = handler.handleCommand({ cmd: 'stopSong' })
    expect(stopSongResponse).toEqual({ ok: true, cmd: 'stopSong' })
    expect(firstHandle.stop).toHaveBeenCalledTimes(1)
  })

  it('stats returns the backend-reported PlaybackStats verbatim', () => {
    const audible: PlaybackStats = {
      peak: 0.42,
      silent: false,
      playing: true,
      durationSeconds: 2,
      elapsedSeconds: 0.5,
    }
    const handler = createCommandHandler(fakeBackend(audible))
    const response = handler.handleCommand({ cmd: 'stats' })
    expect(response).toEqual({ ok: true, cmd: 'stats', stats: audible })
  })

  it('stats reflects a silent backend the same way — no play() call needed to ask', () => {
    const handler = createCommandHandler(fakeBackend(SILENT_STATS))
    const response = handler.handleCommand({ cmd: 'stats' })
    expect(response).toEqual({ ok: true, cmd: 'stats', stats: SILENT_STATS })
  })

  it('a backend that throws on getStats() produces a Nack, not an uncaught exception', () => {
    const handler = createCommandHandler({
      play: vi.fn(),
      playSong: () => ({ stop: vi.fn() }),
      playFile: vi.fn(),
      playToneSynth: () => ({ stop: vi.fn() }),
      playWadSynth: () => ({ stop: vi.fn() }),
      getStats: () => {
        throw new Error('analyser unavailable')
      },
    })
    const response = handler.handleCommand({ cmd: 'stats' })
    expect(response).toEqual({ ok: false, cmd: 'stats', error: 'analyser unavailable' })
  })
})
