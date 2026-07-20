// Z9: the inline audio sidecar routes the CodeLens's "▶ Play" through a
// real AudioContext (node-web-audio-api) in a real OS process, not a
// webview panel. These three specs prove exactly the contract from the
// task brief: no panel opens, the sidecar process is spawned once and
// reused across repeated plays (not respawned per click), and it actually
// dies when the extension's real deactivation path runs — not a mocked
// stand-in for that path, the literal function `context.subscriptions`'
// dispose handler calls (see `extension/index.ts`'s `ExtensionApi`).
//
// Determinism redesign (planning/testing/test-determinism-audit.md): the
// fourth spec that used to live here — playing SUSTAINED_PARAMS and
// polling the real sidecar's live AnalyserNode via `getStats()` for
// `{silent:false, peak>0}` — was deleted. That real-device, real-analyser
// audibility proof is now covered ONCE, deterministically, by
// `specs/audio-render-gate.spec.ts`'s `OfflineAudioContext` render (no
// device, no polling, no warmup). The `skipIfAudioDeviceDeaf` guard the
// deleted spec needed is gone too — every test below only needs the
// sidecar process to exist and respond to pid/shutdown/ping queries, not
// to produce audible output.
//
// P0 device-less-startup fix (planning/testing/pr188-adversarial-review.md
// finding #1): a CI runner with no audio output device used to crash the
// sidecar at import time (zzfx's top-level `new AudioContext` — see
// `tools/audio-play/src/audioContextGuard.ts`). The sidecar is now
// device-tolerant — a missing device degrades `play` to a clean Nack
// instead of taking the process down — but `getActivePid()` ALONE is
// still not the deterministic liveness proof these tests want: the
// client records the child's pid synchronously at spawn, before the
// child has actually processed anything, so a bare pid only proves "a
// process was spawned," not "the process is alive and answering the wire
// protocol." Every test below calls `ping()` (id-correlated, answered by
// `commandHandler.ts` without ever touching `AudioContext` — see
// `tools/audio-play/AGENTS.md`'s device-tolerance section) to prove
// PROCESS liveness first, deterministically, with or without a real
// audio device, before/alongside any pid-based assertion.
import { expect, test } from '../fixtures'

const LITERAL_PARAMS = [0.5, 0, 300, 0, 0.02, 0.05, 1]

type ExtensionApi = {
  zzfxPlay: {
    getActivePid: () => number | undefined
    shutdown: () => Promise<void>
    ping: () => Promise<boolean>
  }
}

test.describe('FL ZzFX inline play sidecar (Z9)', () => {
  test('threeFlatland.audio.playParams routes inline — no webview panel opens', async ({
    evaluateInVSCode,
    workbox,
  }) => {
    const tabsBefore = await workbox.getByRole('tab').allTextContents()

    const alive = await evaluateInVSCode(
      async (vscode, arg) => {
        const ext = vscode.extensions.all.find((e) => e.packageJSON.name === '@three-flatland/vscode')
        if (ext && !ext.isActive) await ext.activate()
        const api = ext!.exports as ExtensionApi
        await vscode.commands.executeCommand('threeFlatland.audio.playParams', arg.params)
        // Device-independent proof the play command actually reached a
        // live, responding sidecar process — not just that
        // executeCommand() didn't throw (a device-less play Nacks
        // quietly; ping still acks regardless).
        return api.zzfxPlay.ping()
      },
      { params: LITERAL_PARAMS }
    )
    expect(alive).toBe(true)

    // The awaited executeCommand() above only resolves once the whole
    // command handler has run to completion — inline-vs-panel routing
    // (register.ts's tryPlayInline) is entirely synchronous within that
    // handler, so the panel-absence check is safe immediately, with no
    // settle delay.
    const tabsAfter = await workbox.getByRole('tab').allTextContents()
    expect(tabsAfter).toEqual(tabsBefore)
    await expect(workbox.getByRole('tab', { name: /^ZzFX:/ })).toHaveCount(0)
  })

  test('the sidecar process spawns once and is reused across repeated plays', async ({ evaluateInVSCode }) => {
    const { pids, pings } = await evaluateInVSCode(
      async (vscode, arg) => {
        const ext = vscode.extensions.all.find((e) => e.packageJSON.name === '@three-flatland/vscode')
        if (ext && !ext.isActive) await ext.activate()
        const api = ext!.exports as ExtensionApi

        const collectedPids: (number | undefined)[] = []
        const collectedPings: boolean[] = []
        for (let i = 0; i < 3; i++) {
          // spawn() assigns the child's pid synchronously (client.ts's
          // start()), and tryPlayInline calls play() synchronously too —
          // by the time this awaited executeCommand() resolves, the pid
          // is already set. No settle delay needed.
          await vscode.commands.executeCommand('threeFlatland.audio.playParams', arg.params)
          // ping() is the deterministic proof for THIS iteration: the
          // process is alive and has processed everything queued ahead
          // of it on the sidecar's serialized command chain (including
          // this iteration's play), regardless of device presence. A
          // bare pid alone can't distinguish "reused, healthy process"
          // from "reused pid number, process wedged."
          collectedPings.push(await api.zzfxPlay.ping())
          collectedPids.push(api.zzfxPlay.getActivePid())
        }
        return { pids: collectedPids, pings: collectedPings }
      },
      { params: LITERAL_PARAMS }
    )

    expect(pings).toEqual([true, true, true])
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
        const ext = vscode.extensions.all.find((e) => e.packageJSON.name === '@three-flatland/vscode')
        if (ext && !ext.isActive) await ext.activate()
        const api = ext!.exports as ExtensionApi

        // pid is already set synchronously by the time executeCommand
        // resolves — see the spawn-once-reused test's comment above.
        await vscode.commands.executeCommand('threeFlatland.audio.playParams', arg.params)
        const pid = api.zzfxPlay.getActivePid()
        if (!pid) return { pid: undefined, aliveBeforeShutdown: false, aliveAfterShutdown: undefined }

        // Prove the process is genuinely up BEFORE shutdown — device-
        // independent, unlike trusting the pid number alone.
        const aliveBeforeShutdown = await api.zzfxPlay.ping()

        await api.zzfxPlay.shutdown()

        let aliveAfterShutdown = true
        try {
          // Signal 0: existence check only, doesn't actually send a
          // signal — throws ESRCH if the pid no longer exists.
          process.kill(pid, 0)
        } catch {
          aliveAfterShutdown = false
        }
        return { pid, aliveBeforeShutdown, aliveAfterShutdown }
      },
      { params: LITERAL_PARAMS }
    )

    expect(result.pid).toBeGreaterThan(0)
    expect(result.aliveBeforeShutdown).toBe(true)
    expect(result.aliveAfterShutdown).toBe(false)
  })
})
