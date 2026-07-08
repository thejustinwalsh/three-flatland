#!/usr/bin/env node
// Minimal stand-in for the real sidecar.js, used to test PlaySidecarClient's
// spawn/reuse/lifecycle plumbing without depending on node-web-audio-api or
// a real audio device (or ELECTRON_RUN_AS_NODE — this fixture runs under
// plain `process.execPath` in tests, exactly like codelens-service's
// fakeSidecar.mjs). Speaks the real newline-JSON protocol (see
// protocol.ts) but never touches audio.
//
// Behavior switches (HANG_ON_SHUTDOWN) go through an env var, not a CLI
// arg — PlaySidecarClient's public options only accept `env`, not extra
// spawn args (unlike codelens-service's client, which has no test-only
// surface to add for this).

import * as readline from 'node:readline'

const HANG_ON_SHUTDOWN = process.env.FAKE_PLAY_SIDECAR_HANG_ON_SHUTDOWN === '1'
const STATS_ERROR = process.env.FAKE_PLAY_SIDECAR_STATS_ERROR === '1'

function send(response) {
  process.stdout.write(`${JSON.stringify(response)}\n`)
}

const rl = readline.createInterface({ input: process.stdin })

let statsRequests = 0

rl.on('line', (line) => {
  const trimmed = line.trim()
  if (!trimmed) return
  const command = JSON.parse(trimmed)

  switch (command.cmd) {
    case 'play':
      // Sentinel: a real client can only ever send well-formed Command
      // shapes (it's typed), so a Nack path needs a trigger reachable
      // through the real public play() method rather than a fake
      // out-of-protocol command.
      if (command.params[0] === -999) {
        send({ ok: false, cmd: 'play', error: 'boom requested' })
        return
      }
      send({ ok: true, cmd: 'play' })
      return
    case 'playSong':
      send({ ok: true, cmd: 'playSong' })
      return
    case 'playFile':
      // No-op ack — this fixture never touches audio/decodeAudioData, so
      // there's nothing to actually decode here (see client.test.ts).
      send({ ok: true, cmd: 'playFile' })
      return
    case 'playToneSynth':
      // No-op ack — this fixture never touches tone/web-audio-daw (see
      // client.test.ts); it only proves the wire message reaches here.
      send({ ok: true, cmd: 'playToneSynth' })
      return
    case 'playWadSynth':
      send({ ok: true, cmd: 'playWadSynth' })
      return
    case 'stopSong':
      send({ ok: true, cmd: 'stopSong' })
      return
    case 'stop':
      send({ ok: true, cmd: 'stop' })
      return
    case 'shutdown':
      send({ ok: true, cmd: 'shutdown' })
      if (!HANG_ON_SHUTDOWN) process.stdout.end(() => process.exit(0))
      return
    case 'stats':
      if (STATS_ERROR) {
        send({ ok: false, cmd: 'stats', error: 'analyser unavailable' })
        return
      }
      // elapsedSeconds advances 0.5 per request — the observable that
      // lets client.test.ts prove response PAIRING under concurrent
      // getStats() calls (mispaired callers would all read the same
      // first response), not just that each got A response.
      statsRequests += 1
      send({
        ok: true,
        cmd: 'stats',
        stats: {
          peak: 0.5,
          silent: false,
          playing: true,
          durationSeconds: 2,
          elapsedSeconds: 0.5 * statsRequests,
        },
      })
      return
    default:
      process.stderr.write(`fakePlaySidecar: unknown cmd ${command.cmd}\n`)
  }
})

process.stderr.write('fakePlaySidecar: ready\n')
