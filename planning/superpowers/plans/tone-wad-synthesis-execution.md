# Tone + Wad Synthesis — Final Phase Execution Plan (serialized 2026-07-08)

Handoff for the model switch: **Sonnet becomes the executor**, **Fable is the advisor**. Written by the Opus orchestrator at the point of switch. Resume from this file + the task list (#47) + `~/.claude/projects/-Users-tjw-Developer-three-flatland/memory/`.

## Execution model (stakeholder-set, this phase only)
Not a single orchestrator. The loop:
1. **Advisor (Fable sub-agent)** — assess the plan / current state, produce guidance for the next iteration.
2. **Executor (Sonnet, main loop)** — fans out sub-agents to: implement, combine results, run **adversarial review** (Codex `codex exec` DIRECT, per horde skill — never a wrapped Sonnet), and **Fable UI review** where UI is touched.
3. **Advisor (Fable) again** — re-assess. Loop until the unit is done + verified.
Pin `model:` on every spawn. Codex for the adversarial diff sweeps.

## State at handoff — branch `preview/tools-combined` @ a575f519, ALL GREEN
- Worktree `.claude/worktrees/tools-combined`. This is the ONE PR branch. Base for PR: `feat-vscode-tools`. Closes #148 #149 #152 + files the review follow-ups.
- **SERIALIZE on tools-combined — NO more worktrees** (stakeholder directive). One writer at a time, directly on the branch. Worktrees caused coordination overhead; done with them.
- Everything from the live-review batch is merged + verified: audio multi-lib lenses, spread-song, search-fallback lens (`$(search) Searching…`/`$(search) Not Found`), long song + exact-duration stats, **Play⇄Stop toggle + source-tab binding**, distinct sounds, Wad file coverage, **shutdown fix (deactivate awaits sidecars — 566abd9f, DO NOT BREAK)**, single-session e2e (one window, reset-not-relaunch, bounded teardown), Normal Baker pair-open + redesign + polish, "FL Tools" menu + settings heading.
- Last authoritative gate: typecheck 0, builds 0, **e2e 54 passed exit 0, clean-exit sweep all zero**. Harness is hang-proof.
- Broad `pnpm test`: 1848 passed, 1 pre-existing `basisu-bench` wall-clock flake (verified pre-existing; not ours; leave it).

## THE UNIT — #47 Tone + Wad synthesis as first-class playable findings (IN THIS PR, required)
Stakeholder: "Tone and Wad sound generators should be first class." NOT decoys. The current `synthDecoys()` fixtures flip from zero-lens to playable ▶ Play (toggle) for the supported shapes.

### PROTOTYPE GATE — DONE, BOTH SHIP (2026-07-08)
Ran under both plain Node and Electron-as-node (`Code Helper (Plugin)`, `ELECTRON_RUN_AS_NODE=1`). All 7 tests (pitch accuracy, noise broadband/spectral-flatness, chord detection, envelope/release-to-silence, Wad routing) PASS on both runtimes, bit-identical DSP output between them. No getChannelData-class silent failure in either library.

**Tone.js**: clean ship. `Tone.setContext(rawCtx)` works directly (`Tone.getContext().rawContext === rawCtx`), explicit `.connect(nativeGainNode)` routing works, ticker falls back to `setTimeout` (not Worker — Tone's own fallback logic handles the missing-Worker-in-Node case correctly), envelope scheduling completes correctly. Zero import shims needed on either runtime.

**Wad**: ships, with ONE load-bearing implementation constraint. Wad creates its own PRIVATE `AudioContext` at module-`require()` time with no constructor injection point — routing its output into our shared analyser requires monkey-patching `window.AudioContext`/`webkitAudioContext` to a factory returning our real `AudioContext`, **done ONCE, before Wad's first-ever `require()`** in the sidecar process (require() caches the module — a second require after patching is a no-op, so ordering is everything). Since `sidecar.ts` is a long-lived process, this is a one-time startup-sequencing concern, not a per-play one — MUST be preserved in the real implementation. Import needs 3 shims (`document.querySelector` stub, no-op `window.addEventListener/removeEventListener`, empty `window.navigator`) — same 3 sufficient on both runtimes.

Full evidence (peak values, frequencies, spectral-flatness numbers, diagnostics) banked in this session's transcript; gate script deleted per the decodeAudioData precedent.

### Wad synth — TRACTABLE
`new Wad({source:'square'|'sawtooth'|'triangle'|'noise', env/filter/...})` is a DECLARATIVE config object → parse-don't-eval (same posture as the zzfxm song parser in `songResolver.ts`), reconstruct the Wad in the sidecar, play through the existing gain/analyser graph so stats/duration/toggle all work. New scanner rule in `parse.rs` (a Wad-synth kind, or extend Wad detection). Non-playable caveats (stay lens-less, graceful): `'mic'` (no device), `sprite`-with-no-source, `Wad.presets.*` (internal objects; could resolve if Wad is loaded — optional).

### Tone synth — HARDER, a real design fork (no eval)
Tone's API is IMPERATIVE method chains (`new Tone.Synth().toDestination().triggerAttackRelease('C4','8n')`), not a config object. Support ONLY a **narrow, statically-parseable subset** (a fixed set of `new Tone.<Synth>(...)` + `.triggerAttackRelease(<note>, <dur>)` shapes) and gracefully refuse everything else — do NOT execute user code. Tone coverage is intentionally partial; document the supported subset.

### Deliverables — STATUS (2026-07-08, Sonnet-executor/Fable-advisor loop)
- **wad.synth scanner detection: DONE, verified, committed `9d3a7718`.** 189→212 wait, 205 lib+1 golden+6 integration Rust tests (16 new), 67 TS tests. Partition rule (file-path→audio.file unchanged, 5 keywords→wad.synth, mic/absent/presets→nothing) verified both directions. Bare-identifier var-ref: scanner always-emits permissively, client validates (matches zzfxm precedent).
- **tone.synth scanner detection: DONE, verified, committed `7290e3e3`.** 212 Rust tests total (21 new), descend-from-`triggerAttackRelease` design (not ascend-from-`new_expression`), 9-class closed allowlist, NoiseSynth's no-note signature, PolySynth voice-type-as-first-arg with full-refusal-if-unsupported, fully-static-or-nothing args (no varRef permissiveness — deliberate, since a non-literal arg just means no finding). Config entirely out of scope for v1 (not load-bearing for playability).
- **Sidecar playback (`tools/zzfx-play`): DONE, verified, committed `bda365e0`.** `playToneSynth`/`playWadSynth`, both routed via explicit `.connect()` (never `.toDestination()`/Wad's own default). `trackPlayback` generalized from `AudioBufferSourceNode.onended` to a completion `Promise` — Wad's real `.play()` promise; Tone's a computed `setTimeout` from `.envelope.release` (non-uniform per-class access, handled). Wad monkey-patch-before-first-require verified with a real ordering probe, reverted after. 88 new tests (zzfx-play package), zero regressions.
- **Extension wiring (provider.ts/register.ts/2 new resolvers/fixtures/e2e): IN PROGRESS** (`synth-wiring` agent). Includes the Tone cold-start fix — advisor caught that the "narrow race" framing was wrong: it's a GUARANTEED Nack on every session's first Tone click (`loadToneEngine` only kicks off from inside `playToneSynth` itself). Fix: `Nack` gains a `code` field, extension-side retry-with-backoff (~4s budget) before surfacing any error — sidecar-side lazy-Nack design stays as-is (eager-warm rejected: permanently starts Tone's ticker for zzfx-only sessions).
- Coverage at 3 tiers throughout: `parse.rs` unit + golden interop (regenerated via the float-faithful Python script, never JS `JSON.stringify`) + e2e (in progress).

### Gates (define green; executor runs them, verifies clean-exit itself)
- typecheck 0 (vscode + zzfx-play + e2e tsconfig); fresh builds (zzfx-play then vscode); vitest (zzfx-play, codelens-service); `cargo test` + golden interop (Rust + `pnpm --filter @three-flatland/codelens-service test`).
- ONE full `pnpm --filter @three-flatland/vscode test:e2e` — MUST exit 0 (harness hang-proof), then `pgrep -f fl-vscode-e2e-userdata` / `codelens-service/sidecar/target` / `zzfx-play/dist/sidecar.js` ALL EMPTY. Paste evidence.
- Scoped prettier only. Commits: conventional, repo identity Justin Walsh <contact.me@thejustinwalsh.com>, NO AI attribution, `Claude-Session` trailer, stage EXACT paths.

## After #47 lands green: finish the PR (stakeholder: "when we are done")
1. **Codex adversarial sweep** of the combined diff — `codex exec -s read-only -o <file> 'git diff origin/feat-vscode-tools..HEAD ...' < /dev/null`, run DIRECTLY, background; verify every finding vs source before fixing.
2. Fix round if needed; re-verify.
3. Open the ONE PR: base `feat-vscode-tools`, closes #148 #149 #152, references #147. Body: per-issue acceptance, the review-driven additions (toggle, tab-binding, search-fallback, baker redesign+polish, shutdown fix, single-session e2e, Tone/Wad synth), gate evidence, Codex cycles. Use `gh api --method PATCH` for body edits (gh pr edit silently fails on this repo).
4. File follow-ups under #147 (the pre-existing #18-#24, #37 ledger).

## Hard-won norms (DO NOT relearn)
- **DO NOT break the shutdown fix** (566abd9f): `deactivate()` is async + awaits `shutdownSidecar()`/`shutdownPlaySidecar()`. Bounded `teardownWindow` in fixtures.ts (5s race + SIGKILL). Every e2e must EXIT with zero lingering sidecars.
- **No `getChannelData().set()`** to fill buffers (silent under Electron); synthesis math is fine, own the output path (`playSampleChannels`/`playBuffer`).
- Golden regen via the built binary, not `JSON.stringify`.
- Verify agent reports against the worktree before accepting (this session caught a faked-green e2e and a real teardown hang this way). Run the load-bearing gate yourself.
- One writer on tools-combined; e2e windows steal macOS focus — ration runs, one authoritative run per gate.
- Mailbox is lossy/crossing; idle notification = inspect the worktree, don't treat as status.
</content>
