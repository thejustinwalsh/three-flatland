import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { fileURLToPath } from 'node:url'
import { basename, dirname, resolve } from 'node:path'

/**
 * Shared runner for integration probes. Each probe is a
 * browser-runnable script (TS or JS) that ends with a sentinel:
 *
 *   console.log('INTEGRATION_RESULT: ' + JSON.stringify(result))
 *
 * `runProbe` invokes `pnpm exec vitexec` against the probe code,
 * captures stdout, parses the sentinel line, and returns the
 * structured result. Tests assert against that object.
 *
 * Why a sentinel instead of free-form parsing? Probes already log
 * progress / debugging output during their run; the sentinel is a
 * clean machine-readable boundary the test can lock onto.
 */

export interface RunProbeOptions {
  /**
   * Wall-clock seconds for vitexec's --timeout. Should be GREATER
   * than the probe's own internal duration (the time it spends
   * sampling). 30s margin is plenty for browser bootstrap.
   */
  timeoutSec: number
  /**
   * Path the probe should navigate to inside the dev server. The
   * driller renders at `/`.
   */
  path?: string
  /**
   * Cap stdout retained on failure (per stream). Probes can be
   * chatty during a 90s run; this avoids exploding the failure
   * report. The INTEGRATION_RESULT line is always preserved.
   */
  maxLogLines?: number
}

export interface ProbeResult<T> {
  data: T
  /** Full probe stdout, useful in failure messages. */
  log: string
}

const here = dirname(fileURLToPath(import.meta.url))

/**
 * Ask the OS for a free TCP port by binding to port 0 on the loopback
 * interface, reading the assigned port back, then releasing the
 * socket. Used so the integration suite never collides with whatever
 * dev servers the user has running (e.g. a workspace `pnpm dev`
 * holding port 5173).
 *
 * The bind/release is racey by definition — between this returning
 * and vite actually starting, another process could grab the same
 * port. The runner handles that case via PORT_RETRY_LIMIT below; the
 * vite.integration.config has `strictPort: false` so vite itself can
 * also fall back.
 */
async function findFreePort(): Promise<number> {
  return new Promise((resolveP, rejectP) => {
    const srv = createServer()
    srv.unref()
    srv.once('error', rejectP)
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address()
      if (addr && typeof addr === 'object') {
        const port = addr.port
        srv.close((err) => (err ? rejectP(err) : resolveP(port)))
      } else {
        srv.close()
        rejectP(new Error('Could not determine free port'))
      }
    })
  })
}

const PORT_RETRY_LIMIT = 3

export async function runProbe<T>(
  probeRelativePath: string,
  opts: RunProbeOptions
): Promise<ProbeResult<T>> {
  const probePath = resolve(here, probeRelativePath)
  const code = await readFile(probePath, 'utf-8')

  // vitexec's --timeout governs in-browser navigation/code timeout.
  // Add a generous outer envelope for the whole subprocess (browser
  // bootstrap, page load, vitexec teardown). If the process doesn't
  // exit within this envelope we kill it and surface a clear timeout
  // error — silence is a failure, not a pass.
  const HARD_TIMEOUT_MARGIN_SEC = 60
  const hardTimeoutMs = (opts.timeoutSec + HARD_TIMEOUT_MARGIN_SEC) * 1000

  const probeLabelOuter = `[${basename(probePath, '.probe.js')}]`
  let lastErr: unknown
  for (let attempt = 1; attempt <= PORT_RETRY_LIMIT; attempt++) {
    const port = await findFreePort()
    process.stderr.write(
      `${probeLabelOuter} attempt ${attempt}/${PORT_RETRY_LIMIT} on port ${port}\n`
    )
    try {
      return await runOnce<T>(probePath, code, opts, hardTimeoutMs, port, probeLabelOuter)
    } catch (err) {
      lastErr = err
      // Retry only on port-collision-style failures. Any other failure
      // (sentinel missing, JSON parse error, hard timeout) is a real
      // probe issue — surface immediately.
      const msg = err instanceof Error ? err.message : String(err)
      if (!isPortCollision(msg)) {
        throw err instanceof Error ? err : new Error(msg)
      }
      process.stderr.write(
        `${probeLabelOuter} port ${port} appears to have been stolen between bind & vite — retrying\n`
      )
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error('runProbe exhausted retries with no recorded Error instance')
}

function isPortCollision(msg: string): boolean {
  return (
    /EADDRINUSE/i.test(msg) || /Port \d+ is already in use/i.test(msg) || /strictPort/i.test(msg)
  )
}

/**
 * Known-fatal substrings that should kill vitexec early instead of
 * waiting for the hard timeout. Match anywhere in stdout or stderr.
 *
 * Be conservative — false positives would short-circuit working
 * tests. Each pattern below corresponds to a debugging session where
 * the wall-clock cost of waiting for the hard timeout was high and
 * the fix was obvious from the error.
 */
const FAIL_FAST_PATTERNS = new RegExp(
  [
    'EADDRINUSE',
    'Port \\d+ is already in use',
    'strictPort enabled',
    // vitexec's own bail-out prefix — covers config-resolve errors,
    // bundling failures, missing entries, etc. Verified against real
    // failure modes (e.g. `vitexec failed: Build failed with 1 error:
    // Cannot resolve entry module …`).
    'vitexec failed:',
    'failed to load config from',
    // playwright bootstrap failures (rare but punishing — Chromium
    // missing, dyld errors, codesign rejected).
    "Executable doesn't exist",
    'browserType\\.launch:.*Process exited',
  ].join('|'),
  'i'
)

async function runOnce<T>(
  probePath: string,
  code: string,
  opts: RunProbeOptions,
  hardTimeoutMs: number,
  port: number,
  probeLabelOuter: string
): Promise<ProbeResult<T>> {
  const HARD_TIMEOUT_MARGIN_SEC = 60
  // --gpu uses Chromium's new headless mode with GPU-friendly flags.
  // Without this the headless browser throttles requestAnimationFrame,
  // the simulation tick rate drops, and wall-clock-sensitive probes
  // (3-phase timing) report ~2x the expected durations. The vitexec
  // skill explicitly recommends --gpu for canvas/Three.js/WebGPU work.
  const args = [
    'exec',
    'vitexec',
    '--config',
    'vite.integration.config.ts',
    '--gpu',
    '--path',
    opts.path ?? '/',
    '--timeout',
    String(opts.timeoutSec),
    code,
  ]
  process.stderr.write(
    `${probeLabelOuter} starting (probe budget ${opts.timeoutSec}s, hard timeout ${opts.timeoutSec + 60}s, port ${port})\n`
  )
  const startedAt = Date.now()

  // First-output deadline — vite normally prints "VITE ready in …ms"
  // within ~3s of spawn. If 30s passes with NO output of any kind,
  // we know something's wrong (dead config, missing dep, port stuck
  // even with strictPort:false, missing browser binary). Fail fast
  // instead of waiting the full hard timeout for silence.
  const FIRST_OUTPUT_DEADLINE_MS = 30_000

  return new Promise<ProbeResult<T>>((resolveResult, reject) => {
    // `detached: true` puts vitexec in its own process group via
    // `setsid()`. SIGKILL on a non-detached parent leaves Vite +
    // Playwright run-server children re-parented to init/launchd —
    // their TCP sockets stay bound and pile up as orphans (we hit
    // this on 5173 and a couple of ephemeral ports during the H
    // refactor session). With detached, `process.kill(-pid, signal)`
    // (note the negative pid) signals the whole group atomically.
    const proc = spawn('pnpm', args, {
      cwd: resolve(here, '../../'),
      env: {
        ...process.env,
        FORCE_COLOR: '0',
        DRILLER_INTEGRATION_PORT: String(port),
      },
      detached: true,
    })
    // Group-aware kill: -pid signals every process in the group.
    // Try this first; fall back to single-pid signal if the group
    // call throws (e.g. process already gone, no such group).
    const killGroup = (signal: NodeJS.Signals): void => {
      const pid = proc.pid
      if (typeof pid !== 'number') return
      try {
        process.kill(-pid, signal)
      } catch {
        try {
          proc.kill(signal)
        } catch {
          /* already gone */
        }
      }
    }
    let stdout = ''
    let stderr = ''
    let killedByTimeout = false
    let killedBySilence = false
    let killedByFatal: string | null = null
    let sawAnyOutput = false

    const firstOutputTimer = setTimeout(() => {
      if (sawAnyOutput) return
      killedBySilence = true
      killGroup('SIGKILL')
    }, FIRST_OUTPUT_DEADLINE_MS)

    const noteOutput = (): void => {
      if (sawAnyOutput) return
      sawAnyOutput = true
      clearTimeout(firstOutputTimer)
    }

    const checkFatal = (chunk: string): void => {
      if (killedByFatal !== null) return
      const m = chunk.match(FAIL_FAST_PATTERNS)
      if (!m) return
      killedByFatal = m[0]
      killGroup('SIGKILL')
    }

    // Stream vitexec output to OUR stderr in real time so the user
    // sees the probe working during a 60–180s run. Vitest's reporter
    // writes test results on stdout; using stderr keeps the channels
    // separated. The runner ALSO buffers stdout so the sentinel
    // parser still works after the process exits.
    proc.stdout.on('data', (chunk: Buffer) => {
      const s = chunk.toString('utf-8')
      stdout += s
      noteOutput()
      checkFatal(s)
      forwardLines(s, probeLabelOuter)
    })
    proc.stderr.on('data', (chunk: Buffer) => {
      const s = chunk.toString('utf-8')
      stderr += s
      noteOutput()
      checkFatal(s)
      forwardLines(s, probeLabelOuter)
    })
    const hardTimer = setTimeout(() => {
      killedByTimeout = true
      // SIGKILL the whole process group — vitexec spawns vite +
      // Playwright run-server children; SIGTERM-on-parent gets caught
      // (cleanup hangs) and SIGKILL-on-parent re-parents the
      // children to init/launchd, leaving their TCP sockets orphaned.
      killGroup('SIGKILL')
    }, hardTimeoutMs)
    proc.on('error', (err) => {
      clearTimeout(hardTimer)
      clearTimeout(firstOutputTimer)
      reject(err)
    })
    proc.on('close', (code) => {
      clearTimeout(hardTimer)
      clearTimeout(firstOutputTimer)
      const trimmedLog = limitLines(stdout, opts.maxLogLines ?? 80)
      if (killedBySilence) {
        reject(
          new Error(
            `vitexec produced no output within ${FIRST_OUTPUT_DEADLINE_MS / 1000}s of spawn.\n` +
              `This is a fail-fast bail-out — vite normally prints "ready in …ms" within ~3s.\n` +
              `Likely causes:\n` +
              `  - vite config error (try: \`pnpm exec vite -c vite.integration.config.ts\` manually)\n` +
              `  - port ${port} stuck despite strictPort:false (rare)\n` +
              `  - vitexec / playwright binary missing or broken (try: \`pnpm exec vitexec --help\`)\n` +
              `  - pnpm could not resolve the workspace (check pnpm-workspace.yaml)\n\n` +
              `--- stdout ---\n${trimmedLog || '(empty)'}\n` +
              `--- stderr ---\n${limitLines(stderr, 40) || '(empty)'}`
          )
        )
        return
      }
      if (killedByFatal !== null) {
        reject(
          new Error(
            `vitexec emitted a fatal error pattern and was killed early: ${killedByFatal}\n` +
              `Fail-fast bail-out — no point waiting the full hard timeout once we've ` +
              `seen a known-fatal message.\n\n` +
              `--- stdout (last ${opts.maxLogLines ?? 80} lines) ---\n${trimmedLog}\n` +
              `--- stderr ---\n${limitLines(stderr, 40)}`
          )
        )
        return
      }
      if (killedByTimeout) {
        reject(
          new Error(
            `vitexec hard-timed-out after ${hardTimeoutMs / 1000}s ` +
              `(probe budget ${opts.timeoutSec}s + ${HARD_TIMEOUT_MARGIN_SEC}s overhead).\n` +
              `A timeout IS a failure — silence is not success. Likely causes:\n` +
              `  - probe page never loaded (check that '/' renders the driller)\n` +
              `  - probe code threw before emitting INTEGRATION_RESULT\n` +
              `  - browser bootstrap hung (rare; try \`pnpm exec vitexec --gpu\` manually)\n\n` +
              `--- stdout (last ${opts.maxLogLines ?? 80} lines) ---\n${trimmedLog}\n` +
              `--- stderr ---\n${limitLines(stderr, 40)}`
          )
        )
        return
      }
      if (code !== 0) {
        reject(
          new Error(
            `vitexec exited with code ${code}\n` +
              `--- stdout (last ${opts.maxLogLines ?? 80} lines) ---\n${trimmedLog}\n` +
              `--- stderr ---\n${limitLines(stderr, 40)}`
          )
        )
        return
      }
      const sentinelMatch = stdout.match(/INTEGRATION_RESULT:\s*(\{[\s\S]*?\})\s*$/m)
      if (!sentinelMatch) {
        reject(
          new Error(
            `Probe completed but did not emit INTEGRATION_RESULT sentinel.\n` +
              `Probes must end with: console.log('INTEGRATION_RESULT: ' + JSON.stringify(result))\n` +
              `--- stdout (last ${opts.maxLogLines ?? 80} lines) ---\n${trimmedLog}`
          )
        )
        return
      }
      try {
        const data = JSON.parse(sentinelMatch[1]!) as T
        const elapsedSec = Math.round((Date.now() - startedAt) / 1000)
        process.stderr.write(
          `${probeLabelOuter} probe complete (${elapsedSec}s elapsed, sentinel parsed)\n`
        )
        resolveResult({ data, log: trimmedLog })
      } catch (err) {
        reject(
          new Error(
            `Failed to JSON.parse INTEGRATION_RESULT.\n` +
              `Sentinel content: ${sentinelMatch[1]}\n` +
              `Error: ${(err as Error).message}`
          )
        )
      }
    })
  })
}

function limitLines(s: string, max: number): string {
  const lines = s.split('\n')
  if (lines.length <= max) return s
  return ['…(truncated)…', ...lines.slice(-max)].join('\n')
}

/**
 * Forward streamed output to process.stderr, prefixed with the probe
 * label, only for lines that carry signal. We skip:
 *   - empty lines
 *   - vitexec's own bootstrap noise that the reader can't act on
 *     (the React DevTools nag, R3F alpha banner, etc.)
 * Probes that want their own progress visible should use the
 * `[progress]` prefix in their console.log calls — those always pass.
 */
const NOISE_PATTERNS: RegExp[] = [
  /Download the React DevTools/,
  /React Three Fiber v\d+ is in ALPHA/,
  /https?:\/\/github\.com\/pmndrs\/react-three-fiber/,
  /^\s*$/,
]
function forwardLines(chunk: string, label: string): void {
  for (const line of chunk.split('\n')) {
    if (!line.trim()) continue
    if (NOISE_PATTERNS.some((p) => p.test(line))) continue
    process.stderr.write(`${label} ${line}\n`)
  }
}
