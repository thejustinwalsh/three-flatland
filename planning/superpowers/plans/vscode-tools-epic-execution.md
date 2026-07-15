# VS Code Tools Epic — Execution Plan (serialized 2026-07-08)

Authoritative continuation plan for the #147 tools epic. Written at orchestrator-context exhaustion; any orchestrator (Opus seat per stakeholder) can resume from this file + the task list + `~/.claude/projects/-Users-tjw-Developer-three-flatland/memory/`. Commit this file to the epic branch when the worktree frees.

## Product definition (stakeholder-set)
**v1 = the Flatland Tools Audio Plugin + editors, ONE PR.** "Play from code lens needs to work for everyone — zzfxm, threejs, etc." Coverage matrix: zzfx (play+edit), ZzFXM (play; EDIT WEBVIEW EXPLICITLY WAITS), and generic audio-file play for three.js AudioLoader, Howler, Wad (rserota/wad), `new Audio`, `fetch`+decodeAudioData, `Tone.Player`. OUT of v1 (proposed, not yet stakeholder-ratified): Tone/Wad SYNTHESIS-mode snippet execution (no arbitrary user code in the player).

## Branch/worktree map
- **PR branch**: `preview/tools-combined` — worktree `.claude/worktrees/tools-combined`. Contains ALL epic work (zzfx suite incl. harness+sidecar lineage, normal baker, #152 fixtures, C1/C2). Base for PR: `feat-vscode-tools`. Closes #148 #149 #152.
- `feat/audio-scanners` — worktree `.claude/worktrees/audio-scanners`, off tools-combined @095fec36. A1 lives here; merge back after A1+C3 land.
- Old feature branches (zzfx-studio, normal-baker-gui, zzfx-codelens-service, vscode-e2e-harness, schemas-atlas-fixtures) = history/cherry-pick sources only.
- ONE WRITER PER WORKTREE — orchestrator included; wait for confirmed stand-down.

## SETTLED (2026-07-08, end of Fable session) — epic branch @ e8957b1d, clean, all agents stood down
- **C3 DONE + verified** (tuner-ui finished it after reassignment churn; orchestrator ran final gates: 458 units broad / 40/40 full e2e): grid-align + generate + split w/ N4 inheritance, volume trim (dB setting, both paths). NOTE: brief's "no undo stack" was WRONG — baker has zundo since N3; C3 used coalesced undo steps + count-labeled buttons instead of confirms. A late C3 report from tuner-ui may still arrive — already verified, reconcile-and-ignore.
- **A1 DONE + verified** (incl. Wad addendum): 166 cargo / 52 TS green; feat/audio-scanners MERGED into tools-combined (1a544036).
- **Integration seam fix e8957b1d** (orchestrator-authored): A1's discriminated Finding union vs pre-A3 extension — zzfx flows narrowed to kind 'zzfx.call' via type guards at every findings lookup; provider skips new kinds until A3. Full e2e 40/40 after. A3 REMOVES the provider skip when it adds the new lens kinds.
- Known flakes: basisu-bench local-only perf test fails under gate load, passes solo (documented class); first `pnpm test:e2e` invocation occasionally errors at launch — rerun once.

## Next units (briefs ready to dispatch)
### A2/A3 — player + lens wiring (after A1 + C3 both land and are merged into tools-combined)
One unit, worktree tools-combined, suggested owner: whichever of normals-webview/fresh-Sonnet is free; Fable if judged hard.
1. **PROTOTYPE GATE FIRST**: node-web-audio-api `decodeAudioData` format coverage under ELECTRON_RUN_AS_NODE (helper binary at `/Applications/Visual Studio Code.app/Contents/Frameworks/Code Helper (Plugin).app/Contents/MacOS/Code Helper (Plugin)`) — wav/mp3/ogg/webm minimum; bank evidence before building. Remember: `getChannelData()` is a DETACHED COPY under electron-as-node — decodeAudioData returns a buffer we only READ into a source, so unaffected, but any sample manipulation must use copyToChannel (see memory `node-web-audio-api-gotchas` + tools/zzfx-play/CLAUDE.md).
2. Player (`tools/zzfx-play`): `{cmd:'playFile', path}` — decode + play via the existing gain/analyser graph. Consider package rename → `audio-play` (pre-release window; own commit; update root CLAUDE.md table row + all imports).
3. Extension: provider lens titles per kind — `zzfxm.song` → ▶ Play/⏹ Stop (Stop sends stopSong); `audio.file` → ▶ Play. zzfxm Play: resolve song text at argRange/defRange (generalize the resolveParams nested-array parser — arrays of arrays of numbers/nulls/strings; REFUSE anything else, loadError posture), send existing `playSong`. audio.file Play: resolve path (source-file dir → workspace root → `public/` conventions; lens ABSENT when unresolvable on disk), send playFile. Remote fallback: same vscode.env.remoteName degrade as zzfx.
4. Fixtures/e2e: add small real .wav + .ogg to e2e fixture workspace + a fixtures src file with zzfxm song (literal + var), three.js AudioLoader line, Howler line, Wad line, commented-out decoys. e2e: lenses appear per kind w/ correct titles; zero lenses on comments/unresolvable paths; playFile spawns/reuses sidecar (PID assertion pattern from zzfx-play.spec); stats.peak > 0 after playFile of the .wav (the audibility guard tier — vitest CANNOT catch electron-only silence, only e2e can).
5. Gates: typecheck, FRESH full build, broad vitest (record baseline first, must go up), scoped prettier, ONE full test:e2e.

### Post-build pipeline to PR
1. Merge feat/audio-scanners → tools-combined (orchestrator; after C3 lands to avoid worktree contention).
2. Launch stakeholder everything-window: fresh timestamped scratch dir (`cp -R tools/vscode/e2e/fixtures/workspace $S/live-$(date +%H%M%S)`; `code --new-window --extensionDevelopmentPath=<tools-combined>/tools/vscode <scratch>/src/sounds.ts <scratch>`). Stakeholder verdicts owed: Z8 design sign-off (task #25 open), overall v1 pass, Tone/Wad-synthesis-exclusion ratification.
3. Final Codex adversarial sweep of the COMBINED diff (`codex exec -s read-only -o <file> 'git diff origin/feat-vscode-tools..HEAD ...' < /dev/null`, run DIRECTLY, background). Verify every finding against source before dispatching fixes. Prior verdict history: 3 cycles, every BLOCK fixable in one round.
4. PR: base feat-vscode-tools, closes #148 #149 #152, references #147/#162. Body: acceptance checklists per issue, Codex cycles + fix rounds, accepted residuals (atomic-save rename window — documented self-healing; position-sensitive save refusal UX → follow-up #18), gate evidence, reconciliation notes (tool registry pattern; prettier-drift partially self-resolved in atlas App.tsx). Use `gh api --method PATCH` for any body edits (gh pr edit silently fails on this repo).
5. File GH follow-up issues under #147 at PR time: tasks #18 (finding re-location), #22 (bake.ts fractional guard), #24 (VSIX packaging: sidecar binaries ×5 platforms + node-web-audio-api platform-strip), #37 (turbo cycle presets→schemas→normals→three-flatland→presets), #19/#20/#23 stay on #117-cleanup ledger (task #10).

### Task #10 (unchanged, orchestrator-owned): #117 rebase/cleanup/merge + #162 atlas convergence
After the epic PR merges into feat-vscode-tools: retarget #117 to main via REST PATCH, rebase/cleanup (fold ledger items: printWidth pass as ONE formatting commit, webview pre-init-race audit #19, ajv/sync-pack hygiene #23), un-draft, merge. Then #162 convergence as immediate follow-up (schemas owns AtlasJson w/ mesh field; one packer=MaxRects; polygon.ts preserved verbatim; bake convention; one PNG decode; #155 vite plugin follows). #162 blocks the RELEASE, not #117's merge. See memory `vscode-tools-merge-ownership`.

## Process norms (hard-won; enforce in every brief)
- Seven-part briefs; stakeholder quotes verbatim; DO-NOT lists; exact gate commands with pass criteria.
- Reports: open w/ `git log --oneline -3` + `git status --short`; item-by-item vs the LATEST brief; positive grep confirmations when a prior report over-claimed.
- Mailbox is LOSSY/CROSSING: idle notification → inspect worktree (clean+new commit=done, verify yourself; clean+no commit=brief unconsumed, re-nudge "BEGIN NOW"+msg id; dirty+stale=stalled, resume or take over). Two failed starts → reassign/fresh agent. Task owner field AND description must agree (learned the hard way).
- e2e verdicts only after an immediately-preceding FRESH full build (stale-dist false alarms happened twice). ONE full e2e per unit, at the end; orchestrator verifies once per gate. VS Code windows steal macOS focus — runs are rationed.
- Verify, don't trust: orchestrator re-runs load-bearing gates, diffs scope vs claim, re-derives surprising results (the falsification standard: revert-the-fix to prove a guard can fail).
- Model tiers (stakeholder): Opus orchestrates; Fable agents for hard tasks/large-scope planning/UI review+enhance; Sonnet for implementation breadth; pin `model:` on every spawn. Reliability may override tier with disclosure.
- Commits: conventional, repo identity (Justin Walsh <contact.me@thejustinwalsh.com>), NO AI attribution ever, stage by exact path, scoped formatting only.
