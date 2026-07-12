# uikit a11y — horde execution: order, split, models, loop prompt

**Drives:** `uikit-a11y-phase-{0..4}-*.md` against `specs/uikit-native-a11y.md`.
**Shape:** stacked PRs per phase (repo's stacked-epic pattern), worktree `uikit-fork`, conventional commits.
**Authorship note:** this is the planner's independent orchestration analysis, built on the horde playbook (`~/.claude/skills/horde`). Where it lands on calls a stakeholder once floated (serialized foundation, Sonnet-wide fan-out, cross-vendor review at load-bearing units), it does so on the merits stated below; where it differs (Fable-high for delicate delegable units, orchestrator-implements-P0, orchestrator-owns-commits, Spark as escalation-only), the difference is deliberate.

---

## 1. Dependency-correct order

```
Phase 0 (core)  ─────────────►  SERIALIZED. Orchestrator implements it personally. Nothing dispatches before its gate.
   │
Phase 1 (projection + toolbar dogfood)
   │     T1.1 math core (Fable-high) → T1.2 react wiring ∥ T1.3 dogfood (Sonnet)
   │
Phase 2 (widgets)   T2.1–T2.8 fan out (Sonnet ×8, disjoint widget dirs, same tree)
   │                T2.L listbox (Fable-high, hot file) may run DURING the fan-out — different package
   │                T2.G grid dogfood after T2.L; T2.B bento after fan-out
   │
Phase 3 (diegetic)  T3.0 scene (Sonnet) → T3.1 ∥ T3.2 (Fable-high) → T3.3 manager (Fable-high, serialized)
   │                → T3.4 ∥ T3.5 (Sonnet)
   │
Phase 4 (XR)        T4.0 XR binding + emulate harness (Sonnet, sharp brief) → T4.1 session+controller-ray (Fable-high)
                    → T4.2a–d backends ∥ T4.3 gaze ∥ T4.4 metadata (Sonnet fan-out) → T4.5 overlay → T4.6 XAUR sweep (orchestrator)
```

**Why P0 is orchestrator-implemented, not dispatched:** every later unit consumes its API surface (`activate`, schema props, hidden-element lifecycle, `hasFocus` hoist). It is the single unit where (a) brief-transmission loss is most expensive, (b) the full spec context already lives in the orchestrator's head, and (c) an API-shape mistake multiplies across every subsequent worker. The playbook's "the orchestrator does the hardest parts" applies literally. Fallback if orchestrator context is running hot: dispatch to Fable-high with the Phase-0 plan as the brief and review line-by-line.

**Why phases stack rather than interleave:** Phases 1–4 each mutate the a11y core's behavior (projection rewires element positioning; visibility rewires exposure; the manager rewires focus routing). Interleaving invites cross-phase races on `hidden-element.ts`. The listbox (T2.L) is the one sanctioned overlap because it adds a role rather than changing shared behavior.

## 2. Parallel vs serial — by file contention, not optics

**Serialized (one writer, named owner per phase):** `properties/schema.ts`, `components/component.ts`, `events.ts`, `a11y/hidden-element.ts`, `a11y/activation.ts`, `a11y/focus-manager.ts`, `a11y/projection.ts`, `react/build.tsx`. A fan-out worker needing to touch these STOPS and reports — that need means the core API is wrong, which is an orchestrator decision, not a worker workaround.

**Genuinely disjoint (fan out, same tree — different files is enough because the orchestrator owns all commits):**
- Phase 2: eight `packages/uikit-default/src/<widget>/` dirs + their tests.
- Phase 4: `a11y/announce/backends/*.ts`, `a11y/adapters/gaze.ts`, spatial-metadata queries.
- Dogfood examples (`uikit-lucide/example`, `examples/react/uikit`, `examples/three/uikit`) — parallel with each other once their API dependency lands.

**Worktree isolation:** not worth the tax here. The fan-out units are file-disjoint within one tree, and the serialized units can't be parallelized anyway; a cold pnpm/turbo rebuild per worktree buys nothing. Skip it unless a Spark-escalation retry wants a scratch tree.

**Append-only contention:** `a11y/index.ts` + `src/index.ts` export lines — the orchestrator applies these at commit time; workers list needed exports in their report instead of editing.

## 3. Model routing (with reasoning)

Roles per the horde playbook: **Sonnet** = wide mechanical fan-out. **Fable at `high` effort** (never xhigh — it overthinks; dispatch via Workflow `agent(..., {model:'fable', effort:'high'})`, the Agent tool has no effort param) = delicate, correctness-critical units where plausible-but-wrong is expensive. **Codex GPT** = adversarial review, run by the orchestrator directly via `codex exec` (never wrapped in a Sonnet agent). **Spark** = escalation implementor only, Sonnet-wrapped, after honest repeated Sonnet failure. **Orchestrator (Opus)** = briefs, diagnosis-to-minimal-repro, every load-bearing gate, all commits, and the P0 implementation itself.

| Unit | Route | Reasoning |
|---|---|---|
| P0 all (schema, activation, Component, hidden-element, announcer) | **Orchestrator** | The floor; see §1. Failure mode: API-shape error propagating epic-wide |
| P1 T1.1 projection math core + oracle fixtures | **Fable-high** | Silent-wrong geometry passes wrong-oracle tests; orchestrator independently re-derives 2–3 fixture expectations before accepting |
| P1 T1.2 react wiring, T1.3 toolbar dogfood | Sonnet | Mechanical against a frozen API; probes are the guard |
| P2 T2.1–T2.8 widget bindings | Sonnet ×8 | Pattern-stamping from the spec table; per-widget tests discriminate |
| P2 T2.L listbox, T2.G grid dogfood | **Fable-high** | ARIA APG grammar (activedescendant/posinset) — wrong-but-plausible semantics that pass unit tests is the named failure mode of this epic |
| P2 T2.B bento pair | Sonnet | Labels + one explicit vanilla projection call |
| P3 T3.0 scene | Sonnet | Example plumbing |
| P3 T3.1 visibility, T3.2 spatial-nav, T3.3 focus manager | **Fable-high** each | Classification edge-cases, ordering hysteresis, and a focus-policy state machine whose bug class is a *silent focus trap* |
| P3 T3.4 switch-scan, T3.5 probes | Sonnet | Timer mechanics with spec'd algorithms; scripted probes |
| P4 T4.0 XR binding + emulate harness | Sonnet (escalate to Fable-high after 2 honest failures) | Integration wiring with a crisp end-to-end accept gate (scripted select → onActivate) |
| P4 T4.1 session awareness + controller-ray | **Fable-high** | Input-stream discrimination + session lifecycle; the original spec's blind spot lives here |
| P4 T4.2a–d backends, T4.3 gaze, T4.4 metadata, T4.5 overlay | Sonnet fan-out | Isolated modules, mocked-API contracts |
| P4 T4.6 XAUR sweep | **Orchestrator + Codex** | Compliance judgment, not code |
| Stuck units (any phase) | Spark via Sonnet wrapper | Different-model retry, not throughput; wrapper owns gates + Sonnet fallback |

**Adversarial review points** — orchestrator runs `codex exec` directly, in the background, at each phase boundary:

```
codex exec -s read-only -o /tmp/codex-a11y-p<N>.md \
  '<review brief: git diff <base>..HEAD; hunt list per phase>' < /dev/null
```

Hunt lists: P0 = API shape + schema surface; P2 = ARIA semantics vs WAI-ARIA APG; P3 = focus-policy state machine (trap/echo-loop hunt); P4 = XR focus/input model (the reviewer's original home turf). If codex is unavailable: proceed loudly without a review; never substitute a same-family model as the cross-vendor verdict. Treat findings as signals to re-derive ground truth, not automatic verdicts.

## 4. Commit & floor ownership

- **Orchestrator commits everything.** Fan-out workers implement, run their gates, and report staged-diff + evidence; nothing reaches the branch until the orchestrator has re-run the load-bearing gate and committed (atomic, conventional message, repo git identity, no AI attribution). Uncommitted unit output is disposable — that is what makes wide dispatch safe.
- **The load-bearing gate is the user-facing artifact, not the suite.** For this epic: the AT-visible outcome — accessible names in the live a11y tree, focus-ring pixels, live-region text, rect overlap — probed in a real browser. Green vitest with an unchanged a11y tree = silent no-op = not done (the dominant fan-out failure).
- Every brief carries the playbook's seven parts; report-back format: file:line of changes, pasted gate output, user-facing proof (probe log/screenshot), staged diff, honest Fully-implemented / Blocked / Workaround per sub-unit.

## 5. Live in-product probes (machine gates)

Browser automation (chrome-devtools MCP / claude-in-chrome / vitexec) against the vite dev servers. Canonical assertions:

```js
// P1 toolbar — names + count
const btns = [...document.querySelectorAll('[data-uikit-a11y] button')]
console.assert(btns.length === 3 && btns.every(b => (b.getAttribute('aria-label') ?? b.textContent).trim().length > 0))

// P1 — focus routing + ring: send real Tab keypresses, then
console.assert(document.activeElement?.closest('[data-uikit-a11y]') != null)
// pixel-probe the projected rect border for the ring color (canvas readback via the example's debug hook)

// P1 — announcer: keyboard-Enter the Copy button, poll ~300ms
console.assert(document.querySelector('[aria-live]').textContent.includes('Copied'))

// P1/P2 — rect overlap (example exposes window.__uikitA11yDebug.rectFor(id) in dev)
console.assert(iou(btn.getBoundingClientRect(), window.__uikitA11yDebug.rectFor('copy-manifest')) >= 0.9)

// P2 grid — ONE tab stop; ArrowRight ×3 advances aria-activedescendant posinset; Enter mutates
// selected-count text AND fires the live region. Multi-event rule: assert accumulation across
// ≥2 arrow presses, not a single event (a broken impl passes single-event tests).

// P3 — scripted camera via debug hook: drive the pose across ≥2 frames, assert tabindex/aria-hidden
// transitions per visibility policy, and the announce on offscreen focus.

// P4 — emulated XR (@pmndrs/xr emulate): scripted ray dwell ≥ debounce → manager focus (pixel probe);
// select → onActivate source 'xr-controller'; document.activeElement UNCHANGED in-session.

// Leak/StrictMode probe (every phase): remount the app twice, then
console.assert(document.querySelectorAll('[data-uikit-a11y]').length === EXPECTED_ROOTS)
```

**Not machine-probable — say so, don't fake it:** real headset SR behavior, haptic feel, spatial-audio localization, visionOS/Quest system AT, on-device AR DOM Overlay, macOS Voice Control. These are manual-checklist rows (P4.6 + matrix manual halves): release-blocking sign-offs, never loop gates. XR *logic* rows run on the emulated harness.

## 6. The loop prompt (paste to drive the epic)

```
You are orchestrating the uikit a11y epic in worktree .claude/worktrees/uikit-fork.
Load the `horde` skill FIRST and hold its discipline for the whole run.
AUTHORITATIVE DOCS: planning/superpowers/specs/uikit-native-a11y.md (design truth),
planning/superpowers/plans/uikit-a11y-phase-{0..4}-*.md (task truth),
planning/superpowers/plans/uikit-a11y-horde-execution.md (routing: order, split, models).

DIVISION: You implement Phase 0 yourself — it is the floor. From Phase 1 on, dispatch
per the routing table: Sonnet for the mechanical fan-out, Fable at effort HIGH (never
xhigh; via Workflow agent()) for the units the table marks delicate, Spark (Sonnet-wrapped
codex exec) only as escalation after two honest Sonnet failures on the same unit.
Every dispatch is a seven-part brief: context, exact task (files + signatures from the
plan), method (TDD red-first), gates with numbers, tailored DO-NOTs, anti-stall clause,
report-back format. Executors execute — put the anti-delegation clause in every brief:
"you are the worker; do not spawn sub-agents, do not invoke planning skills, implement
yourself."

LOOP until the stop condition:
1. Pick the earliest phase not gate-green. Dispatch its ready tasks per the routing table,
   respecting the one-writer rule on the serialized hot files (schema.ts, component.ts,
   events.ts, a11y core, react/build.tsx). Workers report staged diffs — THEY DO NOT COMMIT.
2. VERIFY, DON'T TRUST — on every report: diff what actually changed (fixtures/tests/configs
   especially), re-run the phase gate YOURSELF:
     pnpm --filter @three-flatland/uikit typecheck && pnpm lint && pnpm test -- packages/uikit/src/tests
   and run the phase's LIVE PROBE yourself in a real browser (horde doc §5) — the user-facing
   a11y artifact (AT tree, focus-ring pixels, live-region text, rect IoU) is the load-bearing
   gate; green vitest with an unchanged a11y tree is a silent no-op, not done. Then YOU commit
   (atomic, conventional, repo identity, no AI attribution).
3. A11y gates, every iteration: zero interactive components without an accessible name;
   focus routes to hasFocus AND the visual ring renders; announcer emits on activation;
   projected rect IoU ≥ 0.9 (phases ≥1); StrictMode double-mount leaves zero orphans;
   plus every machine row of the spec §11 matrix the current phase claims.
4. At each phase boundary run the cross-vendor review YOURSELF, in the background:
     codex exec -s read-only -o /tmp/codex-a11y-p<N>.md '<review brief: git diff <base>..HEAD;
     hunt: P0 API shape / P2 ARIA-vs-APG / P3 focus-trap state machine / P4 XR focus model>' < /dev/null
   Read the verdict yourself; triage EVERY finding fix-now or written stakeholder-deferral
   (acceptance criteria are the gate — no silent drops). If codex is down, proceed loudly
   without a review; never substitute a same-family model as the cross-vendor verdict.
5. On failure: reproduce and bisect to a minimal repro YOURSELF, then redispatch with the
   confirmed mechanism (facts, not hypotheses). Two failed redispatches → Spark escalation
   or take it over.
6. Tech debt met en route is fixed in the same change (iron law) unless a named workstream
   owns it — the kits' tsup DTS-worker OOM is owned by the tsdown migration; typecheck is
   the build gate, don't chase it.

DO-NOTS (tailor into every brief; each is a real failure class):
- Do NOT edit tests/fixtures/probes/acceptance rows to make them pass — fix code or block honestly.
- Do NOT ship wrong ARIA (no aria-checked on role=button, no invented roles, no tabindex>0);
  check the spec table / WAI-ARIA APG before writing attributes.
- Do NOT claim done without pasted gate output AND the user-facing proof; "compiles and tests
  pass" without an observable a11y-tree change is a no-op, not done.
- Do NOT touch files outside your named scope; never edit the serialized hot files from a
  fan-out task — stop and report. Do NOT run repo-wide formatters, lint --fix, git clean/reset/
  checkout-dot/stash, or delete anything outside your named files.
- Do NOT claim "pre-existing" without checking the baseline first.
- Do NOT add runtime dependencies (@pmndrs/xr stays example/dev-side, duck-typed at runtime),
  GLSL, WebGLRenderer/WebGLRenderTarget, or a THREE group for a11y.
- Do NOT weaken zod schemas or any-cast around the property system to silence types.
- Do NOT write interaction tests that a broken implementation also passes — multi-event paths
  (≥2 arrow presses, ≥2 camera frames) with accumulation asserts.
- Do NOT mark manual acceptance-matrix rows as passed from any automated run.
- Do NOT break ported-package constructor signatures (upstream signatures + R3F args are sanctioned).

STOP CONDITION: all five phase gates green ON YOUR OWN RE-RUN, twice consecutively with no
intervening change; every machine row of the spec §11 matrix green via live probe or emulated-XR
run; every manual row holds a written checklist entry (pending sign-off) or stakeholder-authorized
deferral; all cross-vendor findings triaged fix-or-deferral; stacked PRs open in merge order with
probe evidence (probe logs + focus-ring screenshots/gifs) attached. Then report: per-phase gate
evidence, matrix state, open deferrals, PR stack. If context runs low BEFORE the stop condition,
write the durable handoff (next action, in-flight state, bars, queue, environment) into
planning/superpowers/plans/uikit-a11y-horde-execution.md and say so — do not let the state die
with the session.
```

## 7. Repo norms this plan inherits

- **Atomic commits, don't hold** — orchestrator commits each verified unit as it lands.
- **Examples pair rule** — bento/wall-panel changes land in `examples/react/uikit` AND `examples/three/uikit`, or not at all.
- **E2E rationing** — live probes gate phases; vitest carries the inner loop.
- **Acceptance criteria are the gate** — deferrals are written and stakeholder-authorized, never implied.
- **Conventional commits** — releases cut from commit history; no hand-written changesets.
