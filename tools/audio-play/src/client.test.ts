import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PlaySidecarClient, PlaySidecarExitedError } from './client.js'

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

  it('playFile() spawns the sidecar lazily and reuses the same process on repeated calls', async () => {
    client = spawnFake()
    client.playFile('/tmp/explosion.wav')
    await vi.waitFor(() => expect(client!.isRunning).toBe(true))
    const firstPid = client.pid

    client.playFile('/tmp/jump.ogg', 0.5)
    expect(client.pid).toBe(firstPid)
  })

  it('playToneSynth() spawns the sidecar lazily and reuses the same process on repeated calls', async () => {
    client = spawnFake()
    client.playToneSynth({ synthType: 'Synth', note: 'C4', duration: '8n' })
    await vi.waitFor(() => expect(client!.isRunning).toBe(true))
    const firstPid = client.pid

    client.playToneSynth({ synthType: 'NoiseSynth', duration: 0.05 }, 0.5)
    expect(client.pid).toBe(firstPid)
  })

  it('playWadSynth() spawns the sidecar lazily and reuses the same process on repeated calls', async () => {
    client = spawnFake()
    client.playWadSynth({ source: 'square' })
    await vi.waitFor(() => expect(client!.isRunning).toBe(true))
    const firstPid = client.pid

    client.playWadSynth({ source: 'noise' }, 0.5)
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

  it('ping() spawns lazily and resolves true — proves process liveness without touching audio', async () => {
    client = spawnFake()
    const alive = await client.ping()
    expect(alive).toBe(true)
    expect(client.isRunning).toBe(true)
  })

  it('concurrent ping() calls are serialized and each resolves true — same id-correlation discipline as getStats', async () => {
    client = spawnFake()
    const results = await Promise.all([client.ping(), client.ping(), client.ping()])
    expect(results).toEqual([true, true, true])
  })

  it('getStats() spawns lazily and resolves with the sidecar-reported PlaybackStats', async () => {
    client = spawnFake()
    const stats = await client.getStats()
    expect(stats).toEqual({
      peak: 0.5,
      silent: false,
      playing: true,
      durationSeconds: 2,
      elapsedSeconds: 0.5,
      contextState: 'running',
    })
    expect(client.isRunning).toBe(true)
  })

  it('concurrent getStats() calls are serialized — each caller gets its OWN response, in order (#46)', async () => {
    // The fake advances elapsedSeconds by 0.5 per stats request. The
    // content-based correlation (next `cmd:'stats'` line, no request id)
    // is only sound for one in-flight query: unserialized, all three
    // listeners here would resolve off the FIRST response ([0.5, 0.5,
    // 0.5]) and the orphaned later responses would make every subsequent
    // caller a full response stale — the exact interleave #46's
    // background auto-revert watcher produces against e2e stats polls.
    client = spawnFake()
    const [a, b, c] = await Promise.all([client.getStats(), client.getStats(), client.getStats()])
    expect([a.elapsedSeconds, b.elapsedSeconds, c.elapsedSeconds]).toEqual([0.5, 1, 1.5])
  })

  it('a rejected getStats() does not poison the queue for the caller behind it', async () => {
    client = spawnFake({ ...process.env, FAKE_PLAY_SIDECAR_STATS_ERROR: '1' })
    const [first, second] = await Promise.allSettled([client.getStats(), client.getStats()])
    expect(first.status).toBe('rejected')
    expect(second.status).toBe('rejected') // still REACHED the sidecar — not stuck behind the first
  })

  it('a getStats() whose response never arrives rejects after its timeout — and does NOT wedge the queue for callers behind or after it', async () => {
    // The CI-observed failure mode: one lost/never-sent stats response
    // used to leave requestStats() unsettled forever, and since every
    // caller chains onto statsChain, ONE lost response permanently hung
    // every later getStats() for the instance's whole lifetime.
    client = spawnFake({ ...process.env, FAKE_PLAY_SIDECAR_DROP_FIRST_STATS: '1' })
    // B is queued behind A BEFORE A times out — the strictest unwedge proof.
    const [a, b] = await Promise.allSettled([client.getStats(250), client.getStats()])
    expect(a.status).toBe('rejected')
    expect((a as PromiseRejectedResult).reason.message).toMatch(/no stats response within 250ms/)
    expect(b.status).toBe('fulfilled')
    // elapsedSeconds=1 proves B got the response to the SECOND request —
    // a real fresh round trip, not a late leftover of A's.
    expect((b as PromiseFulfilledResult<{ elapsedSeconds: number }>).value.elapsedSeconds).toBe(1)

    // And a brand-new caller after the dust settles works too.
    const later = await client.getStats()
    expect(later.playing).toBe(true)
  })

  it('a LATE response (arriving after its caller timed out) cannot shift later callers stale — every subsequent caller still gets ITS OWN response', async () => {
    // The codex-flagged hole in content-only correlation: a response that
    // is merely SLOW (not dropped) arrives after its caller's timeout
    // removed the listener — and the NEXT caller's listener, matching on
    // cmd alone, would consume it, leaving every subsequent same-command
    // response one stale FOREVER (caller N reads response N-1). Request
    // ids make the late orphan un-matchable instead.
    client = spawnFake({ ...process.env, FAKE_PLAY_SIDECAR_DELAY_FIRST_STATS: '600' })
    await expect(client.getStats(250)).rejects.toThrow(/no stats response within 250ms/)

    // Caller #2 attaches its listener well before #1's late response
    // lands (~600ms) — and, per the sidecar's strict response ordering,
    // that late response arrives FIRST. #2 must skip it and resolve with
    // its own (elapsedSeconds=1), not #1's stale 0.5.
    const second = await client.getStats()
    expect(second.elapsedSeconds).toBe(1)

    // And the stream stays correctly paired afterwards.
    const third = await client.getStats()
    expect(third.elapsedSeconds).toBe(1.5)
  })

  it('a playToneSynthAwaitable() whose response never arrives rejects after its timeout — and the tone queue unwedges', async () => {
    client = spawnFake({ ...process.env, FAKE_PLAY_SIDECAR_DROP_FIRST_TONE: '1' })
    await expect(
      client.playToneSynthAwaitable(
        { synthType: 'Synth', note: 'C4', duration: '8n' },
        undefined,
        250
      )
    ).rejects.toThrow(/no playToneSynth response within 250ms/)
    const result = await client.playToneSynthAwaitable({
      synthType: 'Synth',
      note: 'C4',
      duration: '8n',
    })
    expect(result).toEqual({ ok: true })
  })

  it('getStats() rejects when the sidecar Nacks the stats query', async () => {
    client = spawnFake({ ...process.env, FAKE_PLAY_SIDECAR_STATS_ERROR: '1' })
    await expect(client.getStats()).rejects.toThrow(/analyser unavailable/)
  })

  it('onStderr delivers the sidecar process stderr lines, and returns an unsubscribe function', async () => {
    // The sidecar's stderr carries its only out-of-band diagnostics — the
    // ready line (with AudioContext state), resume()/state-change logs.
    // Before this hook existed those lines were discarded unread.
    client = spawnFake()
    const lines: string[] = []
    const off = client.onStderr((line) => lines.push(line))
    client.play([1, 0, 440])
    await vi.waitFor(() => expect(lines.join('\n')).toMatch(/fakePlaySidecar: ready/))
    expect(() => off()).not.toThrow()
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

  it('onError carries the Nack code when the sidecar includes one (#47 cold-start retry correlation)', async () => {
    client = spawnFake()
    const errors: Error[] = []
    client.onError((err) => errors.push(err))
    client.playToneSynth({ synthType: 'Synth', note: '__COLD_START_TEST__', duration: '8n' })
    await vi.waitFor(() => expect(errors).toHaveLength(1))
    expect((errors[0] as Error & { code?: string }).code).toBe('TONE_LOADING')
  })

  it('playToneSynthAwaitable() resolves { ok: true } once the sidecar Acks THIS call', async () => {
    client = spawnFake()
    const result = await client.playToneSynthAwaitable({
      synthType: 'Synth',
      note: 'C4',
      duration: '8n',
    })
    expect(result).toEqual({ ok: true })
  })

  it('playToneSynthAwaitable() resolves ok:false (not a rejection) when the sidecar Nacks, carrying the code', async () => {
    client = spawnFake()
    const result = await client.playToneSynthAwaitable({
      synthType: 'Synth',
      note: '__COLD_START_TEST__',
      duration: '8n',
    })
    expect(result).toEqual({
      ok: false,
      error: 'Tone.js is still loading — try again in a moment',
      code: 'TONE_LOADING',
    })
  })

  it('concurrent playToneSynthAwaitable() calls are serialized — each caller gets its OWN correlated response, never a swapped one (#57 Fix 1)', async () => {
    // The bug this guards against: content-based correlation (the next
    // cmd:'playToneSynth' response line, no request id) is only sound for
    // ONE in-flight call at a time — same reasoning as getStats()'s
    // concurrent-serialization test above. Firing a normal call and a
    // cold-start-Nack call "concurrently" (Promise.all) must still pair
    // each with its OWN response, not cross-talk.
    client = spawnFake()
    const [normal, coldStart] = await Promise.all([
      client.playToneSynthAwaitable({ synthType: 'Synth', note: 'C4', duration: '8n' }),
      client.playToneSynthAwaitable({
        synthType: 'Synth',
        note: '__COLD_START_TEST__',
        duration: '8n',
      }),
    ])
    expect(normal).toEqual({ ok: true })
    expect(coldStart).toEqual({
      ok: false,
      error: 'Tone.js is still loading — try again in a moment',
      code: 'TONE_LOADING',
    })
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

  it('once exited, this instance never silently respawns — start()/play()/getStats()/ping() throw PlaySidecarExitedError instead', async () => {
    client = spawnFake()
    client.play([1, 0, 440])
    await vi.waitFor(() => expect(client!.isRunning).toBe(true))
    expect(client.isExited).toBe(false)

    await client.shutdown()
    expect(client.isExited).toBe(true)
    expect(client.isRunning).toBe(false)

    // Every entry point that calls start() internally must refuse to
    // spawn a replacement child from this now-permanently-exited instance
    // — a caller that still holds this reference (e.g. a stale watcher
    // closure) must get a clean failure, not a silent orphan process.
    expect(() => client!.start()).toThrow(PlaySidecarExitedError)
    expect(() => client!.play([1, 0, 220])).toThrow(PlaySidecarExitedError)
    await expect(client!.getStats()).rejects.toThrow(PlaySidecarExitedError)
    await expect(client!.ping()).rejects.toThrow(PlaySidecarExitedError)

    // No new process was spawned by any of the above.
    expect(client.pid).toBeUndefined()
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
