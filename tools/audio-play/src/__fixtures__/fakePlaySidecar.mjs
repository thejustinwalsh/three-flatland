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
// Swallow the FIRST stats/playToneSynth request without ever responding —
// the "lost response" failure mode client.test.ts's timeout tests need.
// Later requests of the same kind answer normally, so the same run can
// prove the serialization chain unwedges after the timeout.
const DROP_FIRST_STATS = process.env.FAKE_PLAY_SIDECAR_DROP_FIRST_STATS === '1'
const DROP_FIRST_TONE = process.env.FAKE_PLAY_SIDECAR_DROP_FIRST_TONE === '1'
// Respond to the FIRST stats request only after this many ms — the "LATE
// (not dropped) response" failure mode: the caller times out, and its
// response still arrives afterwards, IN ORDER, ahead of later responses
// (the real sidecar's strict stdin-order guarantee — which is exactly
// what makes a late response land in front of the next caller's).
const DELAY_FIRST_STATS_MS = Number(process.env.FAKE_PLAY_SIDECAR_DELAY_FIRST_STATS ?? 0)

function send(response) {
  process.stdout.write(`${JSON.stringify(response)}\n`)
}

// Preserves the real sidecar's response ORDERING even when one response
// is artificially delayed — later responses queue behind it rather than
// overtaking it (overtaking would break the strict-order premise the
// delay mode exists to test against).
let sendChain = Promise.resolve()
function sendOrdered(response, delayMs = 0) {
  sendChain = sendChain.then(async () => {
    if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs))
    send(response)
  })
}

// Echo the request's id (if any) back on its response — mirrors the real
// sidecar's id echo (see protocol.ts / sidecar.ts).
function withEcho(command, response) {
  return command.id !== undefined ? { ...response, id: command.id } : response
}

const rl = readline.createInterface({ input: process.stdin })

let statsRequests = 0
let toneRequests = 0

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
      toneRequests += 1
      if (DROP_FIRST_TONE && toneRequests === 1) return
      // Sentinel note, same reasoning as `play`'s -999 above — a real
      // client can only send well-formed commands, so a coded-Nack path
      // needs a trigger reachable through the real public
      // playToneSynth() method (#47 cold-start retry correlation).
      if (command.note === '__COLD_START_TEST__') {
        send(
          withEcho(command, {
            ok: false,
            cmd: 'playToneSynth',
            error: 'Tone.js is still loading — try again in a moment',
            code: 'TONE_LOADING',
          })
        )
        return
      }
      // No-op ack — this fixture never touches tone/web-audio-daw (see
      // client.test.ts); it only proves the wire message reaches here.
      send(withEcho(command, { ok: true, cmd: 'playToneSynth' }))
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
        send(withEcho(command, { ok: false, cmd: 'stats', error: 'analyser unavailable' }))
        return
      }
      // elapsedSeconds advances 0.5 per request — the observable that
      // lets client.test.ts prove response PAIRING under concurrent
      // getStats() calls (mispaired callers would all read the same
      // first response), not just that each got A response.
      statsRequests += 1
      if (DROP_FIRST_STATS && statsRequests === 1) return
      sendOrdered(
        withEcho(command, {
          ok: true,
          cmd: 'stats',
          stats: {
            peak: 0.5,
            silent: false,
            playing: true,
            durationSeconds: 2,
            elapsedSeconds: 0.5 * statsRequests,
            contextState: 'running',
          },
        }),
        statsRequests === 1 ? DELAY_FIRST_STATS_MS : 0
      )
      return
    default:
      process.stderr.write(`fakePlaySidecar: unknown cmd ${command.cmd}\n`)
  }
})

process.stderr.write('fakePlaySidecar: ready\n')
