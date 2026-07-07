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
 * then. Both packages run completely unmodified past this point — no
 * synth port, zero fidelity drift from what the studio webview (Web
 * Audio in a real browser context) produces.
 */
import 'node-web-audio-api/polyfill.js'
import * as readline from 'node:readline'
import { zzfx, ZZFX } from 'zzfx'
import { zzfxm } from '@zzfx-studio/zzfxm'
import type { Command, Response, Song } from './protocol.js'

let currentSong: AudioBufferSourceNode | undefined

function send(response: Response): void {
  process.stdout.write(`${JSON.stringify(response)}\n`)
}

function handlePlay(params: number[]): void {
  zzfx(...params)
}

function handlePlaySong(song: Song): void {
  currentSong?.stop()
  currentSong = zzfxm(song.instruments, song.patterns, song.sequence, song.bpm)
}

function handleStopSong(): void {
  currentSong?.stop()
  currentSong = undefined
}

// Distinct from stopSong in the protocol so a future "stop everything"
// affordance (e.g. on panel close, or a global hotkey) has a command to
// grow into without a protocol change — one-shots are typically <1s with
// their own release envelope and have no persistent handle to interrupt
// today, so this is presently identical to stopSong.
function handleStop(): void {
  handleStopSong()
}

function handleCommand(command: Command): void {
  switch (command.cmd) {
    case 'play':
      handlePlay(command.params)
      send({ ok: true, cmd: 'play' })
      return
    case 'playSong':
      handlePlaySong(command.song)
      send({ ok: true, cmd: 'playSong' })
      return
    case 'stopSong':
      handleStopSong()
      send({ ok: true, cmd: 'stopSong' })
      return
    case 'stop':
      handleStop()
      send({ ok: true, cmd: 'stop' })
      return
    case 'shutdown':
      send({ ok: true, cmd: 'shutdown' })
      process.exit(0)
  }
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

  try {
    handleCommand(command)
  } catch (err) {
    send({ ok: false, cmd: command.cmd, error: err instanceof Error ? err.message : String(err) })
  }
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
