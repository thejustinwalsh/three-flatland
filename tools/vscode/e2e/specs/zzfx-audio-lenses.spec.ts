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

// #44's synthesis-vocabulary decoy block — every line must surface ZERO
// lenses (no file involved: oscillator shapes, noise, mic, sprite
// segments, a stock preset).
const SYNTH_DECOY_LINES = [
  "new Wad({ source: 'square' })",
  "new Wad({ source: 'sawtooth' })",
  "new Wad({ source: 'triangle' })",
  "new Wad({ source: 'noise' })",
  "new Wad({ source: 'mic' })",
  'new Wad({ sprite: { hello: [0, 0.4] } })',
  'new Wad(Wad.presets.hiHatClosed)',
].map(lineOf)

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

/** One stats snapshot — used to derive lens-poll deadlines from the
 * current source's own reported timing (#43). */
async function getStatsOnce(
  evaluateInVSCode: <R, Arg = undefined>(
    fn: (vscodeModule: typeof import('vscode'), arg: Arg) => R | Promise<R>,
    arg?: Arg
  ) => Promise<R>
): Promise<PlaybackStats | undefined> {
  return evaluateInVSCode(async (vscode) => {
    const ext = vscode.extensions.all.find((e) => e.packageJSON.name === '@three-flatland/vscode')
    if (ext && !ext.isActive) await ext.activate()
    return (ext!.exports as ExtensionApi).zzfxPlay.getStats()
  })
}

/** Polls {@link fetchLenses} until a lens titled `title` exists at
 * `line` — the #46 toggle's face changes land via onDidChangeCodeLenses,
 * asynchronously to the command that caused them. Returns `undefined`
 * once `timeoutMs` passes without one. */
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

    // 2 zzfx.call findings (Play+Edit each) + 4 zzfxm.song findings (ONE
    // toggling Play⇄Stop lens each — #46 collapsed the old Play+Stop
    // pair; incl. #43's long song) + 5 RESOLVABLE audio.file findings
    // (Play each — 3 fast tiers + #44's reverb impulse + thunder.ogg via
    // the slow search) + playMissingSfx's `$(search) Not Found`
    // informational lens. Every decoy — the commented-out ones AND #44's
    // uncommented synthesis block — must contribute ZERO lenses, proven
    // by the exact total below, not just presence of the positive cases.
    expect(lenses).toHaveLength(14)
    expect(titles.filter((t) => t === '▶ Play')).toHaveLength(11)
    // Nothing is playing — the toggle renders ⏹ Stop nowhere at rest.
    expect(titles.filter((t) => t === '⏹ Stop')).toHaveLength(0)
    expect(titles.filter((t) => t === '⚙ Edit')).toHaveLength(1)
    expect(titles.filter((t) => t === '⚙ Edit (variable)')).toHaveLength(1)
    expect(titles.filter((t) => t === '$(search) Not Found')).toHaveLength(1)

    // Every zzfxm.song and audio.file lens routes to the new commands,
    // proving provider.ts's per-kind dispatch (not just zzfx.call's
    // pre-existing playParams/openEditor).
    expect(lensAt(lenses, FANFARE_CALL_LINE, '▶ Play')?.command?.command).toBe(
      'threeFlatland.zzfx.playSong'
    )
    expect(lensAt(lenses, JUMP_SFX_LINE, '▶ Play')?.command?.command).toBe(
      'threeFlatland.zzfx.playFile'
    )
    // The resolved absolute path is baked into the lens's own command
    // arguments — proving audioFileResolver.ts's workspace-root tier
    // actually ran and found the file, not just that a lens exists.
    const jumpArgs = lensAt(lenses, JUMP_SFX_LINE, '▶ Play')?.command?.arguments
    expect(String(jumpArgs?.[0])).toMatch(/sounds[/\\]jump\.wav$/)

    // Unresolvable path (playMissingSfx) — an informational
    // `$(search) Not Found` lens, not silent absence (#41).
    expect(lensAt(lenses, MISSING_SFX_LINE, '$(search) Not Found')?.command?.command).toBe(
      'threeFlatland.zzfx.playFile'
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
    // still-running playback first — since #46's toggle the finding's
    // lens face reads ⏹ Stop WHILE its sound plays, and this assertion
    // is about the resolver's healed path, not the playback state.
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

    // Since #46's toggle there is no at-rest ⏹ Stop lens to grab — this
    // executes the exact command the toggled lens carries while playing
    // (see the toggle spec below for the lens-face assertions).
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
  // lens with the resolved real path baked into its arguments, while the
  // full synthesis vocabulary (square/sawtooth/triangle/noise/mic),
  // sprite segments, and a stock preset — all uncommented, all live code
  // — surface ZERO lenses, asserted per line, not just via the exact
  // total above. Audibility for the click.wav path is already proven by
  // the .wav playFile test (e2e rationing — one audibility proof per
  // output path).
  test("Wad reverb impulse (nested 2 levels) gets a resolved ▶ Play lens; Wad's synthesis modes get none", async ({
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
    // Since #46's toggle, ⏹ Stop only exists WHILE playing — this test's
    // stop phase executes the command the toggled lens carries (the
    // toggle spec below asserts the lens faces themselves).

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

  // #46 TOGGLE: song and file findings carry ONE lens whose face follows
  // the active playback — ▶ Play at rest, ⏹ Stop while THAT finding's
  // sound plays, back to ▶ Play on a manual stop (immediately), on a
  // replacement play (the new sound steals the active slot), or at the
  // natural end (the stats.playing watcher — no click anywhere).
  test('Play⇄Stop toggle (#46): ⏹ Stop while playing, steals to a new sound, immediate revert on stop, auto-revert at the natural end', async ({
    evaluateInVSCode,
  }) => {
    // At rest: exactly ONE lens on the long-song line, and it's ▶ Play.
    let lenses = await fetchLenses(evaluateInVSCode)
    const atRest = lenses.filter((l) => l.range.start.line === LONG_MARCH_CALL_LINE)
    expect(atRest).toHaveLength(1)
    expect(atRest[0]!.command?.title).toBe('▶ Play')
    const playLens = atRest[0]!

    // Play → THIS finding's lens toggles to ⏹ Stop; every other song
    // lens stays ▶ Play; the line's ▶ Play face is gone (one lens, one
    // face — not a second lens appearing).
    await executeAndPollAudible(
      evaluateInVSCode,
      playLens.command!.command,
      playLens.command!.arguments
    )
    const stopLens = await pollLensAt(evaluateInVSCode, LONG_MARCH_CALL_LINE, '⏹ Stop')
    expect(stopLens?.command?.command).toBe('threeFlatland.zzfx.stopSong')
    lenses = await fetchLenses(evaluateInVSCode)
    expect(lensAt(lenses, LONG_MARCH_CALL_LINE, '▶ Play')).toBeUndefined()
    expect(lensAt(lenses, FANFARE_CALL_LINE, '▶ Play')).toBeDefined()
    expect(lensAt(lenses, FANFARE_CALL_LINE, '⏹ Stop')).toBeUndefined()

    // A NEW sound — the click.wav audio.file lens — steals the active
    // slot: the song's lens reverts without anyone clicking its stop
    // (and proves playFile marks its own finding active, cross-kind).
    const clickLens = lensAt(lenses, CLICK_SFX_LINE, '▶ Play')!
    await executeVSCodeCommand(
      evaluateInVSCode,
      clickLens.command!.command,
      clickLens.command!.arguments
    )
    expect(await pollLensAt(evaluateInVSCode, LONG_MARCH_CALL_LINE, '▶ Play')).toBeDefined()

    // Stop mid-play reverts immediately: play again, click the toggled
    // ⏹ Stop, the lens is ▶ Play again well before the 7.68s natural end.
    await executeAndPollAudible(
      evaluateInVSCode,
      playLens.command!.command,
      playLens.command!.arguments
    )
    const stopAgain = await pollLensAt(evaluateInVSCode, LONG_MARCH_CALL_LINE, '⏹ Stop')
    expect(stopAgain).toBeDefined()
    await executeVSCodeCommand(
      evaluateInVSCode,
      stopAgain!.command!.command,
      stopAgain!.command!.arguments
    )
    expect(await pollLensAt(evaluateInVSCode, LONG_MARCH_CALL_LINE, '▶ Play')).toBeDefined()

    // Auto-revert: play once more and let it END NATURALLY — no stop
    // click anywhere; the watcher clears off #43's stats.playing. The
    // wait cap derives from the source's own reported remaining window.
    await executeAndPollAudible(
      evaluateInVSCode,
      playLens.command!.command,
      playLens.command!.arguments
    )
    expect(await pollLensAt(evaluateInVSCode, LONG_MARCH_CALL_LINE, '⏹ Stop')).toBeDefined()
    const stats = await getStatsOnce(evaluateInVSCode)
    const remainingMs = stats
      ? Math.max(0, (stats.durationSeconds - stats.elapsedSeconds) * 1000)
      : 10_000
    expect(
      await pollLensAt(evaluateInVSCode, LONG_MARCH_CALL_LINE, '▶ Play', remainingMs + 3000)
    ).toBeDefined()
  })

  // #46 SOURCE-EDITOR BINDING: a playing sound belongs to its source
  // document. Phase 1 exercises the switch listener (a DIFFERENT doc
  // becomes the active editor); phase 2 makes the source the ONLY open
  // editor and closes it, which routes through onDidCloseTextDocument —
  // the switch listener sees `undefined` then and deliberately ignores
  // it (a terminal/panel focus must never false-stop). Both phases prove
  // the stop landed MID-playback (silence observed while
  // elapsed < duration), same discipline as the #43 spec.
  test('source binding (#46): switching to another document stops the sound; closing the source document stops it too', async ({
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
    // And the lens reverted (pollLensAt re-shows the source doc — fine,
    // the sound is already stopped).
    expect(await pollLensAt(evaluateInVSCode, LONG_MARCH_CALL_LINE, '▶ Play')).toBeDefined()

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
