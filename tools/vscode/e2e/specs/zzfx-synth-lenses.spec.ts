// #47: Wad oscillator/noise synthesis and Tone.js instrument findings
// surface real, working ▶ Play / ⏹ Stop CodeLenses through the SAME
// sidecar infrastructure zzfxm.song/audio.file already use — this is the
// sibling spec to zzfx-audio-lenses.spec.ts, scoped to the two NEW
// finding kinds it introduced into src/audio-sources.ts (see that file's
// own doc comment for the case inventory). Kept in its own file per this
// codebase's per-feature-scope convention, mirroring why the A-series
// lenses got their own fixture/spec pair rather than growing the Z9-era
// sounds.ts/zzfx.spec.ts.
//
// Play/Stop are a STATIC pair for both kinds (stakeholder reversal of
// #46's toggle — see provider.ts's file doc comment): both lenses are
// always present, neither conditioned on playback state. The lens-face
// assertions below reflect that; zzfx-audio-lenses.spec.ts carries the
// dedicated static-pair and rapid-fire regression-guard tests since the
// underlying provider.ts dispatch is identical across all 4 non-zzfx.call
// kinds — this file only duplicates a light rapid-fire check for
// wad.synth, to prove the mechanism applies uniformly to the two kinds
// this file owns, not just to zzfxm.song's code path.
//
// Every `evaluateInVSCode` callback below inlines its own extension
// lookup/activation rather than calling a shared top-level helper — `fn`
// is shipped as source text (`Function.prototype.toString()`) and
// reconstructed via `new Function(...)` on the extension-host side (see
// `e2e/host-bridge/client.ts`'s doc comment), so it can only see its own
// `(vscode, arg)` parameters, never anything from this file's outer
// module scope. Helper functions below are duplicated from
// zzfx-audio-lenses.spec.ts rather than shared — same self-contained
// convention that file's own doc comment establishes.
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '../fixtures'

const SOUNDS_FILE = 'src/audio-sources.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SOUNDS_FIXTURE_LINES = fs
  .readFileSync(path.join(__dirname, '..', 'fixtures', 'workspace', SOUNDS_FILE), 'utf8')
  .split('\n')

function lineOf(needle: string): number {
  const line = SOUNDS_FIXTURE_LINES.findIndex((l) => l.includes(needle))
  if (line === -1) throw new Error(`audio-sources.ts no longer contains: ${needle}`)
  return line
}

const WAD_SINE_LINE = lineOf("new Wad({ source: 'sine' })")
const WAD_VAR_RESOLVABLE_LINE = lineOf('new Wad(wadOscillatorConfig)')
const WAD_VAR_UNRESOLVABLE_LINE = lineOf('new Wad(invalidWadConfig)')
const TONE_NOTE_LINE = lineOf("triggerAttackRelease('C4', '8n')")
const TONE_NOISE_LINE = lineOf("new Tone.NoiseSynth().toDestination().triggerAttackRelease('8n')")
const TONE_CHORD_LINE = lineOf('new Tone.PolySynth(Tone.FMSynth)')
const TONE_PLUCK_LINE = lineOf('new Tone.PluckSynth()')
const TONE_VAR_RESOLVABLE_LINE = lineOf("triggerAttackRelease(dynamicNote, '8n')")
const TONE_VAR_UNRESOLVABLE_LINE = lineOf("triggerAttackRelease(note, '8n')")
const LONG_MARCH_CALL_LINE = lineOf('zzfxm(longMarchSong)')

type LensCommand = { command: string; title: string; arguments?: unknown[] }
type ResolvedLens = { range: { start: { line: number } }; command?: LensCommand }

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

async function fetchLenses(
  evaluateInVSCode: <R, Arg = undefined>(
    fn: (vscodeModule: typeof import('vscode'), arg: Arg) => R | Promise<R>,
    arg?: Arg
  ) => Promise<R>
): Promise<ResolvedLens[]> {
  return evaluateInVSCode(
    async (vscode, arg) => {
      const ext = vscode.extensions.all.find((e) => e.packageJSON.name === '@three-flatland/vscode')
      if (ext && !ext.isActive) await ext.activate()

      const [folder] = vscode.workspace.workspaceFolders ?? []
      const uri = vscode.Uri.joinPath(folder!.uri, arg.file)
      const doc = await vscode.workspace.openTextDocument(uri)
      await vscode.window.showTextDocument(doc)
      const lenses = (await vscode.commands.executeCommand(
        'vscode.executeCodeLensProvider',
        uri,
        100
      )) as ResolvedLens[]
      return lenses.map((l) => ({
        range: { start: { line: l.range.start.line } },
        command: l.command,
      }))
    },
    { file: SOUNDS_FILE }
  )
}

function lensAt(lenses: ResolvedLens[], line: number, title: string): ResolvedLens | undefined {
  return lenses.find((l) => l.range.start.line === line && l.command?.title === title)
}

async function executeAndPollAudible(
  evaluateInVSCode: <R, Arg = undefined>(
    fn: (vscodeModule: typeof import('vscode'), arg: Arg) => R | Promise<R>,
    arg?: Arg
  ) => Promise<R>,
  command: string,
  args: unknown[] | undefined
): Promise<PlaybackStats | undefined> {
  return evaluateInVSCode(
    async (vscode, arg) => {
      const ext = vscode.extensions.all.find((e) => e.packageJSON.name === '@three-flatland/vscode')
      if (ext && !ext.isActive) await ext.activate()
      const api = ext!.exports as ExtensionApi

      await vscode.commands.executeCommand(arg.command, ...(arg.args ?? []))
      let deadline = Date.now() + 10_000
      let derived = false
      let last: PlaybackStats | undefined
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
    { command, args }
  )
}

async function executeAndPollSilent(
  evaluateInVSCode: <R, Arg = undefined>(
    fn: (vscodeModule: typeof import('vscode'), arg: Arg) => R | Promise<R>,
    arg?: Arg
  ) => Promise<R>,
  command: string,
  args: unknown[] | undefined
): Promise<boolean> {
  return evaluateInVSCode(
    async (vscode, arg) => {
      const ext = vscode.extensions.all.find((e) => e.packageJSON.name === '@three-flatland/vscode')
      if (ext && !ext.isActive) await ext.activate()
      const api = ext!.exports as ExtensionApi

      await vscode.commands.executeCommand(arg.command, ...(arg.args ?? []))
      const deadline = Date.now() + 10_000
      while (Date.now() < deadline) {
        const stats = await api.zzfxPlay.getStats()
        if (stats && stats.silent) return true
        await new Promise((resolve) => setTimeout(resolve, 100))
      }
      return false
    },
    { command, args }
  )
}

async function executeVSCodeCommand(
  evaluateInVSCode: <R, Arg = undefined>(
    fn: (vscodeModule: typeof import('vscode'), arg: Arg) => R | Promise<R>,
    arg?: Arg
  ) => Promise<R>,
  command: string,
  args: unknown[] | undefined
): Promise<void> {
  await evaluateInVSCode(
    async (vscode, arg) => {
      const ext = vscode.extensions.all.find((e) => e.packageJSON.name === '@three-flatland/vscode')
      if (ext && !ext.isActive) await ext.activate()
      await vscode.commands.executeCommand(arg.command, ...(arg.args ?? []))
    },
    { command, args }
  )
}

test.describe('FL Audio: wad.synth and tone.synth Play/Stop lenses (#47)', () => {
  test('wad.synth: static Play+Stop pair (both always present), Play produces real audio, Stop silences it', async ({
    evaluateInVSCode,
  }) => {
    let lenses = await fetchLenses(evaluateInVSCode)
    const atRest = lenses
      .filter((l) => l.range.start.line === WAD_SINE_LINE)
      .sort((a, b) => (a.command?.title ?? '').localeCompare(b.command?.title ?? ''))
    expect(atRest).toHaveLength(2)
    const playLens = atRest.find((l) => l.command?.title === '▶ Play')!
    const stopLens = atRest.find((l) => l.command?.title === '⏹ Stop')!
    expect(playLens.command?.command).toBe('threeFlatland.audio.playWadSynth')
    expect(stopLens.command?.command).toBe('threeFlatland.audio.stopSong')

    const stats = await executeAndPollAudible(
      evaluateInVSCode,
      playLens.command!.command,
      playLens.command!.arguments
    )
    expect(stats).toBeDefined()
    expect(stats!.silent).toBe(false)
    expect(stats!.peak).toBeGreaterThan(0)
    // The lens SET doesn't change while playing — same two lenses.
    lenses = await fetchLenses(evaluateInVSCode)
    const whilePlaying = lenses
      .filter((l) => l.range.start.line === WAD_SINE_LINE)
      .sort((a, b) => (a.command?.title ?? '').localeCompare(b.command?.title ?? ''))
    expect(whilePlaying).toEqual(atRest)

    const silentAfterStop = await executeAndPollSilent(
      evaluateInVSCode,
      'threeFlatland.audio.stopSong',
      []
    )
    expect(silentAfterStop).toBe(true)
  })

  // Light rapid-fire check for wad.synth specifically — the dedicated
  // regression-guard test lives in zzfx-audio-lenses.spec.ts (zzfxm.song),
  // since provider.ts's static-pair dispatch is identical code across all
  // 4 non-zzfx.call kinds; this proves the SAME mechanism actually
  // applies to wad.synth's branch too, not just zzfxm.song's.
  test('wad.synth rapid-fire Play: 5 back-to-back plays with zero refresh-wait succeed, lens pair never changes', async ({
    evaluateInVSCode,
  }) => {
    const lenses = await fetchLenses(evaluateInVSCode)
    const playLens = lensAt(lenses, WAD_SINE_LINE, '▶ Play')!

    const result = await evaluateInVSCode(
      async (vscode, arg) => {
        const ext = vscode.extensions.all.find(
          (e) => e.packageJSON.name === '@three-flatland/vscode'
        )
        if (ext && !ext.isActive) await ext.activate()

        const [folder] = vscode.workspace.workspaceFolders ?? []
        const uri = vscode.Uri.joinPath(folder!.uri, arg.file)

        async function lensPairAt(line: number) {
          const resolved = (await vscode.commands.executeCommand(
            'vscode.executeCodeLensProvider',
            uri,
            100
          )) as Array<{
            range: { start: { line: number } }
            command?: { title: string; command: string }
          }>
          return resolved
            .filter((l) => l.range.start.line === line)
            .map((l) => ({ title: l.command?.title, command: l.command?.command }))
            .sort((a, b) => (a.title ?? '').localeCompare(b.title ?? ''))
        }

        const before = await lensPairAt(arg.line)
        for (let i = 0; i < 5; i++) {
          await vscode.commands.executeCommand(arg.playCommand, ...(arg.playArgs ?? []))
        }
        const afterRapidFire = await lensPairAt(arg.line)
        await vscode.commands.executeCommand('threeFlatland.audio.stopSong')
        const afterStop = await lensPairAt(arg.line)

        return { before, afterRapidFire, afterStop }
      },
      {
        file: 'src/audio-sources.ts',
        line: WAD_SINE_LINE,
        playCommand: playLens.command!.command,
        playArgs: playLens.command!.arguments,
      }
    )

    const expectedPair = [
      { title: '⏹ Stop', command: 'threeFlatland.audio.stopSong' },
      { title: '▶ Play', command: 'threeFlatland.audio.playWadSynth' },
    ]
    expect(result.before).toEqual(expectedPair)
    expect(result.afterRapidFire).toEqual(expectedPair)
    expect(result.afterStop).toEqual(expectedPair)
  })

  test('tone.synth: static Play+Stop pair (both always present), Play produces real audio, Stop silences it', async ({
    evaluateInVSCode,
  }) => {
    let lenses = await fetchLenses(evaluateInVSCode)
    const atRest = lenses
      .filter((l) => l.range.start.line === TONE_NOTE_LINE)
      .sort((a, b) => (a.command?.title ?? '').localeCompare(b.command?.title ?? ''))
    expect(atRest).toHaveLength(2)
    const playLens = atRest.find((l) => l.command?.title === '▶ Play')!
    const stopLens = atRest.find((l) => l.command?.title === '⏹ Stop')!
    expect(playLens.command?.command).toBe('threeFlatland.audio.playToneSynth')
    expect(stopLens.command?.command).toBe('threeFlatland.audio.stopSong')

    const stats = await executeAndPollAudible(
      evaluateInVSCode,
      playLens.command!.command,
      playLens.command!.arguments
    )
    expect(stats).toBeDefined()
    expect(stats!.silent).toBe(false)
    expect(stats!.peak).toBeGreaterThan(0)
    lenses = await fetchLenses(evaluateInVSCode)
    const whilePlaying = lenses
      .filter((l) => l.range.start.line === TONE_NOTE_LINE)
      .sort((a, b) => (a.command?.title ?? '').localeCompare(b.command?.title ?? ''))
    expect(whilePlaying).toEqual(atRest)

    const silentAfterStop = await executeAndPollSilent(
      evaluateInVSCode,
      'threeFlatland.audio.stopSong',
      []
    )
    expect(silentAfterStop).toBe(true)
  })

  // NoiseSynth's triggerAttackRelease has NO note argument (a genuinely
  // different call shape than the pitched case above), and PolySynth with
  // an explicit voice type is a genuinely different construction path
  // (Tone.classes.PolySynth + a resolved chord array) — both distinct
  // code paths in toneSynthResolver.ts/player.ts, each worth its own
  // audibility proof (e2e rationing: lighter than a full lens assertion
  // suite each, since the static-pair mechanics themselves are already
  // proven above).
  test('tone.synth NoiseSynth (no-note signature) and PolySynth+explicit voice (chord) also produce real audio', async ({
    evaluateInVSCode,
  }) => {
    let lenses = await fetchLenses(evaluateInVSCode)
    const noiseLens = lensAt(lenses, TONE_NOISE_LINE, '▶ Play')!
    expect(noiseLens.command?.command).toBe('threeFlatland.audio.playToneSynth')
    const noiseStats = await executeAndPollAudible(
      evaluateInVSCode,
      noiseLens.command!.command,
      noiseLens.command!.arguments
    )
    expect(noiseStats).toBeDefined()
    expect(noiseStats!.silent).toBe(false)
    expect(noiseStats!.peak).toBeGreaterThan(0)
    await executeVSCodeCommand(evaluateInVSCode, 'threeFlatland.audio.stopSong', [])

    lenses = await fetchLenses(evaluateInVSCode)
    const chordLens = lensAt(lenses, TONE_CHORD_LINE, '▶ Play')!
    expect(chordLens.command?.command).toBe('threeFlatland.audio.playToneSynth')
    const chordStats = await executeAndPollAudible(
      evaluateInVSCode,
      chordLens.command!.command,
      chordLens.command!.arguments
    )
    expect(chordStats).toBeDefined()
    expect(chordStats!.silent).toBe(false)
    expect(chordStats!.peak).toBeGreaterThan(0)
    await executeVSCodeCommand(evaluateInVSCode, 'threeFlatland.audio.stopSong', [])
  })

  // Regression guard: PluckSynth is the ONE allowlisted class whose
  // internal LowpassCombFilter constructs an AudioWorkletNode through
  // standardized-audio-context — none of the other 8 do. That path used
  // to throw inside an unawaited .then() (window.isSecureContext
  // undefined in our shim window), an unhandled rejection Node treats as
  // fatal — one PluckSynth play took down the ENTIRE sidecar process,
  // silently killing every other in-flight sound with it, not a clean
  // Nack (see sidecar.ts's module-scope fix comment). This went
  // undetected for a while precisely BECAUSE none of the other 8 types
  // exercise that path, so proves two things: PluckSynth itself produces
  // real audio, AND the sidecar process is still alive and responsive
  // for a completely unrelated zzfx.call afterward.
  test('tone.synth PluckSynth: AudioWorkletNode construction does not crash the sidecar process', async ({
    evaluateInVSCode,
  }) => {
    const lenses = await fetchLenses(evaluateInVSCode)
    const pluckLens = lensAt(lenses, TONE_PLUCK_LINE, '▶ Play')!
    expect(pluckLens.command?.command).toBe('threeFlatland.audio.playToneSynth')

    const pluckStats = await executeAndPollAudible(
      evaluateInVSCode,
      pluckLens.command!.command,
      pluckLens.command!.arguments
    )
    expect(pluckStats).toBeDefined()
    expect(pluckStats!.silent).toBe(false)
    expect(pluckStats!.peak).toBeGreaterThan(0)
    await executeVSCodeCommand(evaluateInVSCode, 'threeFlatland.audio.stopSong', [])

    // The process survived — prove it by playing something totally
    // unrelated (the plain Tone.Synth positive case) and getting real
    // audio back, not a dropped connection / hung request.
    const notePid = await evaluateInVSCode(async (vscode) => {
      const ext = vscode.extensions.all.find((e) => e.packageJSON.name === '@three-flatland/vscode')
      if (ext && !ext.isActive) await ext.activate()
      const api = ext!.exports as ExtensionApi
      return api.zzfxPlay.getActivePid()
    })
    expect(notePid, 'the sidecar process must still be alive after PluckSynth').toBeGreaterThan(0)

    const noteLens = lensAt(lenses, TONE_NOTE_LINE, '▶ Play')!
    const noteStats = await executeAndPollAudible(
      evaluateInVSCode,
      noteLens.command!.command,
      noteLens.command!.arguments
    )
    expect(noteStats).toBeDefined()
    expect(noteStats!.silent).toBe(false)
    expect(noteStats!.peak).toBeGreaterThan(0)
    await executeVSCodeCommand(evaluateInVSCode, 'threeFlatland.audio.stopSong', [])
  })

  // Highest real regression risk (per review): the sidecar's single
  // `currentSource` slot must correctly supersede ACROSS all 5 kinds, not
  // just within the 4 that already had coverage before #47. Starts a
  // zzfxm.song, then Plays a wad.synth lens while the song is still
  // audible. Observed via AUDIO STATE now, not a lens face flip — Play/
  // Stop are static for both kinds (stakeholder reversal of #46's
  // toggle), so there's no lens transition left to assert on; the
  // supersede mechanism itself (one current-source slot) is unchanged.
  test('cross-kind supersede: playing a wad.synth lens supersedes a playing zzfxm.song', async ({
    evaluateInVSCode,
  }) => {
    const lenses = await fetchLenses(evaluateInVSCode)
    const songLens = lensAt(lenses, LONG_MARCH_CALL_LINE, '▶ Play')!
    expect(songLens.command?.command).toBe('threeFlatland.audio.playSong')

    const songStats = await executeAndPollAudible(
      evaluateInVSCode,
      songLens.command!.command,
      songLens.command!.arguments
    )
    expect(songStats?.playing).toBe(true)

    const wadLens = lensAt(lenses, WAD_SINE_LINE, '▶ Play')!
    const wadStats = await executeAndPollAudible(
      evaluateInVSCode,
      wadLens.command!.command,
      wadLens.command!.arguments
    )
    expect(wadStats).toBeDefined()
    expect(wadStats!.silent).toBe(false)
    expect(wadStats!.peak).toBeGreaterThan(0)
    // wad.synth's own durationSeconds sentinel (Infinity, serialized as
    // null over the bridge — see the mid-playback stop test below) is a
    // second, independent signal that the CURRENT record really is now
    // the wad synth's, not a stale reading of the song's own timing.
    expect(wadStats!.durationSeconds).toBeNull()

    await executeVSCodeCommand(evaluateInVSCode, 'threeFlatland.audio.stopSong', [])
  })

  // wad.synth's `durationSeconds` is always Infinity (see player.ts's
  // playWadSynth doc comment) — `playing` is governed PURELY by the
  // Wad instance's own play()-returned promise resolving, never by an
  // elapsed-vs-duration catch-up. So an observed silence here can ONLY
  // come from the explicit stop actually reaching Wad's stop() (which
  // schedules its native soundSource.stop() and resolves that promise on
  // `onended`) — there is no natural-end fallback that could fake it.
  test('mid-playback Stop actually stops wad.synth — there is no natural end for this to be masking', async ({
    evaluateInVSCode,
  }) => {
    const lenses = await fetchLenses(evaluateInVSCode)
    const playLens = lensAt(lenses, WAD_SINE_LINE, '▶ Play')!

    const playing = await executeAndPollAudible(
      evaluateInVSCode,
      playLens.command!.command,
      playLens.command!.arguments
    )
    expect(playing?.playing).toBe(true)
    // `durationSeconds` really is `Infinity` in the sidecar (player.ts's
    // playWadSynth doc comment) — but the evaluateInVSCode bridge relays
    // results through JSON.stringify (host-bridge/runner.ts), which
    // collapses `Infinity` to `null`. `null` here IS the (bridge-lossy)
    // proof of `Infinity`, not a bug.
    expect(playing?.durationSeconds).toBeNull()

    const silentAfterStop = await executeAndPollSilent(
      evaluateInVSCode,
      'threeFlatland.audio.stopSong',
      []
    )
    expect(silentAfterStop).toBe(true)
  })

  // tone.synth's completion is a SYNTHETIC setTimeout (Tone has no native
  // completion event) — the risk this test targets: if `stop()` only
  // called `triggerRelease()`/`releaseAll()` WITHOUT cancelling that timer
  // and resolving `ended` immediately, `playing` would only flip false
  // once the ORIGINALLY SCHEDULED duration elapsed naturally, not
  // promptly after Stop — a late-firing timer could ghost-flip the lens.
  // Traced against player.ts's `playToneSynth` (bda365e0): its returned
  // `stop()` DOES `clearTimeout(timer)` AND calls `resolveEnded()`
  // synchronously, so silence should be observed almost immediately after
  // Stop, well before the note's own attack+release window elapses —
  // asserted here via wall-clock margin, not just eventual silence.
  test('mid-playback Stop actually stops tone.synth — proves the completion-timer is cancelled, not just released', async ({
    evaluateInVSCode,
  }) => {
    const lenses = await fetchLenses(evaluateInVSCode)
    const playLens = lensAt(lenses, TONE_NOTE_LINE, '▶ Play')!

    const result = await evaluateInVSCode(
      async (vscode, arg) => {
        const ext = vscode.extensions.all.find(
          (e) => e.packageJSON.name === '@three-flatland/vscode'
        )
        if (ext && !ext.isActive) await ext.activate()
        const api = ext!.exports as ExtensionApi
        const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

        await vscode.commands.executeCommand(arg.playCommand, ...(arg.playArgs ?? []))
        let started: PlaybackStats | undefined
        const spawnDeadline = Date.now() + 15_000
        while (Date.now() < spawnDeadline) {
          const stats = await api.zzfxPlay.getStats()
          if (stats?.playing) {
            started = stats
            break
          }
          await sleep(100)
        }
        if (!started) return { failedAt: 'start' as const }

        const durationSeconds = started.durationSeconds
        const stopIssuedAt = Date.now()
        await vscode.commands.executeCommand(arg.stopCommand)

        // Cap at the natural end itself — past it, silence proves
        // nothing (a no-op stop also goes silent at the natural end),
        // same discipline as the #43 long-song spec.
        const naturalEndDeadline =
          Date.now() + Math.max(0, durationSeconds - started.elapsedSeconds) * 1000 + 500
        let stopped: PlaybackStats | undefined
        while (Date.now() < naturalEndDeadline) {
          const stats = await api.zzfxPlay.getStats()
          if (stats && stats.silent && !stats.playing) {
            stopped = stats
            break
          }
          await sleep(50)
        }
        if (!stopped) return { failedAt: 'stop' as const, durationSeconds }
        return { durationSeconds, observedAfterMs: Date.now() - stopIssuedAt }
      },
      {
        playCommand: playLens.command!.command,
        playArgs: playLens.command!.arguments,
        stopCommand: 'threeFlatland.audio.stopSong',
      }
    )

    expect(result.failedAt).toBeUndefined()
    // Silence landed well within a fraction of the note's own duration —
    // if stop() left the synthetic timer running, this would only pass
    // once the FULL original duration had elapsed instead.
    expect(result.observedAfterMs!).toBeLessThan((result.durationSeconds! * 1000) / 2)
  })

  // #47's wad.synth var-ref cases, driven end to end: the scanner always
  // emits for a bare identifier (permissive posture), so BOTH get a lens,
  // but only the resolvable one actually plays — the other must show a
  // graceful error, never crash/hang, mirroring the same
  // resolve-at-Play-click-time posture zzfxm.song's unresolved varRef
  // takes (wadSynthResolver.ts's loadError path).
  test('wad.synth var-ref: the resolvable declaration plays real audio; the unresolvable one errors gracefully without crashing', async ({
    evaluateInVSCode,
  }) => {
    const lenses = await fetchLenses(evaluateInVSCode)
    const resolvableLens = lensAt(lenses, WAD_VAR_RESOLVABLE_LINE, '▶ Play')!
    expect(resolvableLens.command?.command).toBe('threeFlatland.audio.playWadSynth')

    const stats = await executeAndPollAudible(
      evaluateInVSCode,
      resolvableLens.command!.command,
      resolvableLens.command!.arguments
    )
    expect(stats).toBeDefined()
    expect(stats!.silent).toBe(false)
    expect(stats!.peak).toBeGreaterThan(0)
    // stopSong is fire-and-forget on the wire (see audio-play/CLAUDE.md) —
    // must poll for CONFIRMED silence, not just issue the command, or the
    // resolvable sound's own natural hold (~3.14s default Wad envelope)
    // can still be ringing when the unresolvable attempt's silence check
    // below runs, producing a false "still audible" failure that has
    // nothing to do with the unresolvable case under test.
    const silentBeforeUnresolvable = await executeAndPollSilent(
      evaluateInVSCode,
      'threeFlatland.audio.stopSong',
      []
    )
    expect(silentBeforeUnresolvable).toBe(true)

    const unresolvableLens = lensAt(lenses, WAD_VAR_UNRESOLVABLE_LINE, '▶ Play')!
    expect(unresolvableLens.command?.command).toBe('threeFlatland.audio.playWadSynth')

    // Monkey-patch showErrorMessage for the duration of this one command,
    // inside the SAME extension host process register.ts's `import *
    // as vscode from 'vscode'` resolves against — a deterministic capture
    // of whether (and what) error surfaced, rather than scraping VS
    // Code's notification-toast DOM (timing-dependent, and toasts
    // auto-dismiss).
    const result = await evaluateInVSCode(
      async (vscode, arg) => {
        const ext = vscode.extensions.all.find(
          (e) => e.packageJSON.name === '@three-flatland/vscode'
        )
        if (ext && !ext.isActive) await ext.activate()
        const api = ext!.exports as ExtensionApi

        const original = vscode.window.showErrorMessage
        let captured: string | undefined
        // Test-only monkey patch — narrower than the real (overloaded)
        // signature, but structurally compatible since this call site
        // only ever passes a plain string message.
        vscode.window.showErrorMessage = (message: string) => {
          captured = message
          return Promise.resolve(undefined)
        }
        try {
          await vscode.commands.executeCommand(arg.command, ...(arg.args ?? []))
          // Give the async command a moment to actually reach
          // showErrorMessage (resolveWadSynth awaits a text-document
          // open before parsing).
          await new Promise((resolve) => setTimeout(resolve, 1000))
        } finally {
          vscode.window.showErrorMessage = original
        }
        const stats = await api.zzfxPlay.getStats()
        return { captured, stillSilent: !stats || stats.silent }
      },
      { command: unresolvableLens.command!.command, args: unresolvableLens.command!.arguments }
    )

    expect(result.captured).toBeDefined()
    expect(result.captured).toMatch(/FL Audio:.*Wad synthesis config/)
    // Never crashed/hung, and never started playing anything either.
    expect(result.stillSilent).toBe(true)
  })

  // tone.synth's note/chord argument gets the same permissive var-ref
  // posture wad.synth's whole config argument already has: the scanner
  // always emits for a bare identifier. The resolvable case (dynamicNote)
  // plays for real. The unresolvable case (a function parameter — no
  // declaration/initializer exists at all, known from the sidecar's own
  // parse) is provably never playable, so it gets a single inert
  // `$(question) Unresolved` lens instead of a Play that would always
  // fail — see provider.ts's provideCodeLenses. This is a stricter
  // guarantee than wad.synth's unresolvable case (an existing declaration
  // whose VALUE isn't a valid config, only knowable by reading it), which
  // still gets a real Play lens and errors at click time.
  test('tone.synth var-ref: the resolvable note plays real audio; the unresolvable one (no declaration at all) gets an inert Unresolved lens instead of Play', async ({
    evaluateInVSCode,
  }) => {
    const lenses = await fetchLenses(evaluateInVSCode)
    const resolvableLens = lensAt(lenses, TONE_VAR_RESOLVABLE_LINE, '▶ Play')!
    expect(resolvableLens.command?.command).toBe('threeFlatland.audio.playToneSynth')

    const stats = await executeAndPollAudible(
      evaluateInVSCode,
      resolvableLens.command!.command,
      resolvableLens.command!.arguments
    )
    expect(stats).toBeDefined()
    expect(stats!.silent).toBe(false)
    expect(stats!.peak).toBeGreaterThan(0)

    const silentBeforeUnresolvable = await executeAndPollSilent(
      evaluateInVSCode,
      'threeFlatland.audio.stopSong',
      []
    )
    expect(silentBeforeUnresolvable).toBe(true)

    // No Play/Stop pair at all for this line — just the one inert lens.
    expect(lensAt(lenses, TONE_VAR_UNRESOLVABLE_LINE, '▶ Play')).toBeUndefined()
    expect(lensAt(lenses, TONE_VAR_UNRESOLVABLE_LINE, '⏹ Stop')).toBeUndefined()
    const unresolvedLens = lensAt(lenses, TONE_VAR_UNRESOLVABLE_LINE, '$(question) Unresolved')!
    expect(unresolvedLens).toBeDefined()
    expect(unresolvedLens.command?.command).toBe('')
  })

  // Part A: the very FIRST command a freshly-spawned sidecar receives is
  // a Tone play — the deterministic once-per-session cold-start Nack.
  // Forces a genuinely fresh sidecar (shutdown, so the next play respawns
  // one with `toneEngine`/`toneEnginePromise` module state reset) rather
  // than relying on test-execution order. Asserts BOTH that playback
  // eventually becomes audible AND that the retry stayed invisible to the
  // user (no error message shown) — the whole point of the fix.
  test('Part A cold-start: the first Tone play against a fresh sidecar becomes audible with no user-visible error (silent retry)', async ({
    evaluateInVSCode,
  }) => {
    const lenses = await fetchLenses(evaluateInVSCode)
    const playLens = lensAt(lenses, TONE_NOTE_LINE, '▶ Play')!

    const result = await evaluateInVSCode(
      async (vscode, arg) => {
        const ext = vscode.extensions.all.find(
          (e) => e.packageJSON.name === '@three-flatland/vscode'
        )
        if (ext && !ext.isActive) await ext.activate()
        const api = ext!.exports as ExtensionApi

        await api.zzfxPlay.shutdown()

        const original = vscode.window.showErrorMessage
        let captured: string | undefined
        // Test-only monkey patch — see the wad.synth unresolvable-varRef
        // test above for why (deterministic capture vs. DOM toast
        // scraping).
        vscode.window.showErrorMessage = (message: string) => {
          captured = message
          return Promise.resolve(undefined)
        }

        try {
          await vscode.commands.executeCommand(arg.command, ...(arg.args ?? []))
          // Budget generously: cold OS-process spawn + native module load
          // (existing specs in this codebase allow up to 15s for this)
          // PLUS Tone's dynamic import (plausibly 0.5-1.5s+ under the
          // Electron helper) PLUS the retry's own ~4s backoff schedule.
          const deadline = Date.now() + 20_000
          let last: PlaybackStats | undefined
          while (Date.now() < deadline) {
            last = await api.zzfxPlay.getStats()
            if (last && !last.silent) break
            await new Promise((resolve) => setTimeout(resolve, 150))
          }
          return { stats: last, captured }
        } finally {
          vscode.window.showErrorMessage = original
        }
      },
      { command: playLens.command!.command, args: playLens.command!.arguments }
    )

    expect(result.stats).toBeDefined()
    expect(result.stats!.silent).toBe(false)
    expect(result.stats!.peak).toBeGreaterThan(0)
    // The retry stayed invisible — no error message reached the user.
    expect(result.captured).toBeUndefined()

    await executeVSCodeCommand(evaluateInVSCode, 'threeFlatland.audio.stopSong', [])
  })
})
