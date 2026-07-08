/**
 * The sidecar entry point — spawned by `client.ts` as
 * `child_process.spawn(process.execPath, [thisFile], { env: { ...,
 * ELECTRON_RUN_AS_NODE: '1' } })`, run from *inside* the real VS Code
 * extension host. `process.execPath`, read from within the extension
 * host, already resolves to `Code Helper (Plugin)` (the utility-process
 * binary VS Code itself spawns Node-mode children from) — that binary
 * carries the `com.apple.security.cs.disable-library-validation`
 * entitlement the main `Code`/Electron binary does NOT have, which is
 * what makes loading node-web-audio-api's unsigned prebuilt `.node`
 * binary possible at all on macOS's hardened runtime. See
 * `tools/zzfx-play/CLAUDE.md` for the full prototype-gate writeup — this
 * comment is the load-bearing "why," not decoration.
 *
 * Importing the polyfill FIRST (before `zzfx`/`@zzfx-studio/zzfxm`) is
 * required: `zzfx`'s `ZZFX.audioContext = new AudioContext` runs at
 * *module load time*, so `AudioContext` must already be a real global by
 * then.
 *
 * Synthesis stays real, unmodified upstream zzfx/zzfxm — `ZZFX.buildSamples`
 * and `ZZFXM.build` are pure numeric waveform generation, no AudioContext
 * touch at all, so calling them directly (instead of the `zzfx()`/`zzfxm()`
 * convenience wrappers) is zero fidelity drift from what those packages
 * produce. Only the OUTPUT step — samples into a playable buffer — is
 * replaced, in `player.ts`, because `node-web-audio-api`'s `AudioBuffer`
 * doesn't support the get-then-mutate pattern those wrappers rely on (see
 * that file's doc comment for the root cause).
 *
 * The command state machine itself (song replacement, stop semantics)
 * lives in `commandHandler.ts`, injected with this real zzfx/zzfxm-backed
 * `AudioBackend` — see that file's tests for the state machine covered
 * without a real `AudioContext`. This file is only the stdin/stdout
 * wiring + the one real backend implementation.
 */
import 'node-web-audio-api/polyfill.js'
import * as readline from 'node:readline'
import { ZZFX } from 'zzfx'
import { ZZFXM } from '@zzfx-studio/zzfxm'
import type { Command, Response } from './protocol.js'
import { createCommandHandler } from './commandHandler.js'
import { getPlaybackStats, playSampleChannels } from './player.js'

const handler = createCommandHandler({
  play: (params) => {
    playSampleChannels([ZZFX.buildSamples(...params)])
  },
  playSong: (song) =>
    playSampleChannels(ZZFXM.build(song.instruments, song.patterns, song.sequence, song.bpm)),
  getStats: () => getPlaybackStats(),
})

function send(response: Response): void {
  process.stdout.write(`${JSON.stringify(response)}\n`)
}

const rl = readline.createInterface({ input: process.stdin })

rl.on('line', (line) => {
  const trimmed = line.trim()
  if (!trimmed) return

  let command: Command
  try {
    command = JSON.parse(trimmed) as Command
  } catch (err) {
    process.stderr.write(
      `zzfx-play: malformed command (not JSON): ${trimmed} (${err instanceof Error ? err.message : String(err)})\n`
    )
    return
  }

  const response = handler.handleCommand(command)
  send(response)
  if (command.cmd === 'shutdown') process.exit(0)
})

// stdin closing means the parent (extension host) is gone or the pipe
// broke — exit rather than lingering as an orphan holding a real audio
// device open.
rl.on('close', () => {
  process.exit(0)
})

// Surface that this connected to a real device, on stderr only (never
// stdout — stdout is exclusively the newline-JSON response channel the
// client parses line-by-line).
process.stderr.write(`zzfx-play: ready (AudioContext state: ${ZZFX.audioContext.state})\n`)
