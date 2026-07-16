# Driller Integration Tests

Live-browser integration tests that observe the driller running in a real Vite dev environment via [vitexec](../../../../.claude/skills/vitexec/SKILL.md). Each test spawns a headless Chromium, lets the driller play autonomously for 1–3 minutes, and asserts on observed game-state invariants that unit tests can't reach (timing, cascading behavior, scan windows, etc.).

## Running

```bash
# From minis/driller
pnpm test:integration
```

Each test takes 60–180s. The full suite runs sequentially (vitexec contends for one browser slot at a time). **Do not run on every commit** — the unit test suite (`pnpm test`, fast and deterministic) covers most invariants. Run integration tests:

- After changes to `systems/collapse.ts`, `systems/hazard.ts`, `components/Scene.tsx` (the simulation loop), or any sag/shake/cascade code.
- After tuning `SAG_*_TICKS` or other tick budgets in `src/constants.ts`.
- Before opening a PR that touches the simulation pipeline.

## Suite structure

```
tests/integration/
  _runner.ts                                 # vitexec orchestration + sentinel parsing
  probes/                                    # browser-runnable probe scripts (.js, plain JS — no TS, no Node)
    shake-contract.probe.js
    three-phase-timing.probe.js
    offscreen-shake.probe.js
  shake-contract.integration.test.ts         # vitest harness, parses probe result, asserts
  three-phase-timing.integration.test.ts
  offscreen-shake.integration.test.ts
```

## Probe contract

Every probe is a browser-runnable JavaScript file that:

1. Waits for `window.__drillerWorld` (the global the game exposes for inspection).
2. Imports traits via vite-resolved paths (`/src/traits/index.ts`).
3. Sets `GameState.runState = 'playing'` so the AI driller starts moving.
4. Samples for some duration on `setInterval`.
5. Aggregates samples into a result object.
6. **MUST** end with the sentinel:

   ```js
   console.log('INTEGRATION_RESULT: ' + JSON.stringify(result))
   ```

The runner regex-matches that line out of stdout and `JSON.parse`s the payload. No sentinel = test fails with a clear "probe didn't emit INTEGRATION_RESULT" message.

## Test contract

Each `*.integration.test.ts` file:

1. `import { runProbe } from './_runner'`
2. Calls `runProbe(probePath, { timeoutSec })` and gets `{ data, log }`.
3. Asserts on `data` with vitest matchers.
4. **On any assertion failure, throws an Error whose message includes (a) what was expected, (b) likely root causes with file paths to investigate, (c) sample offending data, (d) the tail of vitexec's stdout.** This is the maintenance contract — if a future agent has to fix a regression, the failure message tells them where to look.

See `shake-contract.integration.test.ts` for the canonical pattern.

## Timeouts and fail-fast: silence is never green

The runner has three layers of failure-detection so a misconfigured suite can't waste minutes:

| Layer                       | When it fires                                                                                                                                                          | Typical wall-clock cost |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| **Fail-fast pattern match** | Stdout/stderr matches a known-fatal regex (`vitexec failed:`, `EADDRINUSE`, `Port \d+ is already in use`, `failed to load config from`, missing Playwright browser, …) | ~1–3s                   |
| **First-output deadline**   | No bytes on stdout OR stderr within 30s of spawn (vite normally prints "VITE ready in …ms" within ~3s)                                                                 | 30s                     |
| **Hard timeout**            | `timeoutSec + 60s` margin elapsed after spawn                                                                                                                          | 60–240s+                |

All three result in `SIGKILL` against vitexec and a thrown error whose message names likely causes and includes the captured stdout/stderr tail. **A timeout is a failure, never a "skip" or "in-progress" result.** Silence is not success — if the suite ever reports green while a test ran for the full envelope, something is wrong with the runner.

The fail-fast patterns are conservative — false positives would short-circuit working tests. Add a new pattern only after you've personally hit a debugging session where the wall-clock cost of the hard timeout was high and the symptom was obvious from the message.

### Port collisions

`vite.integration.config.ts` reads its port from `$DRILLER_INTEGRATION_PORT` and uses `strictPort: false`. The runner pre-allocates a free port via `net.createServer().listen(0)` before each spawn, so the suite never collides with a workspace `pnpm dev` that's holding 5173. If the picked port gets stolen between bind and vite-startup (rare race), the runner retries up to 3 times.

### Tunable knobs

- Probe-side `timeoutSec` (in the test file): vitexec's own `--timeout`. Should comfortably exceed the probe's internal `RUN_MS` window (e.g., 150s for a 90s probe).
- Runner-side hard timeout (in `_runner.ts`): `timeoutSec + 60s`. Surfaces a stuck vitexec.
- Runner-side first-output deadline (in `_runner.ts`): 30s. Surfaces a hung spawn before any output.
- Vitest-side `testTimeout` (in `vitest.integration.config.ts`): outer bound, larger than the runner's hard timeout for the slowest test.

## Headless rendering: `--gpu`

The runner passes `--gpu` to vitexec. Without it, headless Chromium throttles `requestAnimationFrame` to a sub-60Hz rate and wall-clock-dependent probes (3-phase timing) report ~2× their expected durations. If a new probe depends on visible-frame cadence, keep `--gpu` on.

## Adding a new test

1. **Identify a real bug** that the unit tests can't catch — usually something that emerges from full-system play (a cascade, a timing relationship, a multi-system race).
2. Write a probe in `probes/<name>.probe.js`. Keep it browser-only (no Node, no TS). Have it sample the relevant world state and emit `INTEGRATION_RESULT`.
3. Write a test in `<name>.integration.test.ts` that calls `runProbe` and asserts. **Failure messages must point at specific files and likely causes** — don't just `expect(x).toBe(0)` and leave it at that.
4. Run `pnpm test:integration` locally to verify.
5. Update `CLAUDE.md` if the test pins a contract that future agents need to know about.

## Why probes are `.js` not `.ts`

Vite serves the probe code into the running browser as-is via `--code <string>`. We pass the raw file content. Keeping probes as plain JS avoids a TS→JS pre-build step in the runner. The trade-off: probe files don't get static-checked. In practice this is fine — probes are short and the test catches breakage immediately.
