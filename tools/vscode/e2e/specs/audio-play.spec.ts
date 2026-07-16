// Z9: the inline audio sidecar routes the CodeLens's "▶ Play" through a
// real AudioContext (node-web-audio-api) in a real OS process, not a
// webview panel. These three specs prove exactly the contract from the
// task brief: no panel opens, the sidecar process is spawned once and
// reused across repeated plays (not respawned per click), and it actually
// dies when the extension's real deactivation path runs — not a mocked
// stand-in for that path, the literal function `context.subscriptions`'
// dispose handler calls (see `extension/index.ts`'s `ExtensionApi`).
import { expect, skipIfAudioDeviceDeaf, test } from '../fixtures'

// Real-audio spec: skip (loudly, with the environmental evidence) when the
// warmup's oracle proved the OS audio device transiently deaf — see
// fixtures.ts's warmUpAudioPipeline. CI runs FL_E2E_REQUIRE_AUDIO=1 and
// hard-fails instead.
test.beforeEach(({ _sharedWindow }) => {
  skipIfAudioDeviceDeaf(_sharedWindow)
})

const LITERAL_PARAMS = [0.5, 0, 300, 0, 0.02, 0.05, 1]
// Long sustain/release (~2s total) so there's a comfortable window to poll
// for stats mid-playback — LITERAL_PARAMS' ~70ms one-shot is far too short
// to reliably land a query inside its audible window, especially against
// a cold sidecar spawn (native module load included).
const SUSTAINED_PARAMS = [0.5, 0, 300, 0, 1, 1, 1]

type PlaybackStats = {
  peak: number
  silent: boolean
  playing: boolean
  durationSeconds: number
  elapsedSeconds: number
}

type ExtensionApi = {
  zzfxPlay: {
    getActivePid: () => number | undefined
    shutdown: () => Promise<void>
    getStats: () => Promise<PlaybackStats | undefined>
  }
}

test.describe('FL ZzFX inline play sidecar (Z9)', () => {
  test('threeFlatland.audio.playParams routes inline — no webview panel opens', async ({
    evaluateInVSCode,
    workbox,
  }) => {
    const tabsBefore = await workbox.getByRole('tab').allTextContents()

    await evaluateInVSCode(
      async (vscode, arg) => {
        const ext = vscode.extensions.all.find(
          (e) => e.packageJSON.name === '@three-flatland/vscode'
        )
        if (ext && !ext.isActive) await ext.activate()
        await vscode.commands.executeCommand('threeFlatland.audio.playParams', arg.params)
      },
      { params: LITERAL_PARAMS }
    )

    // Give an incorrect panel-open path a moment to actually manifest
    // before asserting its absence.
    await new Promise((resolve) => setTimeout(resolve, 500))

    const tabsAfter = await workbox.getByRole('tab').allTextContents()
    expect(tabsAfter).toEqual(tabsBefore)
    await expect(workbox.getByRole('tab', { name: /^ZzFX:/ })).toHaveCount(0)
  })

  test('the sidecar process spawns once and is reused across repeated plays', async ({
    evaluateInVSCode,
  }) => {
    const pids = await evaluateInVSCode(
      async (vscode, arg) => {
        const ext = vscode.extensions.all.find(
          (e) => e.packageJSON.name === '@three-flatland/vscode'
        )
        if (ext && !ext.isActive) await ext.activate()
        const api = ext!.exports as ExtensionApi

        const collected: (number | undefined)[] = []
        for (let i = 0; i < 3; i++) {
          await vscode.commands.executeCommand('threeFlatland.audio.playParams', arg.params)
          // Settle so the first call's child has actually spawned before reading its pid.
          await new Promise((resolve) => setTimeout(resolve, 300))
          collected.push(api.zzfxPlay.getActivePid())
        }
        return collected
      },
      { params: LITERAL_PARAMS }
    )

    expect(pids[0]).toBeGreaterThan(0)
    // Same pid across all three calls — a fresh spawn per play would give
    // three different pids instead.
    expect(pids[1]).toBe(pids[0])
    expect(pids[2]).toBe(pids[0])
  })

  test("shutdown — the exact function real deactivation invokes via context.subscriptions — actually kills the sidecar's OS process", async ({
    evaluateInVSCode,
  }) => {
    const result = await evaluateInVSCode(
      async (vscode, arg) => {
        const ext = vscode.extensions.all.find(
          (e) => e.packageJSON.name === '@three-flatland/vscode'
        )
        if (ext && !ext.isActive) await ext.activate()
        const api = ext!.exports as ExtensionApi

        await vscode.commands.executeCommand('threeFlatland.audio.playParams', arg.params)
        await new Promise((resolve) => setTimeout(resolve, 300))
        const pid = api.zzfxPlay.getActivePid()
        if (!pid) return { pid: undefined, aliveAfterShutdown: undefined }

        await api.zzfxPlay.shutdown()

        let aliveAfterShutdown = true
        try {
          // Signal 0: existence check only, doesn't actually send a
          // signal — throws ESRCH if the pid no longer exists.
          process.kill(pid, 0)
        } catch {
          aliveAfterShutdown = false
        }
        return { pid, aliveAfterShutdown }
      },
      { params: LITERAL_PARAMS }
    )

    expect(result.pid).toBeGreaterThan(0)
    expect(result.aliveAfterShutdown).toBe(false)
  })

  // Z12 regression guard: node-web-audio-api's getChannelData() returns a
  // detached copy, so writing samples into it (the pre-fix code path)
  // acked clean and spawned a real process, but never actually reached
  // the output — dead silent, with nothing in the previous three specs
  // above able to detect it. This drives the real sidecar end-to-end and
  // asserts real, nonzero audio via the AnalyserNode-backed `stats`
  // command, so a regression back to the get-then-mutate pattern fails
  // this test instead of shipping silently.
  //
  // Polls rather than sleeping a fixed delay: the prior spec shut the
  // sidecar down, so this test's `play` has to cold-spawn a fresh
  // process — native module load included — before audio starts
  // rendering at all, and that startup time isn't fixed.
  test('playing a sound actually reaches the output — not just an ack — per the stats AnalyserNode tap', async ({
    evaluateInVSCode,
  }) => {
    const stats = await evaluateInVSCode(
      async (vscode, arg) => {
        const ext = vscode.extensions.all.find(
          (e) => e.packageJSON.name === '@three-flatland/vscode'
        )
        if (ext && !ext.isActive) await ext.activate()
        const api = ext!.exports as ExtensionApi

        await vscode.commands.executeCommand('threeFlatland.audio.playParams', arg.params)

        // Spawn allowance only — the moment the sidecar reports the
        // source's own exact timing (#43), the deadline re-derives from
        // the REAL remaining play window instead of a magic constant.
        let deadline = Date.now() + 10_000
        let derived = false
        let last: Awaited<ReturnType<typeof api.zzfxPlay.getStats>>
        while (Date.now() < deadline) {
          last = await api.zzfxPlay.getStats()
          if (last && !last.silent) return last
          if (!derived && last?.playing) {
            derived = true
            deadline = Date.now() + (last.durationSeconds - last.elapsedSeconds) * 1000 + 1000
          }
          await new Promise((resolve) => setTimeout(resolve, 100))
        }
        return last
      },
      { params: SUSTAINED_PARAMS }
    )

    expect(stats).toBeDefined()
    expect(stats!.silent).toBe(false)
    expect(stats!.peak).toBeGreaterThan(0)
  })
})
