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
// Determinism redesign (planning/testing/test-determinism-audit.md): real
// per-test audibility (`getStats().silent`/`.peak`) and stop-silence
// polling against the live sidecar's shared AnalyserNode were removed
// from every test below — see zzfx-audio-lenses.spec.ts's top comment for
// the full rationale (offline gate covers the output path once,
// commandHandler.test.ts/player.test.ts cover stop/supersede and
// timer-cancellation semantics deterministically). Two tests were
// deleted outright as purely real-time/audibility proofs with unique
// coverage already sitting in those unit tiers; see the deletion notes
// inline and this session's report for the full accounting.
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

type LensCommand = { command: string; title: string; arguments?: unknown[] }
type ResolvedLens = { range: { start: { line: number } }; command?: LensCommand }

/** `zzfxPlay.shutdown()` forces a fresh sidecar process; `ping()` is the
 * device-INDEPENDENT liveness signal the Tone tests below assert on — it
 * proves the sidecar process survived a play attempt (a crash/hang fails
 * the ping) WITHOUT depending on a working audio device, which is what a
 * device-less CI runner lacks. `getStats`/`getActivePid` are gone: no test
 * below polls the analyser or asserts device-dependent playback success
 * anymore. IMPORTANT: on a device-less runner, `assertAudioDeviceAvailable()`
 * Nacks EVERY `playToneSynth` call before `import('tone')`/AudioWorklet
 * code ever runs — the PluckSynth and cold-start-labeled tests below are
 * therefore device-tolerance/ping-liveness proofs, not AudioWorklet or
 * Tone-import regression guards (see each test's own comment). The real,
 * device-independent AudioWorklet regression guard lives at
 * `audio-render-gate.spec.ts`'s offline `PluckSynth` render, which calls
 * `toneEngineLoader.ts`'s production `loadToneEngine`/
 * `setupToneEnvironment` directly against an `OfflineAudioContext`. */
type ExtensionApi = {
  zzfxPlay: {
    shutdown: () => Promise<void>
    ping: () => Promise<boolean>
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
  // Compare titles with whitespace runs collapsed — codicon lens titles
  // (`$(question) Unresolved` etc.) carry cosmetic icon-to-label spacing that
  // isn't part of the contract, so the exact space count must not be pinned.
  const norm = (t: string | undefined) => (t ?? '').replace(/\s+/g, ' ')
  return lenses.find((l) => l.range.start.line === line && norm(l.command?.title) === norm(title))
}

/** Executes a lens's (or any) command through the real extension host and
 * awaits its full completion — no stats/audibility polling. Proves the
 * command dispatches without throwing. */
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

/** Executes `command`/`args` with `vscode.window.showErrorMessage`
 * monkey-patched for the duration of the call, returning whatever message
 * (if any) it captured. A deterministic capture of whether an error
 * surfaced, rather than scraping VS Code's notification-toast DOM (timing
 * -dependent, and toasts auto-dismiss) or polling the analyser. */
async function executeAndCaptureError(
  evaluateInVSCode: <R, Arg = undefined>(
    fn: (vscodeModule: typeof import('vscode'), arg: Arg) => R | Promise<R>,
    arg?: Arg
  ) => Promise<R>,
  command: string,
  args: unknown[] | undefined
): Promise<string | undefined> {
  // Wrapped in an object, not returned bare: the host-bridge's runner.ts
  // maps a bare `undefined` RETURN VALUE to `null` (`result ?? null`) —
  // but JSON.stringify drops an `undefined` OBJECT PROPERTY entirely, so
  // destructuring it back out here correctly reads as `undefined` again
  // (not `null`). A bare `return captured` would round-trip a "no error"
  // result as `null`, not `undefined`.
  const { captured } = await evaluateInVSCode(
    async (vscode, arg) => {
      const ext = vscode.extensions.all.find((e) => e.packageJSON.name === '@three-flatland/vscode')
      if (ext && !ext.isActive) await ext.activate()

      const original = vscode.window.showErrorMessage
      let captured: string | undefined
      // Test-only monkey patch, narrower than the real (overloaded)
      // signature — structurally compatible since every call site this
      // helper drives only ever passes a plain string message.
      vscode.window.showErrorMessage = (message: string) => {
        captured = message
        return Promise.resolve(undefined)
      }
      try {
        await vscode.commands.executeCommand(arg.command, ...(arg.args ?? []))
      } finally {
        vscode.window.showErrorMessage = original
      }
      return { captured }
    },
    { command, args }
  )
  return captured
}

test.describe('FL Audio: wad.synth and tone.synth Play/Stop lenses (#47)', () => {
  test('wad.synth: static Play+Stop pair (both always present), Play dispatches, Stop dispatches', async ({
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

    await executeVSCodeCommand(evaluateInVSCode, playLens.command!.command, playLens.command!.arguments)
    // The lens SET doesn't change while playing — same two lenses.
    lenses = await fetchLenses(evaluateInVSCode)
    const whilePlaying = lenses
      .filter((l) => l.range.start.line === WAD_SINE_LINE)
      .sort((a, b) => (a.command?.title ?? '').localeCompare(b.command?.title ?? ''))
    expect(whilePlaying).toEqual(atRest)

    await executeVSCodeCommand(evaluateInVSCode, 'threeFlatland.audio.stopSong', [])
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

  test('tone.synth: static Play+Stop pair (both always present), Play dispatches, Stop dispatches', async ({
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

    await executeVSCodeCommand(evaluateInVSCode, playLens.command!.command, playLens.command!.arguments)
    lenses = await fetchLenses(evaluateInVSCode)
    const whilePlaying = lenses
      .filter((l) => l.range.start.line === TONE_NOTE_LINE)
      .sort((a, b) => (a.command?.title ?? '').localeCompare(b.command?.title ?? ''))
    expect(whilePlaying).toEqual(atRest)

    await executeVSCodeCommand(evaluateInVSCode, 'threeFlatland.audio.stopSong', [])
  })

  // NoiseSynth's triggerAttackRelease has NO note argument (a genuinely
  // different call shape than the pitched case above), and PolySynth with
  // an explicit voice type is a genuinely different construction path
  // (Tone.classes.PolySynth + a resolved chord array) — both distinct
  // code paths in toneSynthResolver.ts/player.ts, each worth dispatching
  // for real (audibility of the shared output step is proven once, by
  // the offline gate).
  test('tone.synth NoiseSynth (no-note signature) and PolySynth+explicit voice (chord) both dispatch without throwing', async ({
    evaluateInVSCode,
  }) => {
    let lenses = await fetchLenses(evaluateInVSCode)
    const noiseLens = lensAt(lenses, TONE_NOISE_LINE, '▶ Play')!
    expect(noiseLens.command?.command).toBe('threeFlatland.audio.playToneSynth')
    await executeVSCodeCommand(
      evaluateInVSCode,
      noiseLens.command!.command,
      noiseLens.command!.arguments
    )
    await executeVSCodeCommand(evaluateInVSCode, 'threeFlatland.audio.stopSong', [])

    lenses = await fetchLenses(evaluateInVSCode)
    const chordLens = lensAt(lenses, TONE_CHORD_LINE, '▶ Play')!
    expect(chordLens.command?.command).toBe('threeFlatland.audio.playToneSynth')
    await executeVSCodeCommand(
      evaluateInVSCode,
      chordLens.command!.command,
      chordLens.command!.arguments
    )
    await executeVSCodeCommand(evaluateInVSCode, 'threeFlatland.audio.stopSong', [])
  })

  // HONEST SCOPE (adversarial-review finding #2, fix/deterministic-tests-p1):
  // this is a device-tolerance / CodeLens-dispatch / ping-liveness test —
  // NOT an AudioWorklet regression guard. On a device-less CI runner (the
  // ONLY environment this spec's blocking suite runs in),
  // `assertAudioDeviceAvailable()` — the very first line of `sidecar.ts`'s
  // `playToneSynth` backend — Nacks BEFORE `import('tone')` or any
  // AudioWorklet/`standardized-audio-context` code ever runs. That means
  // `PluckSynth`'s `LowpassCombFilter` → `ToneAudioWorklet` →
  // `AudioWorkletNode` path — the ONE allowlisted class whose construction
  // used to throw inside an unawaited `.then()` (`window.isSecureContext`
  // undefined in our shim `window`) and crash the ENTIRE sidecar process,
  // silently killing every other in-flight sound with it (see
  // `tools/audio-play/CLAUDE.md`'s AudioWorklet section) — is structurally
  // UNREACHABLE from this test on a device-less runner. A regression that
  // deleted the `isSecureContext`/`self` fix (`toneEngineLoader.ts`'s
  // `setupToneEnvironment`) entirely would still pass THIS test, because
  // the Nack happens first every time.
  //
  // The REAL, device-independent AudioWorkletNode regression guard now
  // lives at `tools/vscode/e2e/specs/audio-render-gate.spec.ts`'s
  // "playToneSynth PluckSynth" test, which renders a real `Tone.PluckSynth`
  // through an `OfflineAudioContext` (no device needed — AudioWorklet is
  // native-Worker-thread-based, independent of any output device) and
  // asserts non-silent, non-crashed output — see that spec + probe
  // (`offlineTonePluckProbe.mjs`) for the break-and-revert proof.
  //
  // What THIS test still legitimately proves, and why it's still worth
  // keeping: the `▶ Play` CodeLens for a PluckSynth call resolves and
  // dispatches (`playToneSynth` command, correct command id/args), the
  // sidecar's device-unavailable Nack path for `playToneSynth` doesn't
  // hang or crash the process on a cold/device-less runner, and the
  // process keeps answering `ping` afterward — real coverage, just not the
  // coverage its old name/comment claimed.
  test('tone.synth PluckSynth: CodeLens dispatches and the sidecar stays alive on a device-less runner (device-tolerance, not an AudioWorklet regression guard — see audio-render-gate.spec.ts for that)', async ({
    evaluateInVSCode,
  }) => {
    const lenses = await fetchLenses(evaluateInVSCode)
    const pluckLens = lensAt(lenses, TONE_PLUCK_LINE, '▶ Play')!
    expect(pluckLens.command?.command).toBe('threeFlatland.audio.playToneSynth')

    await executeVSCodeCommand(
      evaluateInVSCode,
      pluckLens.command!.command,
      pluckLens.command!.arguments
    )
    await executeVSCodeCommand(evaluateInVSCode, 'threeFlatland.audio.stopSong', [])

    // The process survived dispatching the command — prove it
    // device-INDEPENDENTLY via the sidecar's `ping` liveness command (a
    // real correlated signal, not a poll). On a device-less runner the play
    // Nacks immediately (no output device, before Tone/AudioWorklet code
    // ever runs) but the process must stay alive and answering; a crash or
    // a hung request anywhere in that dispatch path would drop the
    // connection and fail this ping.
    const alive = await evaluateInVSCode(async (vscode) => {
      const ext = vscode.extensions.all.find((e) => e.packageJSON.name === '@three-flatland/vscode')
      if (ext && !ext.isActive) await ext.activate()
      return (ext!.exports as ExtensionApi).zzfxPlay.ping()
    })
    expect(alive, 'the sidecar must still answer ping after dispatching PluckSynth — not crashed/hung').toBe(
      true
    )
  })

  // #47's wad.synth var-ref cases, driven end to end: the scanner always
  // emits for a bare identifier (permissive posture), so BOTH get a lens,
  // but only the resolvable one actually plays — the other must show a
  // graceful error, never crash/hang, mirroring the same
  // resolve-at-Play-click-time posture zzfxm.song's unresolved varRef
  // takes (wadSynthResolver.ts's loadError path). The resolvable side's
  // audibility is the offline gate's job now; what's pinned here is that
  // it dispatches without throwing AND that the unresolvable side
  // produces the specific, graceful error message rather than crashing.
  test('wad.synth var-ref: the resolvable declaration dispatches cleanly; the unresolvable one errors gracefully without crashing', async ({
    evaluateInVSCode,
  }) => {
    const lenses = await fetchLenses(evaluateInVSCode)
    const resolvableLens = lensAt(lenses, WAD_VAR_RESOLVABLE_LINE, '▶ Play')!
    expect(resolvableLens.command?.command).toBe('threeFlatland.audio.playWadSynth')

    await executeVSCodeCommand(
      evaluateInVSCode,
      resolvableLens.command!.command,
      resolvableLens.command!.arguments
    )
    await executeVSCodeCommand(evaluateInVSCode, 'threeFlatland.audio.stopSong', [])

    const unresolvableLens = lensAt(lenses, WAD_VAR_UNRESOLVABLE_LINE, '▶ Play')!
    expect(unresolvableLens.command?.command).toBe('threeFlatland.audio.playWadSynth')

    const captured = await executeAndCaptureError(
      evaluateInVSCode,
      unresolvableLens.command!.command,
      unresolvableLens.command!.arguments
    )
    expect(captured).toBeDefined()
    expect(captured).toMatch(/FL Audio:.*Wad synthesis config/)
  })

  // tone.synth's note/chord argument gets the same permissive var-ref
  // posture wad.synth's whole config argument already has: the scanner
  // always emits for a bare identifier. The resolvable case (dynamicNote)
  // dispatches for real. The unresolvable case (a function parameter — no
  // declaration/initializer exists at all, known from the sidecar's own
  // parse) is provably never playable, so it gets a single inert
  // `$(question) Unresolved` lens instead of a Play that would always
  // fail — see provider.ts's provideCodeLenses. This is a stricter
  // guarantee than wad.synth's unresolvable case (an existing declaration
  // whose VALUE isn't a valid config, only knowable by reading it), which
  // still gets a real Play lens and errors at click time.
  test('tone.synth var-ref: the resolvable note dispatches cleanly; the unresolvable one (no declaration at all) gets an inert Unresolved lens instead of Play', async ({
    evaluateInVSCode,
  }) => {
    const lenses = await fetchLenses(evaluateInVSCode)
    const resolvableLens = lensAt(lenses, TONE_VAR_RESOLVABLE_LINE, '▶ Play')!
    expect(resolvableLens.command?.command).toBe('threeFlatland.audio.playToneSynth')

    await executeVSCodeCommand(
      evaluateInVSCode,
      resolvableLens.command!.command,
      resolvableLens.command!.arguments
    )
    await executeVSCodeCommand(evaluateInVSCode, 'threeFlatland.audio.stopSong', [])

    // No Play/Stop pair at all for this line — just the one inert lens.
    expect(lensAt(lenses, TONE_VAR_UNRESOLVABLE_LINE, '▶ Play')).toBeUndefined()
    expect(lensAt(lenses, TONE_VAR_UNRESOLVABLE_LINE, '⏹ Stop')).toBeUndefined()
    const unresolvedLens = lensAt(lenses, TONE_VAR_UNRESOLVABLE_LINE, '$(question) Unresolved')!
    expect(unresolvedLens).toBeDefined()
    expect(unresolvedLens.command?.command).toBe('')
  })

  // HONEST SCOPE (adversarial-review finding #2, fix/deterministic-tests-p1):
  // this is a shutdown+respawn / device-tolerance / ping-liveness test —
  // NOT proof that the sidecar's cold-start `import('tone')` path (or, a
  // fortiori, any AudioWorklet setup — `TONE_NOTE_LINE` is a plain
  // `Tone.Synth` note, which never touches AudioWorklet even with a real
  // device) actually ran. `assertAudioDeviceAvailable()` — the first line
  // of `sidecar.ts`'s `playToneSynth` backend — Nacks on a device-less
  // runner BEFORE `loadToneEngineBounded()`/`import('tone')` is ever
  // reached, cold sidecar or not. What this test verifies is real and
  // still worth keeping: `zzfxPlay.shutdown()` + a following `playToneSynth`
  // dispatch against the freshly-respawned process + `ping()` all complete
  // without hanging or crashing the sidecar. It does NOT prove
  // `toneEngineLoader.ts`'s `loadToneEngine` (the real `import('tone')` +
  // `Tone.setContext` + engine-table construction) executes correctly on a
  // device-less runner — that coverage comes from
  // `audio-render-gate.spec.ts`'s offline probes instead, which call that
  // exact production helper directly, no device or sidecar process needed.
  test('Tone play against a freshly respawned sidecar: shutdown+respawn dispatches and the process stays alive (device-tolerance, not a cold-start import(\'tone\') proof)', async ({
    evaluateInVSCode,
  }) => {
    const lenses = await fetchLenses(evaluateInVSCode)
    const playLens = lensAt(lenses, TONE_NOTE_LINE, '▶ Play')!

    const alive = await evaluateInVSCode(
      async (vscode, arg) => {
        const ext = vscode.extensions.all.find(
          (e) => e.packageJSON.name === '@three-flatland/vscode'
        )
        if (ext && !ext.isActive) await ext.activate()
        const api = ext!.exports as ExtensionApi

        // Force a genuinely fresh sidecar process (not just fresh Tone
        // module state — the whole process respawns) rather than relying
        // on test-execution order.
        await api.zzfxPlay.shutdown()
        await vscode.commands.executeCommand(arg.command, ...(arg.args ?? []))

        // Device-INDEPENDENT success criterion: the freshly-respawned
        // sidecar answers `ping` after dispatching the command. A crash or
        // hung request anywhere in that dispatch path — Nack included —
        // would fail this. Whether the play itself became audible is
        // device-dependent — on a device-less runner it Nacks immediately,
        // which is correct, not a failure — so that's a manual/smoke
        // concern, not a blocking-CI one.
        return api.zzfxPlay.ping()
      },
      { command: playLens.command!.command, args: playLens.command!.arguments }
    )

    expect(
      alive,
      'the freshly-respawned sidecar must survive dispatching the Tone play and still answer ping'
    ).toBe(true)

    await executeVSCodeCommand(evaluateInVSCode, 'threeFlatland.audio.stopSong', [])
  })
})
