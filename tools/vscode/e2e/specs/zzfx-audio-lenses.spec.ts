// A-series: multi-library audio Play/Stop lenses — zzfxm.song and
// audio.file findings surface real, working ▶ Play / ⏹ Stop CodeLenses,
// not just zzfx.call (Z9's original scope). See src/audio-sources.ts's
// own file doc comment for the exact positive/negative cases this drives
// — a SELF-CONTAINED fixture file, not appended to the Z9-era sounds.ts,
// so zzfx.spec.ts's pre-existing "exactly these 4 lenses for the whole
// document" assertion against sounds.ts stays untouched.
//
// Determinism redesign (planning/testing/test-determinism-audit.md): real
// per-test audibility (`getStats().silent`/`.peak`) and stop-silence
// polling against the live sidecar's shared AnalyserNode were removed
// from every test below — they required a real OS audio device and were
// this suite's main source of nondeterminism. The production output path
// they used to verify (`playSampleChannels`, tools/audio-play/src/
// player.ts) is now proven ONCE, deterministically, by
// `specs/audio-render-gate.spec.ts`'s `OfflineAudioContext` render — no
// device, no polling, no warmup. Stop/supersede semantics are covered
// deterministically by `tools/audio-play/src/commandHandler.test.ts`'s
// fake-backend unit tests, which exercise the SAME shared
// `playAndReplace`/`replaceCurrentSource` mechanism every command handler
// routes through (commandHandler.ts) — kind-agnostic by construction, so
// combinatorial pairs there (File↔Song, Tone↔Wad) stand in for pairs not
// explicitly duplicated here. What's left in this file is lens presence/
// wiring/census and "does the command dispatch without throwing" —
// genuinely deterministic, no device involved. A few tests were deleted
// outright as PURELY real-time/audibility proofs with no unique wiring
// coverage; see the deletion notes inline and this session's report for
// the full accounting.
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
const WAD_OSCILLATOR_LINES = [WAD_SINE_LINE, WAD_SQUARE_LINE, WAD_SAWTOOTH_LINE, WAD_TRIANGLE_LINE, WAD_NOISE_LINE]

// #47: wad.synth bare-identifier var-ref — one resolvable, one whose
// declaration isn't a valid oscillator config (a lens exists either way —
// the scanner always emits for a bare identifier — but only the first
// actually plays).
const WAD_VAR_RESOLVABLE_LINE = lineOf('new Wad(wadOscillatorConfig)')
const WAD_VAR_UNRESOLVABLE_LINE = lineOf('new Wad(invalidWadConfig)')

// #44's decoy block — recognized `new Wad(...)` instantiations with no
// playable config (mic, a stock preset, sprite segments — none are files
// OR a valid oscillator config). Each surfaces exactly ONE inert
// `Unresolved` lens (the sidecar's `unresolved` wad.synth flavor), never
// a Play and never silence.
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

/** Codicon-title equality tolerant of the cosmetic gap between `$(icon)`
 * and its label — the provider's exact spacing is a visual nit, not part
 * of the contract these tests pin. */
function sameTitle(actual: string | undefined, expected: string): boolean {
  return actual !== undefined && actual.replace(/\s+/g, ' ') === expected.replace(/\s+/g, ' ')
}

function lensAt(lenses: ResolvedLens[], line: number, title: string): ResolvedLens | undefined {
  return lenses.find((l) => l.range.start.line === line && sameTitle(l.command?.title, title))
}

/** Waits until no `$(search) Searching…` resolving lens remains — i.e.
 * every slow fallback search kicked off by this render has settled to
 * `▶ Play` or `$(search) Not Found` — then returns the settled set. The
 * searches are per-session-cached, so only the first render after
 * activation actually waits.
 *
 * This is a single `evaluateInVSCode` call (not a Node-side poll loop):
 * it subscribes to the zzfx CodeLens provider's own `onDidChangeCodeLenses`
 * event — exposed for e2e via `ExtensionApi.zzfxCodeLens`
 * (`tools/vscode/extension/index.ts`) — which is the exact signal
 * `audioFileResolver.ts` fires when its async workspace search settles
 * (see `provider.ts`'s `refresh()`). The subscription is registered
 * BEFORE each re-check of the lens state, so a settle that races the
 * check can never be missed and silently hang the wait forever. No
 * timer/deadline: a genuine hang (a real regression where the search
 * never settles) fails via Playwright's own test timeout, same as
 * `audio-render-gate.spec.ts`'s child-process wait. */
async function fetchSettledLenses(
  evaluateInVSCode: <R, Arg = undefined>(
    fn: (vscodeModule: typeof import('vscode'), arg: Arg) => R | Promise<R>,
    arg?: Arg
  ) => Promise<R>
): Promise<ResolvedLens[]> {
  return evaluateInVSCode(
    async (vscode, arg) => {
      const ext = vscode.extensions.all.find((e) => e.packageJSON.name === '@three-flatland/vscode')
      if (ext && !ext.isActive) await ext.activate()
      const api = ext!.exports as {
        zzfxCodeLens: {
          onDidChangeCodeLenses: (listener: () => void) => import('vscode').Disposable
        }
      }

      const [folder] = vscode.workspace.workspaceFolders ?? []
      const uri = vscode.Uri.joinPath(folder!.uri, arg.file)
      const doc = await vscode.workspace.openTextDocument(uri)
      await vscode.window.showTextDocument(doc)

      type Lens = {
        range: { start: { line: number } }
        command?: { title: string; command: string; arguments?: unknown[] }
      }
      const fetchNow = async (): Promise<Lens[]> => {
        const raw = (await vscode.commands.executeCommand('vscode.executeCodeLensProvider', uri, 100)) as Lens[]
        return raw.map((l) => ({
          range: { start: { line: l.range.start.line } },
          command: l.command,
        }))
      }
      const isSearching = (lenses: Lens[]): boolean =>
        lenses.some((l) => (l.command?.title ?? '').replace(/\s+/g, ' ') === '$(search) Searching…')
      // Subscribes first, THEN returns a promise that resolves on the
      // next refresh — anything that fires while a caller's `fetchNow()`
      // is in flight is still caught, because the listener is already
      // attached before that fetch begins.
      const nextRefresh = (): { promise: Promise<void>; cancel: () => void } => {
        let disposed = false
        let sub: import('vscode').Disposable
        const promise = new Promise<void>((resolve) => {
          sub = api.zzfxCodeLens.onDidChangeCodeLenses(() => {
            if (!disposed) {
              disposed = true
              sub.dispose()
            }
            resolve()
          })
        })
        return {
          promise,
          cancel: () => {
            if (!disposed) {
              disposed = true
              sub.dispose()
            }
          },
        }
      }

      let lenses = await fetchNow()
      while (isSearching(lenses)) {
        const { promise, cancel } = nextRefresh()
        lenses = await fetchNow()
        if (!isSearching(lenses)) {
          cancel()
          break
        }
        await promise
        lenses = await fetchNow()
      }
      return lenses
    },
    { file: SOUNDS_FILE }
  )
}

/** Executes a lens's (or any) command through the real extension host and
 * awaits its full completion — no stats/audibility polling. Proves the
 * command dispatches without throwing; that's the deterministic contract
 * these tests pin now (audibility itself is proven once, offline, by
 * `specs/audio-render-gate.spec.ts`). */
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

/** Waits until a lens titled `title` exists at `line` — still needed for
 * the async resolution states that DO change a lens's presence/arguments
 * (audio.file's searching→resolved/not-found settling, #41), even though
 * playback state no longer does (Play/Stop are now static — see
 * provider.ts's file doc comment).
 *
 * Same causal signal as {@link fetchSettledLenses}: subscribes to the
 * zzfx CodeLens provider's `onDidChangeCodeLenses` event (registered
 * BEFORE each re-check, so a settle racing the check can't be missed)
 * instead of polling to a wall-clock deadline. No fallback return value —
 * every call site expects the lens to eventually appear, so a genuine
 * failure to appear is a real regression and should fail the test via
 * Playwright's own test timeout, not resolve to a silently-wrong
 * `undefined`. */
async function pollLensAt(
  evaluateInVSCode: <R, Arg = undefined>(
    fn: (vscodeModule: typeof import('vscode'), arg: Arg) => R | Promise<R>,
    arg?: Arg
  ) => Promise<R>,
  line: number,
  title: string
): Promise<ResolvedLens> {
  return evaluateInVSCode(
    async (vscode, arg) => {
      const ext = vscode.extensions.all.find((e) => e.packageJSON.name === '@three-flatland/vscode')
      if (ext && !ext.isActive) await ext.activate()
      const api = ext!.exports as {
        zzfxCodeLens: {
          onDidChangeCodeLenses: (listener: () => void) => import('vscode').Disposable
        }
      }
      const [folder] = vscode.workspace.workspaceFolders ?? []
      const uri = vscode.Uri.joinPath(folder!.uri, arg.file)

      type Lens = {
        range: { start: { line: number } }
        command?: { title: string; command: string; arguments?: unknown[] }
      }
      const fetchNow = async (): Promise<Lens[]> => {
        const raw = (await vscode.commands.executeCommand('vscode.executeCodeLensProvider', uri, 100)) as Lens[]
        return raw.map((l) => ({
          range: { start: { line: l.range.start.line } },
          command: l.command,
        }))
      }
      const find = (lenses: Lens[]): Lens | undefined =>
        lenses.find(
          (l) =>
            l.range.start.line === arg.line &&
            l.command?.title !== undefined &&
            l.command.title.replace(/\s+/g, ' ') === arg.title.replace(/\s+/g, ' ')
        )
      const nextRefresh = (): { promise: Promise<void>; cancel: () => void } => {
        let disposed = false
        let sub: import('vscode').Disposable
        const promise = new Promise<void>((resolve) => {
          sub = api.zzfxCodeLens.onDidChangeCodeLenses(() => {
            if (!disposed) {
              disposed = true
              sub.dispose()
            }
            resolve()
          })
        })
        return {
          promise,
          cancel: () => {
            if (!disposed) {
              disposed = true
              sub.dispose()
            }
          },
        }
      }

      let lenses = await fetchNow()
      for (;;) {
        const found = find(lenses)
        if (found) return found
        const { promise, cancel } = nextRefresh()
        lenses = await fetchNow()
        const foundAfterSubscribe = find(lenses)
        if (foundAfterSubscribe) {
          cancel()
          return foundAfterSubscribe
        }
        await promise
        lenses = await fetchNow()
      }
    },
    { file: SOUNDS_FILE, line, title }
  )
}

test.describe('FL Audio: multi-library Play/Stop lenses', () => {
  test('lens set covers zzfx.call, zzfxm.song (varRef + positional + spread), and audio.file (fast tiers + slow tier + not-found) correctly', async ({
    evaluateInVSCode,
  }) => {
    const lenses = await fetchSettledLenses(evaluateInVSCode)
    const titles = lenses.map((l) => l.command?.title ?? null).filter((t): t is string => t !== null)

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
    // get a pair, since wad.synth's unresolvable case has a real
    // declaration whose CONTENT is invalid — only knowable by reading it,
    // so it still gets a Play lens and errors at click time) + 5
    // tone.synth findings (Play+Stop each — 4 literal/no-note positives
    // incl. PluckSynth's AudioWorklet regression guard, plus 1
    // bare-identifier-note var-ref finding that resolves) + 1 tone.synth
    // finding whose var-ref has NO declaration at all (a function
    // parameter — provably unresolvable straight from the sidecar's own
    // parse) getting a single inert `$(question) Unresolved` lens instead
    // of a Play+Stop pair. #44's decoy block (mic/sprite/preset)
    // contributes exactly one inert Unresolved lens per line (the
    // sidecar's `unresolved` wad.synth flavor); the commented-out decoys
    // still contribute ZERO — both proven by the exact total below, not
    // just presence of the positive cases.
    expect(lenses).toHaveLength(51)
    // Play/Stop counts are each down by 1 from the toggle-reversal era —
    // TONE_UNRESOLVABLE_NOTE_LINE no longer gets a Play+Stop pair, just
    // an inert Unresolved lens; the Unresolved total is that one plus the
    // three Wad decoys.
    expect(titles.filter((t) => t === '▶ Play')).toHaveLength(23)
    expect(titles.filter((t) => t === '⏹ Stop')).toHaveLength(21)
    expect(titles.filter((t) => t === '⚙ Edit')).toHaveLength(1)
    expect(titles.filter((t) => t === '⚙ Edit (variable)')).toHaveLength(1)
    expect(titles.filter((t) => sameTitle(t, '$(search) Not Found'))).toHaveLength(1)
    expect(titles.filter((t) => sameTitle(t, '$(question) Unresolved'))).toHaveLength(4)

    // Every zzfxm.song and audio.file Play/Stop pair routes to the right
    // commands, proving provider.ts's per-kind dispatch (not just
    // zzfx.call's pre-existing playParams/openEditor).
    expect(lensAt(lenses, FANFARE_CALL_LINE, '▶ Play')?.command?.command).toBe('threeFlatland.audio.playSong')
    expect(lensAt(lenses, FANFARE_CALL_LINE, '⏹ Stop')?.command?.command).toBe('threeFlatland.audio.stopSong')
    expect(lensAt(lenses, JUMP_SFX_LINE, '▶ Play')?.command?.command).toBe('threeFlatland.audio.playFile')
    expect(lensAt(lenses, JUMP_SFX_LINE, '⏹ Stop')?.command?.command).toBe('threeFlatland.audio.stopSong')
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
      'threeFlatland.audio.playFile'
    )
    expect(lensAt(lenses, MISSING_SFX_LINE, '⏹ Stop')).toBeUndefined()

    // #47: every wad.synth and tone.synth Play/Stop pair routes to its
    // own new command, proving provider.ts's dispatch covers all 5
    // finding kinds now, not just the original 3.
    for (const line of [...WAD_OSCILLATOR_LINES, WAD_VAR_RESOLVABLE_LINE, WAD_VAR_UNRESOLVABLE_LINE]) {
      expect(lensAt(lenses, line, '▶ Play')?.command?.command).toBe('threeFlatland.audio.playWadSynth')
      expect(lensAt(lenses, line, '⏹ Stop')?.command?.command).toBe('threeFlatland.audio.stopSong')
    }
    for (const line of [TONE_NOTE_LINE, TONE_NOISE_LINE, TONE_CHORD_LINE, TONE_PLUCK_LINE, TONE_DYNAMIC_NOTE_LINE]) {
      expect(lensAt(lenses, line, '▶ Play')?.command?.command).toBe('threeFlatland.audio.playToneSynth')
      expect(lensAt(lenses, line, '⏹ Stop')?.command?.command).toBe('threeFlatland.audio.stopSong')
    }

    // No declaration/initializer at all for this var-ref (a function
    // parameter) — provably never playable, so no Play/Stop pair, just a
    // single Unresolved lens wired to `explainUnresolved` (clicking pops an
    // info message about why there's no preview, never a Play that fails).
    expect(lensAt(lenses, TONE_UNRESOLVABLE_NOTE_LINE, '▶ Play')).toBeUndefined()
    expect(lensAt(lenses, TONE_UNRESOLVABLE_NOTE_LINE, '⏹ Stop')).toBeUndefined()
    expect(lensAt(lenses, TONE_UNRESOLVABLE_NOTE_LINE, '$(question) Unresolved')?.command?.command).toBe(
      'threeFlatland.audio.explainUnresolved'
    )
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
    expect(playLens?.command?.command).toBe('threeFlatland.audio.playFile')
    expect(String(playLens?.command?.arguments?.[0])).toMatch(/media[/\\]deep[/\\]thunder\.ogg$/)
  })

  // #41 lazy repair, the full cycle: found → cached → file deleted → Play
  // re-stats, re-searches, comes up empty → lens flips to
  // `$(search) Not Found` → file re-added → clicking the not-found lens
  // (the retry-shaped play attempt) re-searches, finds it, and heals the
  // lens back to ▶ Play with the resolved path. The click's audibility
  // used to be re-proven here too (executeAndPollAudible); that's now the
  // offline gate's job — this test's unique contract is the lens-state
  // repair cycle itself (delete → not-found → re-add → healed ▶ Play),
  // which is deterministic lens census, not audio.
  test('lazy repair: delete → Play flips to not-found; re-add → Play finds and heals back to ▶ Play', async ({
    evaluateInVSCode,
    baseDir,
  }) => {
    const thunderPath = path.join(baseDir, 'media', 'deep', 'thunder.ogg')
    const thunderBytes = fs.readFileSync(thunderPath)

    // Found + cached (possibly already cached by a previous test's search
    // — same session, that's the point of the per-session cache).
    let lenses = await fetchSettledLenses(evaluateInVSCode)
    let playLens = lensAt(lenses, THUNDER_SFX_LINE, '▶ Play')
    expect(playLens?.command?.command).toBe('threeFlatland.audio.playFile')

    // Delete the asset, then attempt Play with the (now stale) cached
    // path — the command must re-stat, re-search, and settle not-found
    // rather than erroring or playing nothing silently.
    fs.rmSync(thunderPath)
    await executeVSCodeCommand(evaluateInVSCode, playLens!.command!.command, playLens!.command!.arguments)
    lenses = await fetchSettledLenses(evaluateInVSCode)
    expect(lensAt(lenses, THUNDER_SFX_LINE, '$(search) Not Found')).toBeDefined()
    expect(lensAt(lenses, THUNDER_SFX_LINE, '▶ Play')).toBeUndefined()

    // Re-add the asset and click the not-found lens — the lazy repair's
    // retry: it re-searches and finds the re-added file.
    fs.mkdirSync(path.dirname(thunderPath), { recursive: true })
    fs.writeFileSync(thunderPath, thunderBytes)
    const notFoundLens = lensAt(lenses, THUNDER_SFX_LINE, '$(search) Not Found')!
    await executeVSCodeCommand(evaluateInVSCode, notFoundLens.command!.command, notFoundLens.command!.arguments)

    // And the lens healed back to ▶ Play at the found path. Stop for test
    // hygiene before the next spec — Play/Stop are static now, so this
    // isn't about hiding a toggled face, just not leaving audio running
    // into the next test.
    await executeVSCodeCommand(evaluateInVSCode, 'threeFlatland.audio.stopSong', [])
    playLens = await pollLensAt(evaluateInVSCode, THUNDER_SFX_LINE, '▶ Play')
    expect(String(playLens?.command?.arguments?.[0])).toMatch(/media[/\\]deep[/\\]thunder\.ogg$/)
  })

  // Z12-style regression guard, extended to files: playBuffer routes
  // through the SAME shared analyser playSampleChannels uses — proving
  // the lens/command wiring here, and that the command dispatches
  // without throwing, is what's pinned now; audibility of the shared
  // output step is the offline gate's job.
  test('playFile (audio.file route) decodes via the real command without throwing', async ({ evaluateInVSCode }) => {
    const lenses = await fetchLenses(evaluateInVSCode)
    const playLens = lensAt(lenses, CLICK_SFX_LINE, '▶ Play')!
    expect(playLens.command?.command).toBe('threeFlatland.audio.playFile')

    await executeVSCodeCommand(evaluateInVSCode, playLens.command!.command, playLens.command!.arguments)
    await executeVSCodeCommand(evaluateInVSCode, 'threeFlatland.audio.stopSong', [])
  })

  // The public/-tier audio.file lens (explosion.ogg) resolving at all IS
  // the proof that audioFileResolver.ts's third tier ran — playFile's
  // decode path is already proven generically by the offline gate (e2e
  // rationing — one lens/wiring proof per tier, audibility proven once).
  test('the public/-tier audio.file lens (explosion.ogg) resolves and routes to playFile', async ({
    evaluateInVSCode,
  }) => {
    const lenses = await fetchLenses(evaluateInVSCode)
    const playLens = lensAt(lenses, EXPLOSION_SFX_LINE, '▶ Play')
    expect(playLens?.command?.command).toBe('threeFlatland.audio.playFile')
    expect(String(playLens?.command?.arguments?.[0])).toMatch(/public[/\\]explosion\.ogg$/)
  })

  // #44 expanded Wad coverage: the convolution-reverb impulse (a file
  // reference TWO object levels down — {reverb:{impulse}}) gets a ▶ Play
  // lens with the resolved real path baked into its arguments. Since #47
  // gave Wad's oscillator/noise keywords their OWN wad.synth finding
  // kind, the TRUE decoy block — mic (live input), sprite segments, and a
  // stock preset — each surfaces exactly one inert `$(question) Unresolved`
  // lens (the sidecar's unresolved wad.synth flavor), asserted per line
  // below. The title uses a NON-BREAKING space between the codicon and text
  // (provider.ts) — a regular space collapses in VS Code's CodeLens
  // rendering, leaving a bare, invisible icon. The general matchers here
  // normalize `\s+` (which includes the nbsp), so the loop ALSO pins the
  // exact U+00A0 (a `toContain` below) to fail on a regression to a plain
  // space rather than only catching it on a human's screen.
  test("Wad reverb impulse (nested 2 levels) gets a resolved ▶ Play lens; Wad's mic/sprite/preset decoys get an inert Unresolved lens each", async ({
    evaluateInVSCode,
  }) => {
    const lenses = await fetchSettledLenses(evaluateInVSCode)

    const playLens = lensAt(lenses, REVERB_SFX_LINE, '▶ Play')
    expect(playLens?.command?.command).toBe('threeFlatland.audio.playFile')
    expect(String(playLens?.command?.arguments?.[0])).toMatch(/src[/\\]click\.wav$/)

    // Recognized-but-unplayable Wad instantiations surface an
    // informational signal, never silence and never a Play that would
    // always fail (#41's principle): exactly one lens per decoy — an
    // Unresolved title wired to `explainUnresolved`, which pops an info
    // message about why there's no preview (never a Play that would fail).
    for (const line of SYNTH_DECOY_LINES) {
      const decoyLenses = lenses.filter((l) => l.range.start.line === line)
      expect(decoyLenses, `synthesis decoy on fixture line ${line} must surface exactly one lens`).toHaveLength(1)
      expect(decoyLenses[0]?.command?.title).toMatch(/\$\(question\)\s+Unresolved/)
      // Exact non-breaking-space guard (CodeRabbit): the `\s+` matcher above
      // would still pass if the provider regressed to a REGULAR space — the
      // exact rendering bug this fixes (VS Code collapses a regular space
      // after a `$(icon)`, hiding the label). Pin the literal U+00A0 so a
      // regression to a plain space fails here, not just on a human's screen.
      expect(decoyLenses[0]?.command?.title).toContain('$(question)\u00A0Unresolved')
      expect(
        decoyLenses[0]?.command?.command,
        'the Unresolved lens is clickable — explains why via an info message'
      ).toBe('threeFlatland.audio.explainUnresolved')
    }
  })

  // STATIC Play+Stop PAIR (stakeholder reversal of #46's toggle — see
  // provider.ts's file doc comment for the full rationale): both lenses
  // are always present, at rest AND while playing, and neither one's
  // title/command ever changes. This is the direct proof of the reverted
  // design — the old toggle spec asserted the OPPOSITE (one lens whose
  // face flips); this asserts the lens SET itself never changes shape.
  // Dispatches Play/Stop directly (no audibility/silence polling — that's
  // the offline gate's job now) since the contract under test is the LENS
  // SET, not whether the sound was heard.
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
    expect(playLens.command?.command).toBe('threeFlatland.audio.playSong')
    expect(stopLens.command?.command).toBe('threeFlatland.audio.stopSong')

    // Play — the lens SET doesn't change at all: same two lenses, same
    // titles, same commands. No refresh-triggered recompute, no face flip.
    await executeVSCodeCommand(evaluateInVSCode, playLens.command!.command, playLens.command!.arguments)
    lenses = await fetchLenses(evaluateInVSCode)
    const whilePlaying = lenses
      .filter((l) => l.range.start.line === LONG_MARCH_CALL_LINE)
      .sort((a, b) => (a.command?.title ?? '').localeCompare(b.command?.title ?? ''))
    expect(whilePlaying).toEqual(atRest)

    // Stop dispatches cleanly — and the lens set is STILL exactly the
    // same afterward. (Stop actually silencing the source is
    // commandHandler.ts's job, deterministically unit-tested there.)
    await executeVSCodeCommand(evaluateInVSCode, 'threeFlatland.audio.stopSong', [])
    lenses = await fetchLenses(evaluateInVSCode)
    const afterStop = lenses
      .filter((l) => l.range.start.line === LONG_MARCH_CALL_LINE)
      .sort((a, b) => (a.command?.title ?? '').localeCompare(b.command?.title ?? ''))
    expect(afterStop).toEqual(atRest)

    // Clicking Stop when nothing is playing is a harmless no-op — the
    // lens is present and clickable regardless of playback state.
    await executeVSCodeCommand(evaluateInVSCode, 'threeFlatland.audio.stopSong', [])
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
    expect(playLens.command?.command).toBe('threeFlatland.audio.playSong')

    const result = await evaluateInVSCode(
      async (vscode, arg) => {
        const ext = vscode.extensions.all.find((e) => e.packageJSON.name === '@three-flatland/vscode')
        if (ext && !ext.isActive) await ext.activate()

        const [folder] = vscode.workspace.workspaceFolders ?? []
        const uri = vscode.Uri.joinPath(folder!.uri, arg.file)

        async function lensPairAt(line: number) {
          const resolved = (await vscode.commands.executeCommand('vscode.executeCodeLensProvider', uri, 100)) as Array<{
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

        await vscode.commands.executeCommand('threeFlatland.audio.stopSong')
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
      { title: '⏹ Stop', command: 'threeFlatland.audio.stopSong' },
      { title: '▶ Play', command: 'threeFlatland.audio.playSong' },
    ]
    expect(result.before).toEqual(expectedPair)
    expect(result.afterRapidFire).toEqual(expectedPair)
    expect(result.afterStop).toEqual(expectedPair)
  })

  // A spread first argument (`zzfxM(...songVar)`) — the canonical
  // zzfxm-tool output shape — resolves the SAME varRef as the bare
  // identifier form (see sidecar/src/parse.rs's extract_zzfxm_call doc
  // comment), so Play resolves through the same songResolver defRange
  // path. This was a graceful-refusal case before the scanner learned
  // spreads; it reads as a bug for the spread form of a variable to
  // refuse while the bare form of the SAME variable plays. The audibility
  // half of this claim is now the offline gate's job; what's pinned here
  // is that the spread form's own lens routes to the same command AND
  // dispatches without throwing (proving resolveSong actually resolved
  // the spread varRef, not just that a lens exists).
  test('a spread zzfxm call (spread-of-identifier varRef) resolves through the real command without throwing', async ({
    evaluateInVSCode,
  }) => {
    const lenses = await fetchLenses(evaluateInVSCode)
    const playLens = lensAt(lenses, FANFARE_SPREAD_CALL_LINE, '▶ Play')!
    expect(playLens.command?.command).toBe('threeFlatland.audio.playSong')

    await executeVSCodeCommand(evaluateInVSCode, playLens.command!.command, playLens.command!.arguments)
    await executeVSCodeCommand(evaluateInVSCode, 'threeFlatland.audio.stopSong', [])
  })
})
