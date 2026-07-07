import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PlaySidecarClient } from './client.js'

const FAKE_SIDECAR = fileURLToPath(new URL('./__fixtures__/fakePlaySidecar.mjs', import.meta.url))

function spawnFake(env?: NodeJS.ProcessEnv): PlaySidecarClient {
  // execPath here is plain `process.execPath` (real Node), not an
  // Electron binary — this fixture never touches node-web-audio-api, so
  // there's no ELECTRON_RUN_AS_NODE ABI concern to work around for a unit
  // test. The real client always forces ELECTRON_RUN_AS_NODE=1 on spawn
  // regardless (see client.ts's start()); plain Node ignores an env var
  // it doesn't recognize, so this is harmless here.
  return new PlaySidecarClient({ execPath: process.execPath, sidecarPath: FAKE_SIDECAR, env })
}

describe('PlaySidecarClient', () => {
  let client: PlaySidecarClient | undefined

  afterEach(() => {
    client?.dispose()
    client = undefined
  })

  it('is not running before the first play()/playSong() call', () => {
    client = spawnFake()
    expect(client.isRunning).toBe(false)
    expect(client.pid).toBeUndefined()
  })

  it('play() spawns the sidecar lazily', async () => {
    client = spawnFake()
    client.play([1, 0, 440])
    // Spawn is async (child_process.spawn returns before the OS process
    // is fully up) — poll briefly rather than asserting synchronously.
    await vi.waitFor(() => expect(client!.isRunning).toBe(true))
    expect(client.pid).toBeGreaterThan(0)
  })

  it('repeated play() calls reuse the same process — warm reuse, not respawn-per-call', async () => {
    client = spawnFake()
    client.play([1, 0, 440])
    await vi.waitFor(() => expect(client!.isRunning).toBe(true))
    const firstPid = client.pid

    client.play([1, 0, 220])
    client.play([1, 0, 880])
    // Synchronous calls immediately after the first — if start() were not
    // idempotent this would spawn additional processes with new pids.
    expect(client.pid).toBe(firstPid)
  })

  it('playSong()/stopSong()/stop() also lazily spawn and reuse the same process', async () => {
    client = spawnFake()
    const song = { instruments: [[1, 0, 220]], patterns: [[[0, 0, 12]]], sequence: [0] }
    client.playSong(song)
    await vi.waitFor(() => expect(client!.isRunning).toBe(true))
    const pid = client.pid

    client.stopSong()
    client.stop()
    expect(client.pid).toBe(pid)
  })

  it('stopSong()/stop() are no-ops (do not throw, do not spawn) when never started', () => {
    client = spawnFake()
    expect(() => client!.stopSong()).not.toThrow()
    expect(() => client!.stop()).not.toThrow()
    expect(client.isRunning).toBe(false)
  })

  it('onError fires when the sidecar responds with a Nack', async () => {
    client = spawnFake()
    const errors: Error[] = []
    client.onError((err) => errors.push(err))
    // Sentinel param the fixture recognizes as "respond with a Nack" —
    // see fakePlaySidecar.mjs.
    client.play([-999])
    await vi.waitFor(() => expect(errors).toHaveLength(1))
    expect(errors[0]!.message).toMatch(/boom requested/)
  })

  it('onExit fires with the exit code/signal, and returns an unsubscribe function', async () => {
    client = spawnFake()
    const exits: Array<{ code: number | null; signal: NodeJS.Signals | null }> = []
    const off = client.onExit((code, signal) => exits.push({ code, signal }))
    client.play([1, 0, 440])
    await vi.waitFor(() => expect(client!.isRunning).toBe(true))
    await client.shutdown()
    expect(exits).toEqual([{ code: 0, signal: null }])
    expect(() => off()).not.toThrow()
  })

  it('shutdown() resolves once the process has actually exited', async () => {
    client = spawnFake()
    client.play([1, 0, 440])
    await vi.waitFor(() => expect(client!.isRunning).toBe(true))
    await client.shutdown()
    expect(client.isRunning).toBe(false)
  })

  it('shutdown() is a no-op when the sidecar was never started', async () => {
    client = spawnFake()
    await expect(client.shutdown()).resolves.toBeUndefined()
  })

  it('shutdown() falls back to SIGKILL when the process hangs past the timeout', async () => {
    client = spawnFake({ ...process.env, FAKE_PLAY_SIDECAR_HANG_ON_SHUTDOWN: '1' })
    client.play([1, 0, 440])
    await vi.waitFor(() => expect(client!.isRunning).toBe(true))
    const startedAt = Date.now()
    await client.shutdown(200)
    expect(Date.now() - startedAt).toBeLessThan(2000) // proves it didn't wait forever
    expect(client.isRunning).toBe(false)
  })

  it('dispose() hard-kills immediately, no handshake', async () => {
    client = spawnFake()
    client.play([1, 0, 440])
    await vi.waitFor(() => expect(client!.isRunning).toBe(true))
    client.dispose()
    await vi.waitFor(() => expect(client!.isRunning).toBe(false))
  })
})
