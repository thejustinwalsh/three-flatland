// A-series: multi-library audio Play/Stop lenses — zzfxm.song and
// audio.file findings surface real, working ▶ Play / ⏹ Stop CodeLenses,
// not just zzfx.call (Z9's original scope). See src/audio-sources.ts's
// own file doc comment for the exact positive/negative cases this drives
// — a SELF-CONTAINED fixture file, not appended to the Z9-era sounds.ts,
// so zzfx.spec.ts's pre-existing "exactly these 4 lenses for the whole
// document" assertion against sounds.ts stays untouched.
//
// Every `evaluateInVSCode` callback below inlines its own extension
// lookup/activation rather than calling a shared top-level helper — `fn`
// is shipped as source text (`Function.prototype.toString()`) and
// reconstructed via `new Function(...)` on the extension-host side (see
// `e2e/host-bridge/client.ts`'s doc comment), so it can only see its own
// `(vscode, arg)` parameters, never anything from this file's outer
// module scope.
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '../fixtures'

const SOUNDS_FILE = 'src/audio-sources.ts'

// Line anchors derived from the fixture's actual content, not hardcoded —
// hardcoded 0-indexed constants silently went stale twice when comment
// edits shifted the file. `lineOf` throws loudly if a call site vanishes.
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SOUNDS_FIXTURE_LINES = fs
  .readFileSync(path.join(__dirname, '..', 'fixtures', 'workspace', SOUNDS_FILE), 'utf8')
  .split('\n')

function lineOf(needle: string): number {
  const line = SOUNDS_FIXTURE_LINES.findIndex((l) => l.includes(needle))
  if (line === -1) throw new Error(`audio-sources.ts no longer contains: ${needle}`)
  return line
}

const FANFARE_CALL_LINE = lineOf('zzfxm(fanfareSong)') // bare-identifier varRef
const CHIPTUNE_CALL_LINE = lineOf('zzfxm([[0.5, 0, 300]]') // positional literal
const FANFARE_SPREAD_CALL_LINE = lineOf('zzfxM(...fanfareSong)') // spread varRef, plays
const LONG_MARCH_CALL_LINE = lineOf('zzfxm(longMarchSong)') // #43 long song, play/stop subject
const JUMP_SFX_LINE = lineOf("audioLoader.load('sounds/jump.wav')") // workspace-root tier
const CLICK_SFX_LINE = lineOf("new Howl({ src: ['click.wav'] })") // source-dir tier
const EXPLOSION_SFX_LINE = lineOf("new Wad({ source: 'explosion.ogg' })") // public/ tier
const REVERB_SFX_LINE = lineOf("reverb: { impulse: 'click.wav' }") // #44, 2-level nesting
const THUNDER_SFX_LINE = lineOf("new Audio('thunder.ogg')") // slow-search tier only
const MISSING_SFX_LINE = lineOf("new Audio('nonexistent-sound.mp3')") // → $(search) Not Found

// #47: Wad's 5 allowlisted oscillator/noise keywords — each now a real,
// toggling, audible wad.synth lens (previously audio.file NEGATIVES —
// see audio-sources.ts's own file doc comment).
const WAD_SINE_LINE = lineOf("new Wad({ source: 'sine' })")
const WAD_SQUARE_LINE = lineOf("new Wad({ source: 'square' })")
const WAD_SAWTOOTH_LINE = lineOf("new Wad({ source: 'sawtooth' })")
const WAD_TRIANGLE_LINE = lineOf("new Wad({ source: 'triangle' })")
const WAD_NOISE_LINE = lineOf("new Wad({ source: 'noise' })")
const WAD_OSCILLATOR_LINES = [
  WAD_SINE_LINE,
  WAD_SQUARE_LINE,
  WAD_SAWTOOTH_LINE,
  WAD_TRIANGLE_LINE,
  WAD_NOISE_LINE,
]

// #47: wad.synth bare-identifier var-ref — one resolvable, one whose
// declaration isn't a valid oscillator config (a lens exists either way —
// the scanner always emits for a bare identifier — but only the first
// actually plays).
const WAD_VAR_RESOLVABLE_LINE = lineOf('new Wad(wadOscillatorConfig)')
const WAD_VAR_UNRESOLVABLE_LINE = lineOf('new Wad(invalidWadConfig)')

// #44's TRUE decoy block — every line must surface ZERO lenses (mic, a
// stock preset, sprite segments — none of these are files OR a valid
// wad.synth oscillator config).
const SYNTH_DECOY_LINES = [
  "new Wad({ source: 'mic' })",
  'new Wad({ sprite: { hello: [0, 0.4] } })',
  'new Wad(Wad.presets.hiHatClosed)',
].map(lineOf)

// #47: Tone.js triggerAttackRelease positives (pitched, no-note,
// chord-with-explicit-voice, and a bare-identifier note resolving a
// varRef) plus the one whose varRef can't resolve (a function parameter).
const TONE_NOTE_LINE = lineOf("triggerAttackRelease('C4', '8n')")
const TONE_NOISE_LINE = lineOf("new Tone.NoiseSynth().toDestination().triggerAttackRelease('8n')")
const TONE_CHORD_LINE = lineOf('new Tone.PolySynth(Tone.FMSynth)')
const TONE_PLUCK_LINE = lineOf('new Tone.PluckSynth()')
const TONE_DYNAMIC_NOTE_LINE = lineOf("triggerAttackRelease(dynamicNote, '8n')")
const TONE_UNRESOLVABLE_NOTE_LINE = lineOf("triggerAttackRelease(note, '8n')")

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

/** Polls {@link fetchLenses} until no `$(search) Searching…` resolving lens
 * remains — i.e. every slow fallback search kicked off by this render has
 * settled to `▶ Play` or `$(search) Not Found` — then returns the settled
 * set. The searches are per-session-cached, so only the first render after
 * activation actually waits. */
async function fetchSettledLenses(
  evaluateInVSCode: <R, Arg = undefined>(
    fn: (vscodeModule: typeof import('vscode'), arg: Arg) => R | Promise<R>,
    arg?: Arg
  ) => Promise<R>
): Promise<ResolvedLens[]> {
  const deadline = Date.now() + 15_000
  let lenses = await fetchLenses(evaluateInVSCode)
  while (lenses.some((l) => l.command?.title === '$(search) Searching…') && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 150))
    lenses = await fetchLenses(evaluateInVSCode)
  }
  return lenses
}

/** Executes `command`/`args` (a resolved lens's own command), then polls
 * `zzfxPlay.getStats()` until it reports audible (`!silent`). The initial
 * deadline is only a spawn allowance (a cold sidecar loads a native
 * module before any source can start); the moment the sidecar reports the
 * source's own exact timing (#43), the deadline re-derives from the REAL
 * remaining play window instead of a magic constant. Self-contained — see
 * the file doc comment. */
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

/** Same shape as {@link executeAndPollAudible} but polls for `silent`
 * instead — the stopSong verification. The deadline derives from the
 * current source's reported remaining window (#43): even a no-op stop
 * goes silent at the natural end, so this alone can't prove a
 * MID-playback stop — the long-song spec below adds the
 * `elapsed < duration` proof for that. */
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
      const current = await api.zzfxPlay.getStats()
      const remainingMs = current
        ? Math.max(0, (current.durationSeconds - current.elapsedSeconds) * 1000)
        : 0
      const deadline = Date.now() + remainingMs + 2000
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

/** Executes a lens's command without any stats polling — for actions
 * whose observable effect is a LENS transition, not audibility. */
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

/** Polls {@link fetchLenses} until a lens titled `title` exists at
 * `line` — still needed for the async resolution states that DO change a
 * lens's presence/arguments (audio.file's searching→resolved/not-found
 * settling, #41), even though playback state no longer does (Play/Stop
 * are now static — see provider.ts's file doc comment). Returns
 * `undefined` once `timeoutMs` passes without one. */
async function pollLensAt(
  evaluateInVSCode: <R, Arg = undefined>(
    fn: (vscodeModule: typeof import('vscode'), arg: Arg) => R | Promise<R>,
    arg?: Arg
  ) => Promise<R>,
  line: number,
  title: string,
  timeoutMs = 5000
): Promise<ResolvedLens | undefined> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const lenses = await fetchLenses(evaluateInVSCode)
    const lens = lensAt(lenses, line, title)
    if (lens) return lens
    if (Date.now() > deadline) return undefined
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
}

test.describe('FL Audio: multi-library Play/Stop lenses', () => {
  test('lens set covers zzfx.call, zzfxm.song (varRef + positional + spread), and audio.file (fast tiers + slow tier + not-found) correctly', async ({
    evaluateInVSCode,
  }) => {
    const lenses = await fetchSettledLenses(evaluateInVSCode)
    const titles = lenses
      .map((l) => l.command?.title ?? null)
      .filter((t): t is string => t !== null)

    // Stakeholder reversal of #46's toggle: every playable kind besides
    // zzfx.call now carries a STATIC Play+Stop pair, both always present
    // regardless of playback state (no more single toggling lens). So
    // each of the counts below is DOUBLED relative to the toggle era:
    // 2 zzfx.call findings (Play+Edit each, unaffected) + 4 zzfxm.song
    // findings (Play+Stop each; incl. #43's long song) + 5 RESOLVABLE
    // audio.file findings (Play+Stop each — 3 fast tiers + #44's reverb
    // impulse + thunder.ogg via the slow search) + playMissingSfx's
    // `$(search) Not Found` informational lens (unaffected — no Stop
    // pairs with a not-found state) + #47's 5 wad.synth oscillator/noise
    // findings + 2 wad.synth var-ref findings (Play+Stop each — the
    // scanner always emits for a bare identifier, so BOTH var-ref lines
    // get a pair even though only one actually plays) + 6 tone.synth
    // findings (Play+Stop each — 4 literal/no-note positives incl.
    // PluckSynth's AudioWorklet regression guard, plus 2
    // bare-identifier-note var-ref findings, same permissive posture as
    // wad.synth's: both get a pair, only the resolvable one actually
    // plays). Every decoy — the commented-out ones and #44's TRUE decoy
    // block (mic/sprite/preset) — must contribute ZERO lenses, proven by
    // the exact total below, not just presence of the positive cases.
    expect(lenses).toHaveLength(49)
    // Play count is unchanged from the toggle era — exactly one Play per
    // playable finding, same as before; what's new is Stop now
    // accompanying every one of them unconditionally.
    expect(titles.filter((t) => t === '▶ Play')).toHaveLength(24)
    expect(titles.filter((t) => t === '⏹ Stop')).toHaveLength(22)
    expect(titles.filter((t) => t === '⚙ Edit')).toHaveLength(1)
    expect(titles.filter((t) => t === '⚙ Edit (variable)')).toHaveLength(1)
    expect(titles.filter((t) => t === '$(search) Not Found')).toHaveLength(1)

    // Every zzfxm.song and audio.file Play/Stop pair routes to the right
    // commands, proving provider.ts's per-kind dispatch (not just
    // zzfx.call's pre-existing playParams/openEditor).
    expect(lensAt(lenses, FANFARE_CALL_LINE, '▶ Play')?.command?.command).toBe(
      'threeFlatland.zzfx.playSong'
    )
    expect(lensAt(lenses, FANFARE_CALL_LINE, '⏹ Stop')?.command?.command).toBe(
      'threeFlatland.zzfx.stopSong'
    )
    expect(lensAt(lenses, JUMP_SFX_LINE, '▶ Play')?.command?.command).toBe(
      'threeFlatland.zzfx.playFile'
    )
    expect(lensAt(lenses, JUMP_SFX_LINE, '⏹ Stop')?.command?.command).toBe(
      'threeFlatland.zzfx.stopSong'
    )
    // The resolved absolute path is baked into the lens's own command
    // arguments — proving audioFileResolver.ts's workspace-root tier
    // actually ran and found the file, not just that a lens exists.
    const jumpArgs = lensAt(lenses, JUMP_SFX_LINE, '▶ Play')?.command?.arguments
    expect(String(jumpArgs?.[0])).toMatch(/sounds[/\\]jump\.wav$/)

    // Unresolvable path (playMissingSfx) — an informational
    // `$(search) Not Found` lens, not silent absence (#41). No Stop
    // pair for an unresolved path (provider.ts only adds Stop for
    // audio.file's 'resolved' state).
    expect(lensAt(lenses, MISSING_SFX_LINE, '$(search) Not Found')?.command?.command).toBe(
      'threeFlatland.zzfx.playFile'
    )
    expect(lensAt(lenses, MISSING_SFX_LINE, '⏹ Stop')).toBeUndefined()

    // #47: every wad.synth and tone.synth Play/Stop pair routes to its
    // own new command, proving provider.ts's dispatch covers all 5
    // finding kinds now, not just the original 3.
    for (const line of [
      ...WAD_OSCILLATOR_LINES,
      WAD_VAR_RESOLVABLE_LINE,
      WAD_VAR_UNRESOLVABLE_LINE,
    ]) {
      expect(lensAt(lenses, line, '▶ Play')?.command?.command).toBe(
        'threeFlatland.zzfx.playWadSynth'
      )
      expect(lensAt(lenses, line, '⏹ Stop')?.command?.command).toBe('threeFlatland.zzfx.stopSong')
    }
    for (const line of [
      TONE_NOTE_LINE,
      TONE_NOISE_LINE,
      TONE_CHORD_LINE,
      TONE_PLUCK_LINE,
      TONE_DYNAMIC_NOTE_LINE,
      TONE_UNRESOLVABLE_NOTE_LINE,
    ]) {
      expect(lensAt(lenses, line, '▶ Play')?.command?.command).toBe(
        'threeFlatland.zzfx.playToneSynth'
      )
      expect(lensAt(lenses, line, '⏹ Stop')?.command?.command).toBe('threeFlatland.zzfx.stopSong')
    }
  })

  // #41 slow tier: thunder.ogg misses every fast tier (it lives only at
  // media/deep/thunder.ogg), so its ▶ Play lens existing AT ALL — with
  // the deep path baked into its arguments — proves the workspace-wide
  // basename fallback search ran, settled, and re-rendered the lens via
  // onDidChangeCodeLenses.
  test('a fast-tier miss resolves through the slow workspace search to ▶ Play with the found path', async ({
    evaluateInVSCode,
  }) => {
    const lenses = await fetchSettledLenses(evaluateInVSCode)
    const playLens = lensAt(lenses, THUNDER_SFX_LINE, '▶ Play')
    expect(playLens?.command?.command).toBe('threeFlatland.zzfx.playFile')
    expect(String(playLens?.command?.arguments?.[0])).toMatch(/media[/\\]deep[/\\]thunder\.ogg$/)
  })

  // #41 lazy repair, the full cycle: found → cached → file deleted → Play
  // re-stats, re-searches, comes up empty → lens flips to
  // `$(search) Not Found` → file re-added → clicking the not-found lens
  // (the retry-shaped play attempt) re-searches, finds it, plays real
  // audio, and the lens heals back to ▶ Play.
  test('lazy repair: delete → Play flips to not-found; re-add → Play finds and plays again', async ({
    evaluateInVSCode,
    baseDir,
  }) => {
    const thunderPath = path.join(baseDir, 'media', 'deep', 'thunder.ogg')
    const thunderBytes = fs.readFileSync(thunderPath)

    // Found + cached (possibly already cached by a previous test's search
    // — same session, that's the point of the per-session cache).
    let lenses = await fetchSettledLenses(evaluateInVSCode)
    let playLens = lensAt(lenses, THUNDER_SFX_LINE, '▶ Play')
    expect(playLens?.command?.command).toBe('threeFlatland.zzfx.playFile')

    // Delete the asset, then attempt Play with the (now stale) cached
    // path — the command must re-stat, re-search, and settle not-found
    // rather than erroring or playing nothing silently.
    fs.rmSync(thunderPath)
    await evaluateInVSCode(
      async (vscode, arg) => {
        const ext = vscode.extensions.all.find(
          (e) => e.packageJSON.name === '@three-flatland/vscode'
        )
        if (ext && !ext.isActive) await ext.activate()
        await vscode.commands.executeCommand(arg.command, ...(arg.args ?? []))
      },
      { command: playLens!.command!.command, args: playLens!.command!.arguments }
    )
    lenses = await fetchSettledLenses(evaluateInVSCode)
    expect(lensAt(lenses, THUNDER_SFX_LINE, '$(search) Not Found')).toBeDefined()
    expect(lensAt(lenses, THUNDER_SFX_LINE, '▶ Play')).toBeUndefined()

    // Re-add the asset and click the not-found lens — the lazy repair's
    // retry: it re-searches, finds the re-added file, and plays it for
    // real (audibility via the same stats tap as every other route).
    fs.mkdirSync(path.dirname(thunderPath), { recursive: true })
    fs.writeFileSync(thunderPath, thunderBytes)
    const notFoundLens = lensAt(lenses, THUNDER_SFX_LINE, '$(search) Not Found')!
    const stats = await executeAndPollAudible(
      evaluateInVSCode,
      notFoundLens.command!.command,
      notFoundLens.command!.arguments
    )
    expect(stats).toBeDefined()
    expect(stats!.silent).toBe(false)
    expect(stats!.peak).toBeGreaterThan(0)

    // And the lens healed back to ▶ Play at the found path. Stop the
    // still-running playback for test hygiene before the next spec —
    // Play/Stop are static now, so this isn't about hiding a toggled
    // face, just not leaving audio running into the next test.
    await executeVSCodeCommand(evaluateInVSCode, 'threeFlatland.zzfx.stopSong', [])
    playLens = await pollLensAt(evaluateInVSCode, THUNDER_SFX_LINE, '▶ Play')
    expect(String(playLens?.command?.arguments?.[0])).toMatch(/media[/\\]deep[/\\]thunder\.ogg$/)
  })

  test('playSong (bare-identifier varRef route) produces real audio via the stats tap, and stopSong actually stops it', async ({
    evaluateInVSCode,
  }) => {
    const lenses = await fetchLenses(evaluateInVSCode)
    const playLens = lensAt(lenses, FANFARE_CALL_LINE, '▶ Play')!

    const playStats = await executeAndPollAudible(
      evaluateInVSCode,
      playLens.command!.command,
      playLens.command!.arguments
    )
    expect(playStats).toBeDefined()
    expect(playStats!.silent).toBe(false)
    expect(playStats!.peak).toBeGreaterThan(0)

    // Executes stopSong directly rather than discovering the Stop lens —
    // see the static-lens-pair spec below for the lens/command assertion
    // itself.
    const silentAfterStop = await executeAndPollSilent(
      evaluateInVSCode,
      'threeFlatland.zzfx.stopSong',
      []
    )
    expect(silentAfterStop).toBe(true)
  })

  test('playSong (true positional literal route, no varRef) also resolves and plays real audio', async ({
    evaluateInVSCode,
  }) => {
    const lenses = await fetchLenses(evaluateInVSCode)
    const playLens = lensAt(lenses, CHIPTUNE_CALL_LINE, '▶ Play')!

    const stats = await executeAndPollAudible(
      evaluateInVSCode,
      playLens.command!.command,
      playLens.command!.arguments
    )
    expect(stats).toBeDefined()
    expect(stats!.silent).toBe(false)
    expect(stats!.peak).toBeGreaterThan(0)
  })

  // Z12-style regression guard, extended to files: playBuffer routes
  // through the SAME shared analyser playSampleChannels uses, so this is
  // the shipped audibility proof for the audio.file route — vitest cannot
  // catch an Electron-only silent-decode regression (see
  // tools/zzfx-play/CLAUDE.md).
  test('playFile (audio.file route) decodes and plays a real .wav — reaches the SAME stats tap as zzfx/zzfxm', async ({
    evaluateInVSCode,
  }) => {
    const lenses = await fetchLenses(evaluateInVSCode)
    const playLens = lensAt(lenses, CLICK_SFX_LINE, '▶ Play')!
    expect(playLens.command?.command).toBe('threeFlatland.zzfx.playFile')

    const stats = await executeAndPollAudible(
      evaluateInVSCode,
      playLens.command!.command,
      playLens.command!.arguments
    )
    expect(stats).toBeDefined()
    expect(stats!.silent).toBe(false)
    expect(stats!.peak).toBeGreaterThan(0)
  })

  // The explosion.ogg (public/ tier) lens resolving at all IS the proof
  // that audioFileResolver.ts's third tier ran — playFile's decode path is
  // already proven generically by the .wav case above (decodeAudioData
  // doesn't care which resolution tier found the path), so this only
  // re-checks the lens/command wiring, not audibility again (e2e
  // rationing — one full audibility proof per output PATH, not per tier).
  test('the public/-tier audio.file lens (explosion.ogg) resolves and routes to playFile', async ({
    evaluateInVSCode,
  }) => {
    const lenses = await fetchLenses(evaluateInVSCode)
    const playLens = lensAt(lenses, EXPLOSION_SFX_LINE, '▶ Play')
    expect(playLens?.command?.command).toBe('threeFlatland.zzfx.playFile')
    expect(String(playLens?.command?.arguments?.[0])).toMatch(/public[/\\]explosion\.ogg$/)
  })

  // #44 expanded Wad coverage: the convolution-reverb impulse (a file
  // reference TWO object levels down — {reverb:{impulse}}) gets a ▶ Play
  // lens with the resolved real path baked into its arguments. Since #47
  // gave Wad's oscillator/noise keywords their OWN wad.synth finding
  // kind, only the TRUE decoy block — mic (live input), sprite segments,
  // and a stock preset — surfaces ZERO lenses now; asserted per line, not
  // just via the exact total above. Audibility for the click.wav path is
  // already proven by the .wav playFile test (e2e rationing — one
  // audibility proof per output path).
  test("Wad reverb impulse (nested 2 levels) gets a resolved ▶ Play lens; Wad's mic/sprite/preset decoys get none", async ({
    evaluateInVSCode,
  }) => {
    const lenses = await fetchSettledLenses(evaluateInVSCode)

    const playLens = lensAt(lenses, REVERB_SFX_LINE, '▶ Play')
    expect(playLens?.command?.command).toBe('threeFlatland.zzfx.playFile')
    expect(String(playLens?.command?.arguments?.[0])).toMatch(/src[/\\]click\.wav$/)

    for (const line of SYNTH_DECOY_LINES) {
      expect(
        lenses.filter((l) => l.range.start.line === line),
        `synthesis decoy on fixture line ${line} must surface no lens`
      ).toHaveLength(0)
    }
  })

  // #43: the long song (7.680s — MEASURED from ZZFXM.build's sample
  // count, see the fixture's own comment) proves three things the short
  // songs structurally can't:
  //   1. the sidecar reports the current source's EXACT timing —
  //      durationSeconds comes from the synthesized sample count, not a
  //      caller-side guess;
  //   2. playback SUSTAINS past the old magic 5s poll deadline;
  //   3. ⏹ Stop lands MID-playback — silence observed while
  //      elapsed < duration, which a natural finish cannot fake (the
  //      fanfare song is 0.43s; its stop test can't distinguish a real
  //      stop from the song simply ending).
  // One evaluateInVSCode block for the whole sequence: the phases are
  // wall-clock-coupled (elapsed keeps ticking between host-bridge round
  // trips), so polling from inside the extension host keeps the timing
  // observations honest.
  test('long song (#43): exact duration reported, playback sustains past 5s, and ⏹ Stop silences it mid-playback — before the natural end', async ({
    evaluateInVSCode,
  }) => {
    const lenses = await fetchLenses(evaluateInVSCode)
    const playLens = lensAt(lenses, LONG_MARCH_CALL_LINE, '▶ Play')!
    expect(playLens.command?.command).toBe('threeFlatland.zzfx.playSong')
    // This test's stop phase executes stopSong directly rather than
    // discovering the (now-always-present) Stop lens — see the
    // static-lens-pair spec below for the lens/command assertion itself.

    const result = await evaluateInVSCode(
      async (vscode, arg) => {
        const ext = vscode.extensions.all.find(
          (e) => e.packageJSON.name === '@three-flatland/vscode'
        )
        if (ext && !ext.isActive) await ext.activate()
        const api = ext!.exports as ExtensionApi
        const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

        const report: {
          failedAt?: 'start' | 'sustain' | 'restart' | 'stop'
          durationSeconds?: number
          sustainedElapsedSeconds?: number
          sustainedPeak?: number
          stoppedAtSeconds?: number
        } = {}

        // Phase 1 — play; wait for the source to actually start. This is
        // the only non-derived wait (a cold sidecar loads a native module
        // before any source can exist); every wait after it derives from
        // the sidecar's own reported timing.
        await vscode.commands.executeCommand(arg.playCommand, ...(arg.playArgs ?? []))
        let started: Awaited<ReturnType<typeof api.zzfxPlay.getStats>>
        const spawnDeadline = Date.now() + 15_000
        while (Date.now() < spawnDeadline) {
          const stats = await api.zzfxPlay.getStats()
          if (stats?.playing) {
            started = stats
            break
          }
          await sleep(100)
        }
        if (!started) {
          report.failedAt = 'start'
          return report
        }
        const durationSeconds = started.durationSeconds
        report.durationSeconds = durationSeconds

        // Phase 2 — sustain: keep polling until the source's own clock
        // passes the old magic 5s mark AND the analyser still hears it.
        // Wait cap = the source's reported remaining window, not a guess.
        const sustainDeadline =
          Date.now() + (durationSeconds - started.elapsedSeconds) * 1000 + 2000
        let sustained: PlaybackStats | undefined
        while (Date.now() < sustainDeadline) {
          const stats = await api.zzfxPlay.getStats()
          if (stats && stats.playing && !stats.silent && stats.elapsedSeconds > 5) {
            sustained = stats
            break
          }
          await sleep(150)
        }
        if (!sustained) {
          report.failedAt = 'sustain'
          return report
        }
        report.sustainedElapsedSeconds = sustained.elapsedSeconds
        report.sustainedPeak = sustained.peak

        // Phase 3 — restart (playSong replaces the current song), let it
        // run to the ~1s mark, then stop.
        await vscode.commands.executeCommand(arg.playCommand, ...(arg.playArgs ?? []))
        let atStop: PlaybackStats | undefined
        const restartDeadline = Date.now() + 5000
        while (Date.now() < restartDeadline) {
          const stats = await api.zzfxPlay.getStats()
          // playing + a small elapsed = the NEW source (the phase-2 one
          // was already past 5s and gets stopped by the replacement).
          if (stats && stats.playing && stats.elapsedSeconds >= 1 && stats.elapsedSeconds < 4) {
            atStop = stats
            break
          }
          await sleep(100)
        }
        if (!atStop) {
          report.failedAt = 'restart'
          return report
        }
        await vscode.commands.executeCommand(arg.stopCommand, ...(arg.stopArgs ?? []))

        // Phase 4 — silence must be OBSERVED while elapsed < duration.
        // The poll cap is the natural end itself: past it, silence proves
        // nothing (a no-op stop also goes silent at the natural end).
        let stopped: PlaybackStats | undefined
        const naturalEndDeadline = Date.now() + (durationSeconds - atStop.elapsedSeconds) * 1000
        while (Date.now() < naturalEndDeadline) {
          const stats = await api.zzfxPlay.getStats()
          if (stats && stats.silent && !stats.playing) {
            stopped = stats
            break
          }
          await sleep(100)
        }
        if (!stopped) {
          report.failedAt = 'stop'
          return report
        }
        report.stoppedAtSeconds = stopped.elapsedSeconds
        return report
      },
      {
        playCommand: playLens.command!.command,
        playArgs: playLens.command!.arguments,
        stopCommand: 'threeFlatland.zzfx.stopSong',
        stopArgs: [] as unknown[],
      }
    )

    expect(result.failedAt).toBeUndefined()
    // Exact duration from the synthesized sample count: 338688 / 44100.
    expect(result.durationSeconds).toBeGreaterThan(5)
    expect(result.durationSeconds!).toBeCloseTo(7.68, 2)
    // Sustained playback past the old magic 5s deadline, still audible.
    expect(result.sustainedElapsedSeconds!).toBeGreaterThan(5)
    expect(result.sustainedPeak!).toBeGreaterThan(0)
    // The stop landed mid-playback: silence observed well before the
    // 7.68s natural end (elapsed keeps ticking after a stop, so this
    // bounds the OBSERVATION time, not just the stop time).
    expect(result.stoppedAtSeconds!).toBeLessThan(result.durationSeconds! - 1)
  })

  // STATIC Play+Stop PAIR (stakeholder reversal of #46's toggle — see
  // provider.ts's file doc comment for the full rationale): both lenses
  // are always present, at rest AND while playing, and neither one's
  // title/command ever changes. This is the direct proof of the reverted
  // design — the old toggle spec asserted the OPPOSITE (one lens whose
  // face flips); this asserts the lens SET itself never changes shape.
  test('Play+Stop static pair: both lenses are always present, at rest and while playing, byte-identical throughout', async ({
    evaluateInVSCode,
  }) => {
    let lenses = await fetchLenses(evaluateInVSCode)
    const atRest = lenses
      .filter((l) => l.range.start.line === LONG_MARCH_CALL_LINE)
      .sort((a, b) => (a.command?.title ?? '').localeCompare(b.command?.title ?? ''))
    expect(atRest).toHaveLength(2)
    const playLens = atRest.find((l) => l.command?.title === '▶ Play')!
    const stopLens = atRest.find((l) => l.command?.title === '⏹ Stop')!
    expect(playLens.command?.command).toBe('threeFlatland.zzfx.playSong')
    expect(stopLens.command?.command).toBe('threeFlatland.zzfx.stopSong')

    // Play — the lens SET doesn't change at all: same two lenses, same
    // titles, same commands. No refresh-triggered recompute, no face flip.
    await executeAndPollAudible(
      evaluateInVSCode,
      playLens.command!.command,
      playLens.command!.arguments
    )
    lenses = await fetchLenses(evaluateInVSCode)
    const whilePlaying = lenses
      .filter((l) => l.range.start.line === LONG_MARCH_CALL_LINE)
      .sort((a, b) => (a.command?.title ?? '').localeCompare(b.command?.title ?? ''))
    expect(whilePlaying).toEqual(atRest)

    // Stop actually silences it (commandHandler.ts's existing behavior,
    // unchanged) — and the lens set is STILL exactly the same afterward.
    const silentAfterStop = await executeAndPollSilent(
      evaluateInVSCode,
      'threeFlatland.zzfx.stopSong',
      []
    )
    expect(silentAfterStop).toBe(true)
    lenses = await fetchLenses(evaluateInVSCode)
    const afterStop = lenses
      .filter((l) => l.range.start.line === LONG_MARCH_CALL_LINE)
      .sort((a, b) => (a.command?.title ?? '').localeCompare(b.command?.title ?? ''))
    expect(afterStop).toEqual(atRest)

    // Clicking Stop when nothing is playing is a harmless no-op — the
    // lens is present and clickable regardless of playback state.
    await executeVSCodeCommand(evaluateInVSCode, 'threeFlatland.zzfx.stopSong', [])
  })

  // THE regression guard for the exact bug that motivated reverting
  // #46's toggle: with a single toggling lens, Play's own command/title
  // changed to Stop after one click, so a second rapid click couldn't
  // even find a Play lens to click until onDidChangeCodeLenses's async
  // round trip settled. With a static pair, Play's command/title never
  // changes — 5 back-to-back invocations, no delay, no intervening lens
  // re-fetch between calls, must all succeed, and the lens pair must
  // read byte-identical before, immediately after all 5, and after an
  // explicit stop.
  test('rapid-fire Play: 5 back-to-back plays with zero refresh-wait between them succeed, lens pair never changes', async ({
    evaluateInVSCode,
  }) => {
    const lenses = await fetchLenses(evaluateInVSCode)
    const playLens = lensAt(lenses, LONG_MARCH_CALL_LINE, '▶ Play')!
    expect(playLens.command?.command).toBe('threeFlatland.zzfx.playSong')

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

        // 5 rapid, back-to-back Play invocations — exactly the scenario
        // the toggle broke.
        for (let i = 0; i < 5; i++) {
          await vscode.commands.executeCommand(arg.playCommand, ...(arg.playArgs ?? []))
        }
        const afterRapidFire = await lensPairAt(arg.line)

        await vscode.commands.executeCommand('threeFlatland.zzfx.stopSong')
        const afterStop = await lensPairAt(arg.line)

        return { before, afterRapidFire, afterStop }
      },
      {
        file: SOUNDS_FILE,
        line: LONG_MARCH_CALL_LINE,
        playCommand: playLens.command!.command,
        playArgs: playLens.command!.arguments,
      }
    )

    const expectedPair = [
      { title: '⏹ Stop', command: 'threeFlatland.zzfx.stopSong' },
      { title: '▶ Play', command: 'threeFlatland.zzfx.playSong' },
    ]
    expect(result.before).toEqual(expectedPair)
    expect(result.afterRapidFire).toEqual(expectedPair)
    expect(result.afterStop).toEqual(expectedPair)
  })

  // The sidecar's single currentSource slot still means only ONE sound
  // plays at a time even though the LENS no longer visualizes which one
  // — this proves that mechanism still works: starting a NEW sound
  // supersedes whatever was playing before it, cross-kind, exactly as it
  // did under the toggle (just observed via audio state now, not a lens
  // face flip, since there's no lens face to flip anymore).
  test('starting a new sound supersedes whatever was playing before it (single current-source slot, cross-kind)', async ({
    evaluateInVSCode,
  }) => {
    const lenses = await fetchLenses(evaluateInVSCode)
    const songLens = lensAt(lenses, LONG_MARCH_CALL_LINE, '▶ Play')!
    const clickLens = lensAt(lenses, CLICK_SFX_LINE, '▶ Play')!

    const songStats = await executeAndPollAudible(
      evaluateInVSCode,
      songLens.command!.command,
      songLens.command!.arguments
    )
    expect(songStats?.playing).toBe(true)

    // A NEW sound steals the single current-source slot — playFile marks
    // its own finding active the same way playSong does, cross-kind.
    const clickStats = await executeAndPollAudible(
      evaluateInVSCode,
      clickLens.command!.command,
      clickLens.command!.arguments
    )
    expect(clickStats).toBeDefined()
    expect(clickStats!.silent).toBe(false)
    expect(clickStats!.peak).toBeGreaterThan(0)

    await executeVSCodeCommand(evaluateInVSCode, 'threeFlatland.zzfx.stopSong', [])
  })

  // SOURCE-EDITOR BINDING (kept working across the #46 toggle reversal —
  // see provider.ts's file doc comment): a playing sound belongs to its
  // source document. Phase 1 exercises the switch listener (a DIFFERENT
  // doc becomes the active editor); phase 2 makes the source the ONLY
  // open editor and closes it, which routes through
  // onDidCloseTextDocument — the switch listener sees `undefined` then
  // and deliberately ignores it (a terminal/panel focus must never
  // false-stop). Both phases prove the stop landed MID-playback (silence
  // observed while elapsed < duration), same discipline as the #43 spec.
  // Unlike the toggle era, there's no lens face to confirm reverted —
  // Play/Stop are static now, so audibility is the only signal that
  // matters here.
  test('source binding: switching to another document stops the sound; closing the source document stops it too', async ({
    evaluateInVSCode,
  }) => {
    const lenses = await fetchLenses(evaluateInVSCode) // audio-sources.ts is now the active editor
    const playLens = lensAt(lenses, LONG_MARCH_CALL_LINE, '▶ Play')!

    const playing = await executeAndPollAudible(
      evaluateInVSCode,
      playLens.command!.command,
      playLens.command!.arguments
    )
    expect(playing?.playing).toBe(true)

    // Phase 1 — switch the active editor to a different document.
    const stoppedBySwitch = await evaluateInVSCode(
      async (vscode, arg) => {
        const ext = vscode.extensions.all.find(
          (e) => e.packageJSON.name === '@three-flatland/vscode'
        )
        if (ext && !ext.isActive) await ext.activate()
        const api = ext!.exports as ExtensionApi

        const [folder] = vscode.workspace.workspaceFolders ?? []
        const doc = await vscode.workspace.openTextDocument(
          vscode.Uri.joinPath(folder!.uri, arg.otherFile)
        )
        await vscode.window.showTextDocument(doc)

        const before = await api.zzfxPlay.getStats()
        const deadline =
          Date.now() +
          (before ? Math.max(0, (before.durationSeconds - before.elapsedSeconds) * 1000) : 5000)
        while (Date.now() < deadline) {
          const stats = await api.zzfxPlay.getStats()
          if (
            stats &&
            stats.silent &&
            !stats.playing &&
            stats.elapsedSeconds < stats.durationSeconds - 1
          ) {
            return { stopped: true }
          }
          await new Promise((resolve) => setTimeout(resolve, 100))
        }
        return { stopped: false }
      },
      { otherFile: 'src/sounds.ts' }
    )
    expect(stoppedBySwitch.stopped).toBe(true)

    // Phase 2 — make the source doc the ONLY editor, play, close it.
    await evaluateInVSCode(async (vscode) => {
      await vscode.commands.executeCommand('workbench.action.closeOtherEditors')
    })
    await executeAndPollAudible(
      evaluateInVSCode,
      playLens.command!.command,
      playLens.command!.arguments
    )
    const stoppedByClose = await evaluateInVSCode(async (vscode) => {
      const ext = vscode.extensions.all.find((e) => e.packageJSON.name === '@three-flatland/vscode')
      if (ext && !ext.isActive) await ext.activate()
      const api = ext!.exports as ExtensionApi

      await vscode.commands.executeCommand('workbench.action.closeActiveEditor')

      const before = await api.zzfxPlay.getStats()
      const deadline =
        Date.now() +
        (before ? Math.max(0, (before.durationSeconds - before.elapsedSeconds) * 1000) : 5000)
      while (Date.now() < deadline) {
        const stats = await api.zzfxPlay.getStats()
        if (
          stats &&
          stats.silent &&
          !stats.playing &&
          stats.elapsedSeconds < stats.durationSeconds - 1
        ) {
          return { stopped: true }
        }
        await new Promise((resolve) => setTimeout(resolve, 100))
      }
      return { stopped: false }
    })
    expect(stoppedByClose.stopped).toBe(true)
  })

  // A spread first argument (`zzfxM(...songVar)`) — the canonical
  // zzfxm-tool output shape — resolves the SAME varRef as the bare
  // identifier form (see sidecar/src/parse.rs's extract_zzfxm_call doc
  // comment), so Play produces real audio through the same songResolver
  // defRange path. This was a graceful-refusal case before the scanner
  // learned spreads; it reads as a bug for the spread form of a variable
  // to refuse while the bare form of the SAME variable plays.
  test('a spread zzfxm call (spread-of-identifier varRef) resolves and plays real audio', async ({
    evaluateInVSCode,
  }) => {
    const lenses = await fetchLenses(evaluateInVSCode)
    const playLens = lensAt(lenses, FANFARE_SPREAD_CALL_LINE, '▶ Play')!
    expect(playLens.command?.command).toBe('threeFlatland.zzfx.playSong')

    const stats = await executeAndPollAudible(
      evaluateInVSCode,
      playLens.command!.command,
      playLens.command!.arguments
    )
    expect(stats).toBeDefined()
    expect(stats!.silent).toBe(false)
    expect(stats!.peak).toBeGreaterThan(0)
  })
})
