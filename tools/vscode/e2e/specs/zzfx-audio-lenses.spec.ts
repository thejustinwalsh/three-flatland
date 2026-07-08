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
const JUMP_SFX_LINE = lineOf("audioLoader.load('sounds/jump.wav')") // workspace-root tier
const CLICK_SFX_LINE = lineOf("new Howl({ src: ['click.wav'] })") // source-dir tier
const EXPLOSION_SFX_LINE = lineOf("new Wad({ source: 'explosion.ogg' })") // public/ tier
const THUNDER_SFX_LINE = lineOf("new Audio('thunder.ogg')") // slow-search tier only
const MISSING_SFX_LINE = lineOf("new Audio('nonexistent-sound.mp3')") // → $(search) not found

type LensCommand = { command: string; title: string; arguments?: unknown[] }
type ResolvedLens = { range: { start: { line: number } }; command?: LensCommand }

type PlaybackStats = { peak: number; silent: boolean }
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

/** Polls {@link fetchLenses} until no `$(search) …` resolving lens
 * remains — i.e. every slow fallback search kicked off by this render has
 * settled to `▶ Play` or `$(search) not found` — then returns the settled
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
  while (lenses.some((l) => l.command?.title === '$(search) …') && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 150))
    lenses = await fetchLenses(evaluateInVSCode)
  }
  return lenses
}

/** Executes `command`/`args` (a resolved lens's own command), then polls
 * `zzfxPlay.getStats()` until it reports audible (`!silent`) or the
 * deadline passes. Self-contained — see the file doc comment. */
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
      const deadline = Date.now() + 5000
      let last: PlaybackStats | undefined
      while (Date.now() < deadline) {
        last = await api.zzfxPlay.getStats()
        if (last && !last.silent) return last
        await new Promise((resolve) => setTimeout(resolve, 100))
      }
      return last
    },
    { command, args }
  )
}

/** Same shape as {@link executeAndPollAudible} but polls for `silent`
 * instead — the stopSong verification. */
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
      const deadline = Date.now() + 5000
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

test.describe('FL Audio: multi-library Play/Stop lenses', () => {
  test('lens set covers zzfx.call, zzfxm.song (varRef + positional + spread), and audio.file (fast tiers + slow tier + not-found) correctly', async ({
    evaluateInVSCode,
  }) => {
    const lenses = await fetchSettledLenses(evaluateInVSCode)
    const titles = lenses
      .map((l) => l.command?.title ?? null)
      .filter((t): t is string => t !== null)

    // 2 zzfx.call findings (Play+Edit each) + 3 zzfxm.song findings
    // (Play+Stop each) + 4 RESOLVABLE audio.file findings (Play each — 3
    // fast tiers + thunder.ogg via the slow search) + playMissingSfx's
    // `$(search) not found` informational lens. Every commented-out decoy
    // must contribute ZERO lenses — proven by the exact total below, not
    // just presence of the positive cases.
    expect(lenses).toHaveLength(15)
    expect(titles.filter((t) => t === '▶ Play')).toHaveLength(9)
    expect(titles.filter((t) => t === '⏹ Stop')).toHaveLength(3)
    expect(titles.filter((t) => t === '⚙ Edit')).toHaveLength(1)
    expect(titles.filter((t) => t === '⚙ Edit (variable)')).toHaveLength(1)
    expect(titles.filter((t) => t === '$(search) not found')).toHaveLength(1)

    // Every zzfxm.song and audio.file lens routes to the new commands,
    // proving provider.ts's per-kind dispatch (not just zzfx.call's
    // pre-existing playParams/openEditor).
    expect(lensAt(lenses, FANFARE_CALL_LINE, '▶ Play')?.command?.command).toBe(
      'threeFlatland.zzfx.playSong'
    )
    expect(lensAt(lenses, FANFARE_CALL_LINE, '⏹ Stop')?.command?.command).toBe(
      'threeFlatland.zzfx.stopSong'
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
    // `$(search) not found` lens, not silent absence (#41).
    expect(lensAt(lenses, MISSING_SFX_LINE, '$(search) not found')?.command?.command).toBe(
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
  // `$(search) not found` → file re-added → clicking the not-found lens
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
    expect(lensAt(lenses, THUNDER_SFX_LINE, '$(search) not found')).toBeDefined()
    expect(lensAt(lenses, THUNDER_SFX_LINE, '▶ Play')).toBeUndefined()

    // Re-add the asset and click the not-found lens — the lazy repair's
    // retry: it re-searches, finds the re-added file, and plays it for
    // real (audibility via the same stats tap as every other route).
    fs.mkdirSync(path.dirname(thunderPath), { recursive: true })
    fs.writeFileSync(thunderPath, thunderBytes)
    const notFoundLens = lensAt(lenses, THUNDER_SFX_LINE, '$(search) not found')!
    const stats = await executeAndPollAudible(
      evaluateInVSCode,
      notFoundLens.command!.command,
      notFoundLens.command!.arguments
    )
    expect(stats).toBeDefined()
    expect(stats!.silent).toBe(false)
    expect(stats!.peak).toBeGreaterThan(0)

    // And the lens healed back to ▶ Play at the found path.
    lenses = await fetchSettledLenses(evaluateInVSCode)
    playLens = lensAt(lenses, THUNDER_SFX_LINE, '▶ Play')
    expect(String(playLens?.command?.arguments?.[0])).toMatch(/media[/\\]deep[/\\]thunder\.ogg$/)
  })

  test('playSong (bare-identifier varRef route) produces real audio via the stats tap, and stopSong actually stops it', async ({
    evaluateInVSCode,
  }) => {
    const lenses = await fetchLenses(evaluateInVSCode)
    const playLens = lensAt(lenses, FANFARE_CALL_LINE, '▶ Play')!
    const stopLens = lensAt(lenses, FANFARE_CALL_LINE, '⏹ Stop')!

    const playStats = await executeAndPollAudible(
      evaluateInVSCode,
      playLens.command!.command,
      playLens.command!.arguments
    )
    expect(playStats).toBeDefined()
    expect(playStats!.silent).toBe(false)
    expect(playStats!.peak).toBeGreaterThan(0)

    const silentAfterStop = await executeAndPollSilent(
      evaluateInVSCode,
      stopLens.command!.command,
      stopLens.command!.arguments
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
