# VS Code extension e2e harness

Real integration tests: a real VS Code (Electron) build, launched under
Playwright, driving the real extension host and the real webview UIs. This
exists because command-level or unit-level tests can't catch the failure
modes that actually break these tools — a webview that never receives its
`init` message, a custom editor that opens the wrong document, a CSP that
silently blocks the bundle. If a tool is wrong here, it's wrong for a real
user opening VS Code.

## Running it

```sh
pnpm --filter @three-flatland/vscode test:e2e
```

First run downloads a VS Code build into `tools/vscode/.vscode-test/`
(gitignored, ~1.6 GB) — expect it to take longer than subsequent runs,
which reuse the cached install. On macOS this opens a real, visible VS
Code window; that's expected, not a bug in headless mode. Point at a
specific VS Code build (e.g. to pin a version, or use `insiders`) with:

```sh
VSCODE_E2E_VERSION=1.94.0 pnpm --filter @three-flatland/vscode test:e2e
```

Before launching anything, `globalSetup` (`e2e/global-setup.ts`):

1. Runs `pnpm --filter "@three-flatland/vscode..." -r run build` so
   `--extensionDevelopmentPath` always loads a fresh `dist/` — see the
   comment in `global-setup.ts` for why this isn't a bare
   `pnpm --filter … build` or `turbo run build`.
2. esbuild-bundles `e2e/host-bridge/runner.ts` to
   `e2e/host-bridge/dist/runner.cjs` — the extension-host side of the
   host-eval bridge (see below); `--extensionTestsPath` needs a real `.js`
   file, not TS/ESM source.

There's no cache-skip on either step — every run rebuilds. If that becomes
a bottleneck, make it conditional on mtimes, but correctness (never
testing a stale bundle) comes first.

## Why this is hand-rolled instead of `vscode-test-playwright`

The obvious starting point was
[`vscode-test-playwright`](https://github.com/ruifigueira/vscode-test-playwright)
(by the `playwright-vscode` extension's author) — it combines
`@vscode/test-electron` (download + launch a real VS Code build) with
Playwright fixtures (`workbox`, `evaluateInVSCode`, `evaluateHandleInVSCode`).
A fork, `@mshanemc/vscode-test-playwright`, also exists; diffing the two
packages' published `dist/` showed they're functionally identical (same
deps, same public API, the fork is a near-mechanical rebase with a couple
debug `console.log`s added) — no reason to prefer one over the other on
capability grounds.

**Both are broken against this repo's pinned `@playwright/test@^1.60.0`.**
Their `evaluateInVSCode` fixture calls `playwright._toImpl(electronApp)` —
an *unstable, unexported* Playwright internal used to reach the raw
implementation object behind the public `ElectronApplication` wrapper.
That internal doesn't exist on `@playwright/test@1.60.0` (confirmed
directly: `require('@playwright/test').playwright` is an empty object on
this version). Every test that touched `evaluateInVSCode` failed
immediately with:

```
TypeError: playwright._toImpl is not a function
    at Object._evaluator (…/vscode-test-playwright/src/index.ts:241:55)
```

This is exactly the failure mode this harness's brief pre-authorized
falling back to hand-rolling for — a real, reproduced incompatibility, not
a preference. `electronApp`/`workbox`/`baseDir` (none of which touch
`_toImpl`) launched and worked fine in the same test run, so the launch
mechanics were never in question — only the eval-bridge fixture was dead.

Downgrading `@playwright/test` to some older version where `_toImpl`
happened to exist was considered and rejected: it's a private API by
design (leading underscore), so pinning to it is a ticking time bomb, and
it would fragment this repo's Playwright version away from the root
`test:e2e` smoke suite's `^1.60.0`, which the brief explicitly asked to
stay aligned with.

## Hand-rolled architecture

- **Launch**: `@playwright/test`'s `_electron.launch()` directly, on a
  build downloaded via `@vscode/test-electron`'s `downloadAndUnzipVSCode`
  — the exact fallback pattern named in this harness's brief. See the
  `electronApp` fixture in `e2e/fixtures.ts` for the flag set (same flags
  `@vscode/test-electron`'s own `runTests()` launcher and
  `vscode-test-playwright` both use — `--no-sandbox`,
  `--disable-workspace-trust`, etc. — these aren't guesses, they're the
  well-known way to avoid Electron-under-automation hangs).
- **`workbox`** (the VS Code window as a Playwright `Page`): just
  `electronApp.firstWindow()` — fully public API, no fork needed here.
- **Host-eval bridge** (`e2e/host-bridge/`): the one piece that had to be
  rebuilt. `runner.ts` is loaded via `--extensionTestsPath` (so it runs
  *inside* the real extension host with real `vscode` access), starts a
  tiny `ws` WebSocket server, and evaluates `(vscode, arg) => …` function
  source sent to it via `new Function`. `client.ts` (Node side) watches
  `electronApp.process().stderr` — `.process()` **is** public API, unlike
  `_toImpl` — for the bridge's "listening on port N" line, connects, and
  exposes a typed `evaluate()`. This is deliberately a much smaller
  surface than `vscode-test-playwright`'s own protocol (no object-handle
  tracking, no event-emitter bridging — nothing here needs
  `evaluateHandleInVSCode`'s capability), which is also why it was
  rewritten from scratch rather than reaching into
  `vscode-test-playwright`'s `node_modules` internals: that package's
  `dist/injected/index.js` (the extension-host runner half, which itself
  has no `_toImpl` dependency and does work) isn't part of its public
  `exports` map, so depending on it would mean depending on an
  undocumented internal of an 0.0.1-beta package for no real savings over
  writing the ~60 lines this harness actually needs.

## One VS Code window per spec file, reset between tests

Launching VS Code (Electron cold start + extension host activation) costs
far more wall time than most individual tests do, so `e2e/fixtures.ts`
launches **one window per spec file**, not one per test:

- An internal `_sharedWindow` fixture compares the running test's
  `testInfo.file` against whichever window is currently cached
  (`_windowCache`, a worker-lifetime box). Same file as last time → reuse
  the existing window. Different file (or none cached yet) → tear down
  whatever's cached and launch fresh. Tests run strictly in file order
  here (`workers: 1`, `fullyParallel: false` in `playwright.config.ts`),
  so this transition happens exactly once per file boundary, never
  mid-file — safe to reason about without a "which test is this" check.
- `baseDir` (the last positional arg in the launch `args` — literally the
  folder VS Code opens, `code <flags…> <baseDir>`) is decided once, at
  launch, from an `fs.mkdtemp()`'d + `fs.cp()`'d copy of
  `e2e/fixtures/workspace/`. It **cannot** change without relaunching the
  window (it's a CLI arg), so reuse-within-a-file needs a different
  mechanism to stay test-isolated: **content** reset. Every reused test
  gets `workbench.action.closeAllEditors` run over the host-eval bridge
  (no stale tab from the previous test can satisfy this test's
  `webviewFrame` lookup) and `baseDir` wiped + recopied from the pristine
  fixture workspace (no previous test's sidecar/encode/merge output can
  leak forward). See `resetWindowWorkspace()` in `fixtures.ts`.
- `specs/activation.spec.ts`'s marker-file pair and `specs/atlas.spec.ts`'s
  "exactly one tab" test exist specifically to prove this reset actually
  works, not just that the window is reused — a broken reset could still
  pass every spec that only *reads* workspace state and never *writes* it.

None of this changes what a spec author calls: `baseDir`, `electronApp`,
`workbox`, `evaluateInVSCode`, `openCommand`, and `webviewFrame` all keep
their exact existing signatures and per-test semantics (a fresh-looking
workspace, a window that responds to your commands) — only the
*implementation* now reuses the expensive part across a file's tests.

Because `os.tmpdir()` resolves through a `/tmp` → `/private/tmp` symlink on
macOS, and VS Code reports `workspaceFolders[0].uri.fsPath` through the
*resolved* path, `fixtures.ts` calls `fs.realpath()` on the mkdtemp result
before copying into it — otherwise the workspace-identity assertion in
`specs/activation.spec.ts` fails deterministically (not flakily) on macOS.

## Fixture workspace

`e2e/fixtures/workspace/` — see `e2e/fixtures/README.md` for exactly which
repo asset each file was copied or adapted from, and why. In short: real
sprites from `examples/react/lighting/public/sprites/`, a trimmed real
sound-preset file from `minis/breakout/src/systems/sounds.ts`, and two
hand-authored `*.atlas.json` sidecars (no real one existed for these
sprites yet) built to the actual `packages/schemas/src/atlas/schema.json`
shape so they pass real schema validation, not just parse.

## Helper API (`e2e/fixtures.ts`)

Import `test`/`expect` from `../fixtures` in every spec.

### `evaluateInVSCode(fn, arg?)`

Runs `fn` inside the real extension host over the host-eval bridge
described above. `fn` is shipped as source text
(`Function.prototype.toString()`) and reconstructed via `new Function` on
the other side of the wire — it must not close over anything outside its
own `(vscode, arg)` parameters, same constraint Playwright's own
`page.evaluate` has and for the same reason.

```ts
const path = await evaluateInVSCode((vscode) => vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? null)
```

### `openCommand(commandId, relativeFsPaths?)`

Runs a registered command through the real extension host — the same
`vscode.commands.executeCommand` path a command-palette selection or a
context-menu click resolves to. Built on `evaluateInVSCode` rather than a
literal keystroke simulation of `Cmd+Shift+P` + typing + Enter: VS Code's
command palette fuzzy-matches against a command's *display title*
(`"FL: <title>"`), not its internal id, so driving it from a plain command
id string would be guessing at a match, and the actual matching/filtering
logic being exercised would be VS Code's, not ours. This still activates
the extension for real, resolves the real command handler, opens the real
custom editor / webview panel, and exercises the real bridge handshake —
only "which literal pixels a user clicked" is skipped, not any of the
code under test.

`relativeFsPaths` are workspace-relative (e.g. `'sprites/knight.png'`).
They're turned into real `vscode.Uri` instances *inside* the extension
host, not passed across the bridge as objects — a `vscode.Uri` doesn't
survive that JSON round-trip as a usable instance, only as an inert plain
object, so the URI has to be constructed on the host side of the wire.
When given, they're forwarded as `(clicked, allSelected)`, matching the
multi-select call shape all three tools' commands use
(`extension/tools/{atlas,encode,merge}/register.ts`).

```ts
await openCommand('threeFlatland.atlas.openEditor', ['sprites/knight.png'])
await openCommand('threeFlatland.merge.openMergeTool', [
  'sprites/knight.atlas.json',
  'sprites/dungeon.atlas.json',
])
```

### `webviewFrame(panelTitle)`

Waits for the panel's editor tab to be visible (`workbox.getByRole('tab',
{ name: panelTitle })`) — so a panel that never opened fails with a clear
timeout on the tab, not a confusing failure two steps later trying to
find an iframe that isn't there — then drills through VS Code's
double-iframe webview structure:

1. **Outer host iframe** — `iframe.webview.ready`. One per webview panel;
   VS Code sets `className = "webview " + customClasses` on creation and
   adds the `ready` class once the webview's internal service-worker page
   has booted (`webviewElement.ts`). `.last()` is defensive against a
   previous panel's iframe still mid-teardown.
2. **Inner content iframe** — `#active-frame` inside the outer frame's
   document. This is the extension's actual document — our Vite-built
   React app (`webview/<tool>/index.html`) — swapped in once loaded
   (`browser/webview/pre/index.html`, `getActiveFrame()`).

Returns a `FrameLocator` scoped to `#active-frame`, after confirming
`#root` (every tool's Vite mount point — see each `webview/<tool>/index.html`)
is attached.

```ts
const frame = await webviewFrame('knight.png')
await expect(frame.locator('vscode-toolbar-container')).toBeVisible()
```

`vscode-toolbar-container` — the custom element `Toolbar` (from
`@three-flatland/design-system`) renders — is used as the "did this tool
actually mount" signal in every smoke spec because all three tools use it
for their top chrome (`tools/design-system/CLAUDE.md`, "Reference usage").
Asserting on it proves the React tree rendered past the FOUC-guard shell,
not just that the iframe loaded an empty document.

## Adding specs for a new tool (ZzFX Studio, Normal Baker)

1. Add real fixture assets under `e2e/fixtures/workspace/` and a row to
   `e2e/fixtures/README.md` documenting where each came from.
2. Add a spec under `e2e/specs/` that: calls `openCommand` with the tool's
   real command id and any file args, calls `webviewFrame` with the
   panel's real title (read it off the `register.ts`/`host.ts` panel
   creation, don't guess), and asserts on something that proves the
   webview actually rendered (the toolbar, or a more specific element if
   the smoke spec needs to discriminate real behavior, not just "didn't
   throw").
3. Need something the existing helpers don't cover (reading a file the
   host wrote, checking a `vscode.window` prompt, etc.)? Reach for
   `evaluateInVSCode` directly before adding a new bridge action — it's
   general purpose. Only extend `e2e/host-bridge/runner.ts`'s `handle()`-
   equivalent (currently just the generic evaluator, no fixed verbs) if
   you need something evaluate can't express.
4. Keep specs minimal — they prove harness plumbing, not tool behavior.
   Deeper interaction tests (drag-select, encode pipeline correctness,
   merge conflict resolution) belong in their own, more detailed specs
   once the tool itself is stable enough to be worth locking down that
   way.

## CI posture

Wired into CI as `.github/workflows/vscode-e2e.yml`, called from the root
`ci.yml` orchestrator alongside `smoke`/`size` — see
`.github/workflows/README.md` for the full orchestration picture (path-filter
gating on the `vscode` bucket, which is all of `tools/**`, `ci-passed` gate
membership, turbo cache sharing with the main `build` job). It runs on
`ubuntu-latest` under `xvfb-run -a` (the exact invocation
[microsoft/vscode-test's own sample CI workflow](https://github.com/microsoft/vscode-test/blob/main/sample/.github/workflows/ci.yml)
uses) — `xvfb` ships preinstalled on that runner image, confirmed against
`actions/runner-images`' published software list, so no extra system
packages are installed. `tools/vscode/.vscode-test/` (the downloaded VS
Code build) is cached across runs; see the cache-key comment in
`vscode-e2e.yml` for why a static key is safe long-term. On failure, the
job uploads the Playwright HTML report and traces as artifacts.
