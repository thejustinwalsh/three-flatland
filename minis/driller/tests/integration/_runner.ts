import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
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

export async function runProbe<T>(
  probeRelativePath: string,
  opts: RunProbeOptions,
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

  // --gpu uses Chromium's new headless mode with GPU-friendly flags.
  // Without this the headless browser throttles requestAnimationFrame,
  // the simulation tick rate drops, and wall-clock-sensitive probes
  // (3-phase timing) report ~2x the expected durations. The vitexec
  // skill explicitly recommends --gpu for canvas/Three.js/WebGPU work.
  const args = [
    'exec',
    'vitexec',
    '--config',
    'vite.config.ts',
    '--gpu',
    '--path',
    opts.path ?? '/',
    '--timeout',
    String(opts.timeoutSec),
    code,
  ]

  const probeLabelOuter = `[${basename(probePath, '.probe.js')}]`
  process.stderr.write(
    `${probeLabelOuter} starting (probe budget ${opts.timeoutSec}s, hard timeout ${(opts.timeoutSec + 60)}s)\n`,
  )
  const startedAt = Date.now()

  return new Promise<ProbeResult<T>>((resolveResult, reject) => {
    const proc = spawn('pnpm', args, {
      cwd: resolve(here, '../../'),
      env: { ...process.env, FORCE_COLOR: '0' },
    })
    let stdout = ''
    let stderr = ''
    let killedByTimeout = false

    // Stream vitexec output to OUR stderr in real time so the user
    // sees the probe working during a 60–180s run. Vitest's reporter
    // writes test results on stdout; using stderr keeps the channels
    // separated. The runner ALSO buffers stdout so the sentinel
    // parser still works after the process exits.
    proc.stdout.on('data', (chunk: Buffer) => {
      const s = chunk.toString('utf-8')
      stdout += s
      forwardLines(s, probeLabelOuter)
    })
    proc.stderr.on('data', (chunk: Buffer) => {
      const s = chunk.toString('utf-8')
      stderr += s
      forwardLines(s, probeLabelOuter)
    })
    const hardTimer = setTimeout(() => {
      killedByTimeout = true
      // SIGKILL — vitexec spawns child Chromium processes; SIGTERM
      // gets caught and the cleanup hangs. Force-kill the group.
      try { proc.kill('SIGKILL') } catch { /* already exited */ }
    }, hardTimeoutMs)
    proc.on('error', (err) => {
      clearTimeout(hardTimer)
      reject(err)
    })
    proc.on('close', (code) => {
      clearTimeout(hardTimer)
      const trimmedLog = limitLines(stdout, opts.maxLogLines ?? 80)
      if (killedByTimeout) {
        reject(
          new Error(
            `vitexec hard-timed-out after ${hardTimeoutMs / 1000}s ` +
              `(probe budget ${opts.timeoutSec}s + ${HARD_TIMEOUT_MARGIN_SEC}s overhead).\n` +
              `A timeout IS a failure — silence is not success. Likely causes:\n` +
              `  - dev server failed to start (vite config error, port conflict)\n` +
              `  - probe page never loaded (check that '/' renders the driller)\n` +
              `  - probe code threw before emitting INTEGRATION_RESULT\n` +
              `  - browser bootstrap hung (rare; try \`pnpm exec vitexec --gpu\` manually)\n\n` +
              `--- stdout (last ${opts.maxLogLines ?? 80} lines) ---\n${trimmedLog}\n` +
              `--- stderr ---\n${limitLines(stderr, 40)}`,
          ),
        )
        return
      }
      if (code !== 0) {
        reject(
          new Error(
            `vitexec exited with code ${code}\n` +
              `--- stdout (last ${opts.maxLogLines ?? 80} lines) ---\n${trimmedLog}\n` +
              `--- stderr ---\n${limitLines(stderr, 40)}`,
          ),
        )
        return
      }
      const sentinelMatch = stdout.match(/INTEGRATION_RESULT:\s*(\{[\s\S]*?\})\s*$/m)
      if (!sentinelMatch) {
        reject(
          new Error(
            `Probe completed but did not emit INTEGRATION_RESULT sentinel.\n` +
              `Probes must end with: console.log('INTEGRATION_RESULT: ' + JSON.stringify(result))\n` +
              `--- stdout (last ${opts.maxLogLines ?? 80} lines) ---\n${trimmedLog}`,
          ),
        )
        return
      }
      try {
        const data = JSON.parse(sentinelMatch[1]!) as T
        const elapsedSec = Math.round((Date.now() - startedAt) / 1000)
        process.stderr.write(
          `${probeLabelOuter} probe complete (${elapsedSec}s elapsed, sentinel parsed)\n`,
        )
        resolveResult({ data, log: trimmedLog })
      } catch (err) {
        reject(
          new Error(
            `Failed to JSON.parse INTEGRATION_RESULT.\n` +
              `Sentinel content: ${sentinelMatch[1]}\n` +
              `Error: ${(err as Error).message}`,
          ),
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
