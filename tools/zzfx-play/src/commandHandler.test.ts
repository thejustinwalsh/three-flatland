import { describe, expect, it, vi } from 'vitest'
import { createCommandHandler, type AudioBackend } from './commandHandler.js'
import type { Song } from './protocol.js'

const SONG: Song = {
  instruments: [[1, 0, 220]],
  patterns: [[[0, 0, 12, 12]]],
  sequence: [0],
  bpm: 120,
}

function fakeBackend(): AudioBackend & {
  playCalls: number[][]
  playSongCalls: Song[]
  songHandles: { stop: ReturnType<typeof vi.fn> }[]
} {
  const playCalls: number[][] = []
  const playSongCalls: Song[] = []
  const songHandles: { stop: ReturnType<typeof vi.fn> }[] = []
  return {
    playCalls,
    playSongCalls,
    songHandles,
    play: (params) => {
      playCalls.push(params)
    },
    playSong: (song) => {
      playSongCalls.push(song)
      const handle = { stop: vi.fn() }
      songHandles.push(handle)
      return handle
    },
  }
}

describe('createCommandHandler', () => {
  it('play forwards params to the backend and acks', () => {
    const backend = fakeBackend()
    const handler = createCommandHandler(backend)
    const response = handler.handleCommand({ cmd: 'play', params: [1, 0, 440] })
    expect(response).toEqual({ ok: true, cmd: 'play' })
    expect(backend.playCalls).toEqual([[1, 0, 440]])
  })

  it('playSong starts the song via the backend and acks', () => {
    const backend = fakeBackend()
    const handler = createCommandHandler(backend)
    const response = handler.handleCommand({ cmd: 'playSong', song: SONG })
    expect(response).toEqual({ ok: true, cmd: 'playSong' })
    expect(backend.playSongCalls).toEqual([SONG])
    expect(backend.songHandles[0]!.stop).not.toHaveBeenCalled()
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
    })
    const response = handler.handleCommand({ cmd: 'play', params: [1] })
    expect(response).toEqual({ ok: false, cmd: 'play', error: 'boom' })
  })

  it('a backend that throws on playSong() produces a Nack and does not corrupt the current-song state', () => {
    const backend = fakeBackend()
    let shouldThrow = false
    const throwing: AudioBackend = {
      play: backend.play,
      playSong: (song) => {
        if (shouldThrow) throw new Error('song failed')
        return backend.playSong(song)
      },
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
})
