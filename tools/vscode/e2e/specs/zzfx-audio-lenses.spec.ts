// A-series: multi-library audio Play/Stop lenses — zzfxm.song and
// audio.file findings surface real, working ▶ Play / ⏹ Stop CodeLenses,
// not just zzfx.call (Z9's original scope). See src/sounds.ts's "A-series
// fixtures" section for the exact positive/negative cases this drives.
import { expect, test } from '../fixtures'

const SOUNDS_FILE = 'src/sounds.ts'

// 0-indexed lines — see src/sounds.ts's "A-series fixtures" section.
const FANFARE_CALL_LINE = 111 // zzfxm(fanfareSong) — bare-identifier varRef
const CHIPTUNE_CALL_LINE = 117 // zzfxm([...], [...], [...]) — positional literal
const FANFARE_SPREAD_CALL_LINE = 128 // zzfxM(...fanfareSong) — graceful refusal
const JUMP_SFX_LINE = 137 // audioLoader.load('sounds/jump.wav') — workspace-root tier
const CLICK_SFX_LINE = 143 // new Howl({ src: ['click.wav'] }) — source-dir tier
const EXPLOSION_SFX_LINE = 149 // new Wad({ source: 'explosion.ogg' }) — public/ tier

type LensCommand = { command: string; title: string; arguments?: unknown[] }
type ResolvedLens = { range: { start: { line: number } }; command?: LensCommand }

type ExtensionApi = {
  zzfxPlay: {
    getActivePid: () => number | undefined
    shutdown: () => Promise<void>
    getStats: () => Promise<{ peak: number; silent: boolean } | undefined>
  }
}

async function activateExtension(vscode: typeof import('vscode')): Promise<ExtensionApi> {
  const ext = vscode.extensions.all.find((e) => e.packageJSON.name === '@three-flatland/vscode')
  if (!ext) throw new Error('extension not found')
  if (!ext.isActive) await ext.activate()
  return ext.exports as ExtensionApi
}

async function fetchLenses(
  evaluateInVSCode: <R, Arg = undefined>(
    fn: (vscodeModule: typeof import('vscode'), arg: Arg) => R | Promise<R>,
    arg?: Arg
  ) => Promise<R>
): Promise<ResolvedLens[]> {
  return evaluateInVSCode(
    async (vscode, arg) => {
      await activateExtension(vscode)
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

test.describe('FL Audio: multi-library Play/Stop lenses', () => {
  test('lens set covers zzfx.call, zzfxm.song (varRef + positional + spread), and audio.file (resolvable + unresolvable) correctly', async ({
    evaluateInVSCode,
  }) => {
    const lenses = await fetchLenses(evaluateInVSCode)
    const titles = lenses
      .map((l) => l.command?.title ?? null)
      .filter((t): t is string => t !== null)

    // 2 zzfx.call findings (Play+Edit each) + 3 zzfxm.song findings
    // (Play+Stop each) + 3 RESOLVABLE audio.file findings (Play each).
    // playMissingSfx's unresolvable path and every commented-out decoy
    // must contribute ZERO lenses — proven by the exact total below, not
    // just presence of the positive cases.
    expect(lenses).toHaveLength(13)
    expect(titles.filter((t) => t === '▶ Play')).toHaveLength(8)
    expect(titles.filter((t) => t === '⏹ Stop')).toHaveLength(3)
    expect(titles.filter((t) => t === '⚙ Edit')).toHaveLength(1)
    expect(titles.filter((t) => t === '⚙ Edit (variable)')).toHaveLength(1)

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

    // Unresolvable path (playMissingSfx) — no lens at that line at all.
    expect(lenses.some((l) => l.range.start.line === 156)).toBe(false)
  })

  test('playSong (bare-identifier varRef route) produces real audio via the stats tap, and stopSong actually stops it', async ({
    evaluateInVSCode,
  }) => {
    const lenses = await fetchLenses(evaluateInVSCode)
    const playLens = lensAt(lenses, FANFARE_CALL_LINE, '▶ Play')!
    const stopLens = lensAt(lenses, FANFARE_CALL_LINE, '⏹ Stop')!

    const playStats = await evaluateInVSCode(
      async (vscode, arg) => {
        const api = await activateExtension(vscode)
        await vscode.commands.executeCommand(arg.command, ...(arg.args ?? []))
        const deadline = Date.now() + 5000
        let last: Awaited<ReturnType<typeof api.zzfxPlay.getStats>>
        while (Date.now() < deadline) {
          last = await api.zzfxPlay.getStats()
          if (last && !last.silent) return last
          await new Promise((resolve) => setTimeout(resolve, 100))
        }
        return last
      },
      { command: playLens.command!.command, args: playLens.command!.arguments }
    )
    expect(playStats).toBeDefined()
    expect(playStats!.silent).toBe(false)
    expect(playStats!.peak).toBeGreaterThan(0)

    const silentAfterStop = await evaluateInVSCode(
      async (vscode, arg) => {
        const api = await activateExtension(vscode)
        await vscode.commands.executeCommand(arg.command, ...(arg.args ?? []))
        const deadline = Date.now() + 5000
        let last: Awaited<ReturnType<typeof api.zzfxPlay.getStats>>
        while (Date.now() < deadline) {
          last = await api.zzfxPlay.getStats()
          if (last && last.silent) return true
          await new Promise((resolve) => setTimeout(resolve, 100))
        }
        return false
      },
      { command: stopLens.command!.command, args: stopLens.command!.arguments }
    )
    expect(silentAfterStop).toBe(true)
  })

  test('playSong (true positional literal route, no varRef) also resolves and plays real audio', async ({
    evaluateInVSCode,
  }) => {
    const lenses = await fetchLenses(evaluateInVSCode)
    const playLens = lensAt(lenses, CHIPTUNE_CALL_LINE, '▶ Play')!

    const stats = await evaluateInVSCode(
      async (vscode, arg) => {
        const api = await activateExtension(vscode)
        await vscode.commands.executeCommand(arg.command, ...(arg.args ?? []))
        const deadline = Date.now() + 5000
        let last: Awaited<ReturnType<typeof api.zzfxPlay.getStats>>
        while (Date.now() < deadline) {
          last = await api.zzfxPlay.getStats()
          if (last && !last.silent) return last
          await new Promise((resolve) => setTimeout(resolve, 100))
        }
        return last
      },
      { command: playLens.command!.command, args: playLens.command!.arguments }
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

    const stats = await evaluateInVSCode(
      async (vscode, arg) => {
        const api = await activateExtension(vscode)
        await vscode.commands.executeCommand(arg.command, ...(arg.args ?? []))
        const deadline = Date.now() + 5000
        let last: Awaited<ReturnType<typeof api.zzfxPlay.getStats>>
        while (Date.now() < deadline) {
          last = await api.zzfxPlay.getStats()
          if (last && !last.silent) return last
          await new Promise((resolve) => setTimeout(resolve, 100))
        }
        return last
      },
      { command: playLens.command!.command, args: playLens.command!.arguments }
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

  // Graceful-refusal UX: a spread first argument (`zzfxM(...songVar)`)
  // does not resolve a varRef (see sidecar/src/parse.rs's
  // extract_zzfxm_call doc comment) and its raw argRange text isn't a
  // parseable song literal either — Play must not crash the extension
  // host and must not produce audio, only a loadError message.
  test('a spread zzfxm call (no varRef, unparseable argRange) refuses gracefully — no crash, no audio', async ({
    evaluateInVSCode,
  }) => {
    const lenses = await fetchLenses(evaluateInVSCode)
    const playLens = lensAt(lenses, FANFARE_SPREAD_CALL_LINE, '▶ Play')!
    expect(playLens.command?.command).toBe('threeFlatland.zzfx.playSong')

    const result = await evaluateInVSCode(
      async (vscode, arg) => {
        const api = await activateExtension(vscode)
        let threw = false
        try {
          await vscode.commands.executeCommand(arg.command, ...(arg.args ?? []))
        } catch {
          threw = true
        }
        await new Promise((resolve) => setTimeout(resolve, 500))
        const stats = await api.zzfxPlay.getStats()
        return { threw, stats }
      },
      { command: playLens.command!.command, args: playLens.command!.arguments }
    )
    expect(result.threw).toBe(false)
    // Silent (or undefined if no sidecar ever spawned this test run) —
    // either way, nothing audible played from the refused call.
    if (result.stats) expect(result.stats.silent).toBe(true)
  })
})
