# Card-Game Showcase — Design Spec (Epic 2)

> **Status:** Brainstorm complete; spec frozen pending review. **Downstream:** consumed by `superpowers:writing-plans` (→ implementation plan) and `creating-github-issues` (→ issue tree). Issue hierarchy is provided explicitly in §13 so the issue-creator uses *this spec's* breakdown as the parent/child tree.
>
> **Audience:** the implementer is an agent (or fleet of subagents). Human review only at labeled `[REVIEW GATE]` points (§12). Sections are addressable so a fresh subagent dispatched to a single subsystem can work from its section + cited dependencies alone.
>
> **Replaces:** `planning/superpowers/specs/2026-05-27-card-game-showcase-prerequisites.md` (the readiness/prereq-flagging precursor; superseded by this spec).

## 0. Goal and dependency

Build a **playable head-to-head alchemy-card duel** showcase that exercises every modality of the three-flatland renderer in a single composited scene: 3D gameboard with standard scene lighting, 2D card faces composed and lit inside a render-target atlas, those faces texture-mapped onto 3D card meshes re-lit by scene lighting, 2D animated pixel-art avatars billboarded inside the 3D pass, a flatland UI overlay, and a perspective camera. The 3D directional light drives the foil sheen *inside* each card's atlas content via a per-card light driver — the headline integration that demonstrates the unified lighting works under genuine 2D⇄3D coupling.

**Hard dependency:** Epic 1 — Lighting Unification (`planning/superpowers/plans/2026-05-27-lighting-unification.md`). The showcase consumes Epic 1's `FlatlandLightsNode`, per-material `lightsNode`, light subclasses, layer-based isolation, and `lightCollector`. This spec treats Epic 1's deliverables as available primitives.

## 1. Decisions locked during brainstorm

These are the decisions that bound this spec; changing one requires re-brainstorming.

| # | Decision | Rationale |
|---|---|---|
| D1 | Playable game (not tech-demo, not vignette) | User intent — real win/lose, real AI, real rules. |
| D2 | Format: head-to-head duel vs AI (one human seat, one AI seat) | Naturally motivates every modality — table, hand faces, faces-on-3D, opposed avatars, HUD, perspective across the table. |
| D3 | One combined spec covering prereqs + rules/AI + showcase assembly | User-directed. Spec is unified; implementation plan will phase the build internally. |
| D4 | Card faces live-composed from flatland sprites + slug text (not Skia, not pre-baked PNGs) | Maximally exercises the lit-2D pipeline + slug; matches three-flatland's text rendering subsystem (`@three-flatland/slug`). |
| D5 | Card meshes in the 3D pass are 3D quads sampling a single shared atlas RT (UV-window per card); animations are 3D mesh transforms (deal, flip, play) | Atlas = sprite-batched flatland scene → one RT; mesh animations are simple transforms. |
| D6 | Avatars are flatland `AnimatedSprite2D` in **cylindrical billboard** mode inside the 3D MAIN pass; subjects are pixel-art alchemy archetypes (wizard / witch / warlock / knight). | True subject of the "2D sprites in 3D pass" modality; per-material lightsNode for isolation. |
| D7 | Ruleset: Elemental Clash — HP duel, simultaneous-reveal mind-game, 4-element directed counter-cycle, Metals as defense/boost, Substances/Primes as reagents, Processes as verbs + finishers | Smallest "real" game; bounded AI; dramatic feedback exercises all visual modalities. |
| D8 | Auto-balance via **CMA-ES** over per-card numeric parameters (no rule-text mutation); agent personas calibrate "fun" via the daemon | Daniel-objection-resolved: numeric-only tuning + numeric optimization + synthetic playtest. |
| D9 | Runtime: long-running **WebSocket daemon** owns the rules engine; tiny **CLI** wraps it; **Claude Code skill** drives everything; subagents are stateless workers. | Cost discipline + state-ownership clarity + parallelism via subagents. |
| D10 | **Production / dev split** is enforced: prod bundle is rules engine + renderer + embedded tuned numbers only; daemon/CLI/tuner/personas live in `src/dev/` + dev skills, never reach prod. Five enforcement gates. | The dev infrastructure cannot leak into shipped showcase. |
| D11 | Implementation is agentic; humans review at labeled gates only. | User-directed. All workflows specified as skill invocations + CLI calls. |
| D12 | "Nothing valuable goes out-of-scope" — everything with value lives in the epic as a numbered phase. | User-directed discipline; replaces "v1/future/deferred" language. |

## 2. Architecture overview

The showcase is one workspace package, `minis/alchemy-duel`, structured for a strict prod/dev cut. It is composed of seven subsystems with declared interfaces; each is addressable in §4–§10.

```
minis/alchemy-duel/
├── src/
│   ├── rules/                  # Pure deterministic state machine (SHIPPED)
│   ├── renderer/               # 3D scene, atlas authoring, avatars, HUD (SHIPPED)
│   ├── ecs/                    # Koota systems for state→diff→intent→animate (SHIPPED)
│   ├── prod-entry.ts           # The shipped composition root (SHIPPED)
│   └── dev/                    # DEV-ONLY; excluded from prod bundle
│       ├── daemon/             # WebSocket daemon + session store
│       ├── cli/                # duel-cli (the only surface subagents touch)
│       ├── balance/            # CMA-ES tuner, simulator, metrics, feelbad replays
│       └── personas/           # persona prompts + LLM agent harness
├── balance/
│   ├── current.json            # SHIPPED — embedded as compile-time constants
│   ├── personas/*.json         # dev-only
│   ├── feedback/*.jsonl        # dev-only (gitignored or curated)
│   ├── feelbad-cases/*.json    # dev-only (committed; regression fixtures)
│   └── history/*.json          # dev-only
├── assets/
│   ├── data/deck.json          # 28-card alchemy deck (from ~/Developer/alchemy-cards)
│   ├── parchment.png           # cardstock background
│   ├── ornaments.png           # decorative borders sprite sheet
│   ├── foil-overlay.png        # foil pattern alpha
│   ├── foil-normal.png         # foil normal map (drives lighting response)
│   ├── card-surface-normal.png # 3D card-mesh micro-grain + foil normal
│   ├── fonts/                  # *.ttf + baked *.slug.glb via slug-bake
│   ├── avatars/                # pixel-art sprite sheets per archetype
│   ├── table/                  # 3D table mesh + materials
│   ├── design-reference/       # screenshots of alchemy-cards' baked output (visual target)
│   └── demo/canonical-match.json   # SHIPPED — deterministic replay seed for visual regression
├── scripts/
│   └── verify-prod-bundle.ts   # CI gate; rejects forbidden tokens in prod chunks
├── package.json
├── vite.config.ts
└── tsconfig.json

.claude/skills/                 # dev-only; never bundled
├── balance-playtest/SKILL.md
├── balance-tune/SKILL.md
├── add-card/SKILL.md
├── add-intent/SKILL.md
├── add-persona/SKILL.md
├── capture-goldens/SKILL.md
├── validate-perf/SKILL.md
└── verify-prod-bundle/SKILL.md
```

**The seven subsystems** (each has a dedicated section):
1. Duel rules engine + AI (§4).
2. Headless simulator + CMA-ES tuner + persona playtest + daemon + CLI + skill (§5).
3. Rendering architecture + 3D→atlas light driver (§6).
4. Prerequisites P1–P4 (§7).
5. Card-face pipeline (§8).
6. Data flow + state model + ECS (§9).
7. Testing strategy + bundle hygiene (§10).

§11 specifies the agent contributor API (skills); §12 enumerates `[REVIEW GATE]` checkpoints; §13 provides the issue hierarchy.

## 3. Phasing discipline (applies to every subsystem)

Per Decision D12, nothing valuable is "out of scope." Each subsystem declares its phases inline. A phase has:
- **Value** — what user-visible/system-visible improvement it delivers.
- **Gating condition** — what makes it safe/right to start (typically: an earlier phase shipped, or a measurement showing the need).
- **Acceptance** — concrete, machine-checkable.

Default phase count per subsystem is 1 unless §4–§10 declares more.

---

## 4. Subsystem A — Duel rules engine + AI (Elemental Clash)

### 4.A.1 Setup
Two seats (player 0 = human, player 1 = AI), each HP 30, each with an identical mirrored 28-card deck shuffled with seeded PRNG, drawing to a hand of 5. Discard reshuffles when the deck empties. Match ends at 0 HP.

### 4.A.2 Core loop
Per round:
1. **Commit** — both seats secretly commit one card face-down.
2. **Reveal** — both reveal.
3. **Resolve** — apply per-card effect resolution per the card-role rules.
4. **Draw** — both draw to 5 if their hand is below 5.

### 4.A.3 Card-role rules
- **Elements (4: Fire, Water, Air, Earth) = attacks.** Counter-cycle **Fire → Air → Earth → Water → Fire** (each beats the next). On reveal: if your element beats theirs, you deal full power, they deal reduced (half); non-adjacent pairs (e.g. Fire vs Earth) are mutual full-power clashes. Each element has a base power (numeric param, CMA-ES tunable).
- **Metals (7: Gold·Sol, Silver·Luna, Mercury, Copper·Venus, Iron·Mars, Tin·Jupiter, Lead·Saturn) = defend.** Committing a Metal instead of an Element is a pure shield round (the bluff layer — your commit could be attack or defend, opponent doesn't know). Per-metal shield magnitude is CMA-ES tunable.
- **Substances (5: Antimony, Vitriol, Arsenic, Aqua Fortis, Aqua Regia) + Primes (2: Sulfur, Salt) = reagents (instant).** Cast as instant effects when drawn (not committed). Aqua Fortis = direct damage ignoring shield; Aqua Regia = dissolves opponent's committed Metal; Vitriol = burst; Arsenic = poison-over-time; Antimony = cleanse/heal; Sulfur/Salt = small buffs. Per-reagent magnitude tunable.
- **Processes (10: Amalgam, Philosopher's Stone, Alembic, Crucible, Calcination, Tria Prima, Dissolve, Coagulate, The Great Work, Aurum Potabile) = verbs + finishers.** Categorized:
  - **Core verbs (6, named effects in Phase 1):** *Calcination* (next Fire dealt is doubled), *Dissolve* (draw 2), *Coagulate* (gain shield), *Crucible* (discard + redraw), *Alembic* (peek opponent's hand), *Amalgam* (combine two Metals' shields into one stack).
  - **Finishers (3, signature cards — dominance-exempted per §5.B.4):** *Philosopher's Stone* (big swing), *Aurum Potabile* (heal to full), *The Great Work* (heavy direct damage).
  - **Long-tail (1, simple in Phase 1):** *Tria Prima* — ships as a generic draw-2-and-buff in Phase 1; gets its richer effect (synergy with Sulfur + Salt + any Metal in hand) in Phase 2 of the rules.

### 4.A.4 AI (counter-pick heuristic)
Deterministic; tracks opponent discard memory; picks counter-element when confident, shields when low HP, fires reagents at HP thresholds. No tree search. Returns one `Action` per call; same `Strategy` interface used by persona LLMs (§5).

### 4.A.5 Public surface (rules engine)
```ts
class RulesEngine {
  constructor(params: BalanceParams)
  applyAction(state: DuelState, action: Action, rng: RNG): DuelState
  legalActions(state: DuelState, player: 0 | 1): Action[]
  view(state: DuelState, player: 0 | 1): PerspectiveView       // fog of war
  isTerminal(state: DuelState): boolean
  winner(state: DuelState): 0 | 1 | null
}

interface DuelAI {
  chooseAction(state: DuelState, player: 0 | 1, rng: RNG): Action
}

class HeuristicAI implements DuelAI { /* counter-pick policy */ }
```

`DuelState`, `PlayerState`, `Action` types per §9.

### 4.A.6 Acceptance criteria
- [ ] `applyAction(state, A, rng=seeded(X))` is pure: identical `(state, A, X)` → identical `state'` across 10k repeated runs.
- [ ] `legalActions` returns exactly the actions `applyAction` accepts without error; mismatch found by fuzzing fails the unit test.
- [ ] Every card from `deck.json` has an effect-table entry mapped to a typed `Action` with a unit test asserting the documented state delta.
- [ ] Element counter-cycle resolution test: 4 × 4 = 16 pair matrix produces the predicted advantage/clash outcomes.
- [ ] HeuristicAI test: with a fixed opponent commit and a fixed hand, returns the deterministically-correct counter-action.
- [ ] Integration: a full match runs from initial state to terminal in `< 100 ms` headlessly with two HeuristicAI seats and a fixed seed; bit-identical across runs.

### 4.A.7 Phases
- **Phase 1.** Engine + AI per §4.A.1–§4.A.5. Core Process subset implemented with named effects; long-tail Processes are simple draw/utility.
- **Phase 2.** Richer Process effects for the long tail (*Tria Prima*, additional Amalgam variants); driven by persona-feedback finding the long tail "boring" or under-played.
- **Phase 3.** Explicit per-card cost mechanic (essence-cost-to-play) + cost-to-effect curve tuning (paired with §5.B.5's cost-as-denominator metric).

---

## 5. Subsystem B — Simulator + CMA-ES tuner + personas + daemon + CLI + skill

### 5.B.1 Headless simulator
Pure CPU, no rendering; pulls in the rules engine + any `DuelAI` Strategy. Parallelizable across `worker_threads`.

```ts
function simulateMatch(deck, p0AI, p1AI, seed): MatchRecord     // bit-identical replay-friendly
function simulateBatch(params, n, seedBank, p0AI, p1AI): Metrics  // shards across workers
```

`Metrics`:
- `p0Winrate`, `p1Winrate`, `firstPlayerAdvantage`
- `lengthHistogram`, `medianLength`
- per-card `playrate`, `winrateWhenPlayed`
- `synergyOutliers` (2-card pair-uplift Z > threshold)
- `comebackRate` (trailing-at-midpoint→wins fraction)
- `decisionTension` (top-2 AI utility-gap mean — *reported* not optimized)
- `reagentImpactEntropy` — *reported* not optimized
- `essentialityResults` — per-card asymmetric leave-one-out: for each `card_i`, run a batch where player 0 keeps the full 28-card deck and player 1's deck has `card_i` removed (27 cards). Pass if player 1's winrate is `≥ 45%` (i.e. removing `card_i` does not concede the match). Fail if `< 45%` → `card_i` is "essential" and balance fails the hard gate.
- `mechanicRedundancyClusters` (Phase 2)

### 5.B.2 CMA-ES tuner
Parameter vector θ ≈ 30–40 dims: `elementPower[4]`, `metalShield[7]`, `reagentMagnitude[7]`, `processMagnitude[10]`, plus a few globals (HP, hand size, draw count). Bounded per-dim. Uses [`cma-es`](https://www.npmjs.com/package/cma-es) Node package (or a small TS port; whichever passes the verify-prod scan as dev-only). Population ~24, generations cap configurable, wall-clock cap configurable.

### 5.B.3 Composite loss
```
L(θ) = w_fair      · fairnessLoss              (tight: |0.5 − p0Winrate| with σ band)
     + w_viability · viabilityLoss             (per-card floor: winrateWhenPlayed ≥ 0.35, playrate ≥ 0.05)
     + w_synergy   · synergyOutlierPenalty     (Z-score on pair-uplift; tabletop-creator anti-pattern)
     + w_runaway   · snowballPenalty           (max(0, comebackRateFloor − observed))
     + w_redundancy · mechanicRedundancy        (Phase 2; weight 0 in Phase 1)

Hard gate (not in L): essentiality(card_i) ≤ 1   ∀ i ∈ deck
Exemption: signatureCards (Philosopher's Stone, Aurum Potabile, The Great Work)
           ignore viability+dominance terms (intentional asymmetry, per Daniel)

Reported (NOT optimized): decisionTension, reagentImpactEntropy, lengthDistribution.
These appear in reports; persona playtest calibrates their warning bands.
```

Weight defaults committed; overridable per run via CLI flag.

### 5.B.4 Daniel + tabletop-creator article principles folded in
- Numbers-only mutation: tuner cannot touch rule text or effect kind, only numeric magnitudes.
- Diminishing-returns modeling: stacking effects (poison stacks, shield piles) modeled as `sqrt(stack)` or `log(1+stack)`, not linear — prevents tuner discovering "stack-to-infinity" wins.
- `signatureCards` config exempts designed-asymmetry cards from dominance/viability terms.
- Viability floor at "worthy of consideration" (35% wr, 5% pr), not parity — per Daniel.
- Per-card cost conversion (Phase 3 of §4): all costs reduce to a common essence denominator, per Daniel.
- Fun metrics report-only; tuned via persona feedback band recalibration (§5.B.6), not by direct optimization — per Daniel's "balance ≠ fun."

### 5.B.5 Agent persona playtest
Five v1 personas (each a versioned JSON + system-prompt template):
- **Aggro Anna** — short matches, big damage, frustrated by stalls.
- **Control Carlos** — long thinky matches, frustrated by burst.
- **Combo Carla** — values Calcination→Fire-style chains.
- **Casual Curtis** — first-time player, expects to occasionally win.
- **Reviewer Rita** — analytical, scores decision-interestingness.

Personas run as LLM subagents using the `duel-cli` tool to drive matches via the daemon. Two execution modes:
- **Headless** (primary, ~50–200 matches per pass, run after CMA-ES candidate convergence) — direct daemon, deterministic.
- **Live** (smaller cadence, ~5–10 matches per persona per release candidate, via vitexec scripts piloting the renderer) — exercises hit-testing latency, animation pacing, slug text readability, foil sheen at perspective angles.

### 5.B.6 Feedback loop
Per playtest pass, the daemon writes structured tags (`feelbad | boring | surprising | satisfying | confusing` + end-of-match rubric scores `fun/fairness/clarity/comeback/interesting` 1–5) to `<showcase>/balance/feedback/<run>.jsonl`. The `balance-playtest` skill aggregates and emits:
- **Persona-consensus rules** — if ≥3 of 5 personas tag the same card `feelbad`, add a soft constraint to next CMA-ES run (typically a `viabilityFloor[cardId]` bump or `synergyWeight` increase). Auto-generated; designer-overrideable at the `[REVIEW GATE]`.
- **Fun-band recalibration** — fun-proxy bands move to where Reviewer Rita's "interestingness" scores correlate.
- **Feelbad regression fixtures** — every `feelbad` tag's match seed + persona + trigger turn becomes `balance/feelbad-cases/<slug>.json`. Future tuning runs replay these and assert they no longer trigger.

### 5.B.7 Daemon + CLI + skill (the runtime architecture)
**`duel-daemon`** — long-running Node WebSocket server (dev-only); owns rules engine + concurrent session store; persists transcripts + feedback to disk. Surface:
```
session.start    { persona, seed, opponent, params? } → { sessionId }
session.view     { sessionId, player }                → PerspectiveView
session.actions  { sessionId, player }                → Action[]
session.play     { sessionId, player, actionIndex }   → { stateΔ, terminal? }
session.tag      { sessionId, player, kind, card?, why } → ok
session.rubric   { sessionId, player, scores }        → ok
session.end      { sessionId }                        → { transcriptPath, feedbackPath }
batch.sim        { params, matches, seedBank, ai0, ai1 } → Metrics
```

**`duel-cli`** — the only surface subagents touch:
```
duel-cli session start --persona=<id> --seed=<n> --opponent=heuristic
duel-cli view     --session=<id> --player=<n>
duel-cli actions  --session=<id> --player=<n>
duel-cli play     --session=<id> --player=<n> --action=<index>
duel-cli tag      --session=<id> --player=<n> --kind=<k> [--card=<id>] [--why="…"]
duel-cli rubric   --session=<id> --player=<n> --fun=N --fairness=N --clarity=N --comeback=N --interesting=N
duel-cli end      --session=<id>
duel-cli batch    --params=<file> --matches=<n> --seed-bank=<n> --ai0=heuristic --ai1=heuristic
duel-cli playloop --persona=<id> --matches=<n> --seed-bank=<n> --opponent=heuristic
```

**`balance-playtest` skill** — see §11.

### 5.B.8 Production / dev separation
Per Decision D10, five enforcement gates ensure the daemon/CLI/tuner/personas never reach prod:
1. **`src/dev/` directory rule** — entire dir is dev-only, excluded from prod bundle entry in `vite.config.ts`.
2. **Compile-time constant embedding** — `balance/current.json` imported as JSON at build time into `src/rules/balance.ts`; prod has no override path.
3. **`import.meta.env.DEV` guards** in renderer for any optional "attach to dev daemon for live spectating" path — dynamic imports are DCE'd in prod.
4. **CI bundle-content scan** (`scripts/verify-prod-bundle.ts`) — forbidden tokens absent from prod chunks: `WebSocket`, `ws://`, `duel-daemon`, `cma-es`, persona ids (`aggro-anna|control-carlos|combo-carla|casual-curtis|reviewer-rita`), `balance/(personas|feedback|history|feelbad-cases)`.
5. **`size-limit` budget** + **ESLint `no-restricted-imports`** rule (`src/{rules,renderer,prod-entry}` forbidden from `src/dev/*`, `ws`, `cma-es`) — catches mistakes at PR time; bundle-scan catches anything that slips through.

Gate 4 also runs at **lefthook pre-push** so the mistake never leaves the laptop.

### 5.B.9 Acceptance criteria (per leaf — issue-ready)
- [ ] Rules engine + simulator: `simulateMatch(deck, HeuristicAI, HeuristicAI, seed=1)` produces a `MatchRecord` with terminal state and a complete action log; replay reproduces it bit-identically.
- [ ] `simulateBatch(currentParams, 10_000, fixedSeedBank, HeuristicAI, HeuristicAI)` completes in `< 10 s` on a 10-core box; `Metrics` JSON validates a documented schema.
- [ ] CMA-ES wrapper: runs to convergence on a synthetic 5-card fixture mini-game with handcrafted L(θ); finds the documented optimum within tolerance; reproducible with fixed seed.
- [ ] Leave-one-out essentiality hard gate: passes for `balance/current.json` (no card's removal drops mirror-winrate >5% from baseline).
- [ ] Daemon: `session.start` → `session.play` → `session.end` round-trip; transcript appears at the returned path; persists across daemon restart for non-finalized sessions.
- [ ] CLI: every verb has a smoke test that invokes it against a running in-process daemon and asserts output schema.
- [ ] Persona (stub-LLM): one persona runs a `playloop --matches=5` end-to-end; emits ≥1 tag of each kind across the run; feedback JSONL valid.
- [ ] `balance-playtest` skill: full integration — daemon up, 5 personas × 10 matches headless, aggregated report committed under `balance/feedback/`, persona-consensus rules surfaced for `[REVIEW GATE]`.
- [ ] **Integration:** `pnpm balance:tune --gen=5 --pop=8 --matches=500` produces a candidate `θ` and the resulting `balance/current.json` is loadable by the rules engine.
- [ ] Bundle hygiene: `pnpm verify:prod` exits 0 (no forbidden tokens in prod chunks); `size-limit` within committed budget; lefthook pre-push runs both.
- [ ] **Integration:** prod bundle built and served at `pnpm preview` does not start the daemon, does not import `ws` or `cma-es`, runs the showcase using only embedded `BALANCE` constants.

### 5.B.10 Phases
- **Phase 1.** Rules engine + simulator + CMA-ES + 5 personas + daemon + CLI + skill; loss-fn per §5.B.3 with `w_redundancy=0`; leave-one-out hard gate; production/dev separation enforced. Ships the tunable baseline.
- **Phase 2.** Mechanic-redundancy penalty enabled and calibrated; signature-card list refined from playtest data; nightly persona pass with real LLM (not stub); auto-aggregated `[REVIEW GATE]` reports.
- **Phase 3.** Cost-as-denominator metric activated (paired with §4.A.7 Phase 3 essence-cost mechanic); multi-objective optimization (Pareto front of fairness vs fun) optional.

---

## 6. Subsystem C — Rendering architecture + 3D→atlas light driver

### 6.C.1 Three "flatlands" in the showcase
| Container | Camera | RT? | Purpose |
|---|---|---|---|
| `atlasFlatland` | ortho 2D | yes (one card atlas RT) | authors the card atlas texture |
| (none — plain `THREE.Scene` + `PCam`) | perspective | no (to screen) | the 3D game world, including billboarded avatar sprites |
| `hudFlatland` | ortho 2D | no (to screen) | UI overlay |

The 3D MAIN scene is *not* a `Flatland` instance (Flatland is ortho-locked); it's a plain `THREE.Scene` with `PerspectiveCamera`, containing 3D meshes + flatland sprite primitives (avatars) added directly, lit via Epic 1's `FlatlandLightsNode` attached to the avatars' materials.

### 6.C.2 Actors table
| Actor | Geometry | Lit by | Layer | Picking |
|---|---|---|---|---|
| Table / environment | three.js meshes | default scene `LightsNode` (3D lights only) | 0 | none |
| Card meshes (hand + play + deck stack) | 3D quad meshes, atlas-UV per card | default `LightsNode` + foil normal | 0 | per-card ID |
| Card atlas RT contents | 29 face sprites + slug text + foil layers, batched in `atlasFlatland` | per-face holo `PointLight2D` (Epic 1) | self-contained ortho 2D | n/a (texture output) |
| Avatars (wizard / witch / warlock / knight) | `AnimatedSprite2D`, `billboard='cylindrical'`, in 3D world | per-material `lightsNode` (avatar-only) | sprite lights on `FLATLAND_LIGHTING_LAYER`; geometry on 0 | per-avatar ID |
| HUD overlay | `SpriteGroup` ortho overlay | unlit | overlay | per-widget ID |

### 6.C.3 Pass graph (per frame; imperative frame scheduling)
The showcase composes passes with a plain `requestAnimationFrame` loop calling each renderer entry in sequence — `Flatland.render()` already redirects to its own `renderTarget` when set, so this is just JavaScript ordering, not a custom pass-registration framework. The `shadowPipelineSystem` / `postPassSystem` from Epic 1 are the precedent for the pattern; the showcase uses the same shape directly without inventing new orchestration.
```
[ECS tick]   game state, animation, layout, lighting sync, hit-test deferred
   │
[PRE 1] atlasFlatland.render(renderer)        — writes card atlas RT (full re-render in §7 Phase 1)
[PRE 2] shadowPipeline pre-pass                — SDF/occlusion for sprite shadows (Epic 1; already wired)
[MAIN]  renderer.render(mainScene, pcam)       — perspective: table, card meshes, billboarded avatars
[POST 1] hudFlatland.render(renderer)          — ortho overlay
[POST 2] hitTestPass                            — on-demand only, when pointer event arms it
```

### 6.C.4 Lighting isolation (Epic 1 mechanism reused twice)
- Avatar-only and per-face lights default to `FLATLAND_LIGHTING_LAYER`. The flatland camera does not enable that layer → those lights are excluded from the scene's default `LightsNode` → 3D meshes (table, card meshes) never see them.
- Avatar materials get `material.lightsNode = lights([...avatarLights])`. Atlas face foil materials get `material.lightsNode = lights([...perFaceLights])`. Both via Epic 1's `lightCollector` API.
- 3D directional light (key/sun) stays on layer 0 → lights table + card meshes; *also* drives the per-face atlas lights via §6.C.5 below.

### 6.C.5 The 3D→atlas light driver (the headline integration)
For each visible card C with world transform `M_C` and the primary 3D directional light with world direction `d_world`:
1. Extract C's tangent `T`, bitangent `B`, normal `N` from `M_C.extractBasis(_T, _B, _N)`.
2. `l = -d_world` (world-space direction toward light).
3. `l_face = vec2(l · T, l · B)` (projection of light direction onto C's face plane).
4. Update the per-face `PointLight2D.position` in `atlasFlatland`:
   ```
   pos = faceCenter_atlas + l_face · FACE_LIGHT_TRAVEL_RADIUS
   pos.z = FACE_LIGHT_HEIGHT
   ```
5. Optional perlin micro-jitter blended in via `AtlasLightingContext.jitter > 0` for idle-feel.

This is the *coherent surface* test: the same physical light moves the surface specular on the 3D card mesh AND the foil sheen *inside* the atlas content, so the card looks like one lit object. When a card flips, `l · T` flips sign and the sheen reverses correctly.

### 6.C.6 Public surface (the new ECS system + traits)
```ts
// New singleton trait (AoS)
const AtlasLightingContext = trait(() => ({
  enabled: true,
  primary3DLight: null as DirectionalLight | null,
  atlasFlatland: null as Flatland | null,
  // Units below are atlasFlatland.viewSize units (which == atlas texture pixels
  // since atlasFlatland.viewSize is set to atlas dimensions, 2048×1536).
  travelRadius: 64,          // light can sweep ±64 units from face center
  height: 32,                // constant z-offset for falloff math
  jitter: 0,                 // 0..N idle perlin radius (also in atlas units)
}))

// Per-card trait
const AtlasFaceLightRef = trait({ atlasLightId: 0, seed: 0 })

// New system: runs after Transform updates, before atlasFlatland tick
function cardAtlasLightingDriverSystem(world: World): void
```

### 6.C.7 Acceptance criteria
- [ ] Three-flatland layout: `atlasFlatland` constructed with a `new RenderTarget(2048, 1536)`; its `.texture` is consumable by a `NodeMaterial.colorNode`.
- [ ] `hudFlatland` constructed without `renderTarget`; renders to screen on top of the main pass.
- [ ] 3D MAIN scene contains table mesh + N card meshes + 2 billboarded avatar sprites + `FlatlandLightsNode` attached to avatar materials.
- [ ] Camera does **not** enable `FLATLAND_LIGHTING_LAYER` (asserted by a unit test).
- [ ] `cardAtlasLightingDriverSystem` unit test: identity transform → atlas light at `faceCenter`; rotate card 90° around X → atlas light position rotates accordingly; flip 180° around Y → `l_face.x` flips sign.
- [ ] **Integration:** `3d-foil-coherency.png` visual-regression golden captures one card at a fixed orientation under a fixed 3D directional light; pixel-diff vs golden `< 0.5%`. Re-captured if the driver changes; gated by `[REVIEW GATE]`.
- [ ] **Integration:** `pnpm dev` boots the showcase in demo mode (§9); the full pass graph runs at ≥ 55 fps at 1080p with the canonical replay; Playwright stats assert `draws ≤ baselineDraws`.

### 6.C.8 Phases
- **Phase 1.** Three flatlands + actors per §6.C.1–§6.C.2; pass graph per §6.C.3; lighting isolation per §6.C.4; single-3D-light driver per §6.C.5; foil-coherency golden gate.
- **Phase 2.** Multi-3D-light aggregation in the driver (key + fill + rim → weighted dominant direction + ambient term applied to the atlas's ambient uniform). New aggregation unit tests; updated foil-coherency golden.
- **Phase 3.** Light-color-aware atlas response — 3D light's color tints the foil specular response, intensity drives sheen amplitude, color temperature shifts which gem hue dominates.

---

## 7. Subsystem D — Prerequisites P1–P4

### 7.D.1 P1 — Use Flatland's existing `renderTarget` (no new RT class)
**Builds on:** `planning/milestones/M10-render-targets.md` (designed); `Flatland` already accepts `renderTarget` in options and exposes `flatland.texture` (verified in `packages/three-flatland/src/Flatland.ts:84,405,420`).

**Showcase scope:**
1. Render-graph orchestration — register `atlasFlatland.render(renderer)` as PRE 1 via the existing `ecs-render-graph` infrastructure.
2. `atlasLayout` helper module — single source of truth for the 8×4 grid of 256×384 cells (`cellForCard`, `atlasPositionForCard`, `uvWindowForCard`).
3. **Phase 1 dirty policy:** full atlas re-render every frame. Continuous holo sheen means every face is always dirty anyway; one batched SpriteGroup draws 29 sprites + lighting in one pass; cost is bounded and on-message for the showcase.

**Acceptance:**
- [ ] `atlasFlatland.texture` is consumable by `NodeMaterial.colorNode`; `atlasFlatland.render(renderer)` writes the configured RT.
- [ ] `atlasLayout` round-trip: `uvWindowForCard(id)` samples back to `atlasPositionForCard(id)`'s cell on a 1:1 sampled material.
- [ ] **Integration:** demo mode renders all 29 faces into the atlas RT each frame; `card-atlas-frame.png` visual-regression golden captures the atlas contents (vitexec reads `atlasFlatland.texture` to canvas → save), pixel-diff `< 0.5%`.

**Phases:**
- **Phase 1.** Full re-render every frame; render-graph wired; layout helper.
- **Phase 2.** Scissor partial updates — only re-render dirty cell sub-regions per frame. Requires a small Flatland enhancement (scissor-region render support); shipped as its own sub-task within this phase. Value: lets idle-frame face cells skip work; lets state overlays (§8.E.3 Phase 2) re-render only their cell.
- **Phase 3.** RT pool + automatic RT reuse across destroyed/created cards (currently allocate-and-own).

### 7.D.2 P2 — Perspective sprite math (avatars only)
**Scope:** the unified lighting tiler currently derives screen-space tile bounds from `setWorldBounds(size, offset)` assuming an ortho camera. Under perspective, project each sprite/light world position through the live `camera.matrixWorldInverse · camera.projectionMatrix` to NDC → screen, then bin in screen space.

**Public surface (new on `FlatlandLightsNode`):**
```ts
class FlatlandLightsNode extends LightsNode {
  setCamera(camera: PerspectiveCamera | OrthographicCamera, viewport: Vector2): void
  // Existing setWorldBounds remains; setCamera replaces its role under perspective.
}
```

Y-sort under perspective uses `cameraSpace.z` (depth); billboarded sprites participate in the depth buffer naturally for occlusion against 3D geometry. Sprites behind the near plane are skipped in tile assignment.

**Acceptance:**
- [ ] `setCamera(PerspectiveCamera, viewport)` produces the same tile assignment as `setWorldBounds` when the perspective camera frames the same ortho rectangle — round-trip test on a static scene.
- [ ] Sprites partially behind the near plane do not appear in any tile's light list (unit test on a constructed scenario).
- [ ] **Integration:** avatars in the showcase 3D MAIN pass receive correct lighting under perspective at three camera distances (close, mid, far); `billboard-avatars-multi-angle.png[3]` goldens capture each.

**Phases:**
- **Phase 1.** `setCamera` for `PerspectiveCamera` + `OrthographicCamera`; Y-sort under perspective.
- **Phase 2.** Frustum-aware tile sizing — under extreme perspective, tile size adapts to maintain consistent visual lighting density.

### 7.D.3 P3 — Billboarded sprites
**Public surface (prop on `SpriteGroup` / `AnimatedSprite2D`):**
```ts
type BillboardMode = 'none' | 'cylindrical' | 'spherical'
interface SpriteGroupOptions { /* ...existing... */; billboard?: BillboardMode }
```

Vertex shader replaces the standard model-view rotation with a camera-derived basis (cylindrical: Y-axis-locked; spherical: full free). Position unchanged; lighting/normal-map paths unchanged (tangent space is preserved).

**Acceptance:**
- [ ] `<animatedSprite2D billboard="cylindrical" />` orients to the camera with Y-axis locked at three pose tests.
- [ ] Normal-mapped lighting on a billboarded sprite produces the same lit response as a non-billboarded sprite at the same screen position (unit test on a synthetic scene).
- [ ] Depth-test: a billboarded sprite is occluded by a 3D mesh in front of it (assertion test reading depth at sprite center).
- [ ] **Integration:** avatars in `billboard-avatars-multi-angle.png[3]` goldens face the camera correctly at all three angles.

**Phases:**
- **Phase 1.** `cylindrical` + `spherical` modes implemented.
- **Phase 2.** `cylindrical-locked-pitch` variant for cases where Y-only is too rigid (e.g., a flying particle effect that should tilt slightly with camera elevation).

### 7.D.4 P4 — Picking / hit-testing
**Scope:** unified pointer-to-entity resolution across 3D meshes, billboarded sprites, and HUD widgets.

**Public surface:**
```ts
interface Pickable { id: number; type: 'card' | 'avatar' | 'widget' | 'mesh' }
class HitTester {
  pick(screenX: number, screenY: number): Pickable | null
}
```

**Phase 1 implementation:** hybrid CPU — screen-space test against HUD widgets first; then `THREE.Raycaster` against 3D meshes; then `Raycaster` + sprite-bounds intersection for billboarded sprites; closest-by-depth wins. Reserved per-instance picking ID slot (`instanceExtras.y` per the existing buffer spec) wired so the ID-buffer path is a drop-in Phase 2.

**Acceptance:**
- [ ] Picks a 3D card mesh at the cursor's projected world ray.
- [ ] Picks a billboarded avatar sprite at the cursor's projected world ray.
- [ ] Picks an overlapping HUD widget in preference to a 3D object behind it (depth/z-order test).
- [ ] Returns `null` outside all pickables.
- [ ] **Integration:** in the showcase, clicking a hand card invokes `InputBridge.onPointerDown(Pickable{type:'card', id})` and (if legal) commits the card; an integration test asserts state transition under a synthetic click.

**Phases:**
- **Phase 1.** Hybrid CPU per above.
- **Phase 2.** ID-buffer rasterization pass — low-res RT encodes `(type, id)` per pixel; pointer-event reads one pixel via `copyTextureToBuffer`/`mapAsync`. Same `HitTester.pick()` signature. Value: scalable to many overlapping pickables, future-proofs the picking surface.
- **Phase 3.** Hover-derived effects (cursor light following hovered card, drag-target affordance) — pure renderer additions consuming `pick()`.

---

## 8. Subsystem E — Card-face pipeline (composited sprites + slug)

### 8.E.1 Layered composition (per face, in the `atlasFlatland` authoring scene)
Back-to-front per face cell:
1. **Parchment background sprite** (shared `assets/parchment.png`, tinted per category for taxonomy).
2. **Ornament/border sprite(s)** (shared sprite sheet `assets/ornaments.png`).
3. **`SlugText` — large central alchemy symbol** (rendered from a Unicode-symbol font baked via `slug-bake`; deck.json already stores codepoints in `U+1F70x`).
4. **`SlugText` — Roman numeral** (top-left + top-right).
5. **`SlugText` — card name** (display weight, occult-leaning serif).
6. **`SlugText` — category subtitle** (small sans).
7. **`SlugText` — meaning line** (small italic).
8. **Foil overlay sprite** (`assets/foil-overlay.png` alpha-mask + shared `assets/foil-normal.png` driving lit response). This is the layer that animates via the per-face holo `PointLight2D`.
9. **(§8.E.3 Phase 2) State overlay sprites** composited inside the atlas via scissor partial updates.

All 29 faces' layers are added to `atlasFlatland` and render into the same atlas RT in one ortho pass. The atlas pass contains **multiple draw calls by design** — one batched `SpriteBatch` for all parchment/ornament/foil sprites across the 29 cells (one draw), plus one `InstancedMesh` per `SlugText` font (typically 3 draws — symbol font + display serif + body sans), each instance positioned within its face cell. All of these write into `atlasFlatland.texture` in a single `atlasFlatland.render(renderer)` call. The "batched" win is on the *sprite side* (29 face-worths of sprite layers in one SpriteBatch draw), not literal one-draw-call for the entire atlas. The one-draw-call-for-all-cards property is in the MAIN pass (§8.E.5).

### 8.E.2 Asset inventory
| Asset | Form | Source |
|---|---|---|
| `assets/data/deck.json` | data | copied from `~/Developer/alchemy-cards` |
| `assets/parchment.png` | PNG (tileable) | new — authored or sourced |
| `assets/ornaments.png` | PNG (atlas of decorative elements) | new |
| `assets/foil-overlay.png` | PNG (alpha mask) | new |
| `assets/foil-normal.png` | PNG (normal-encoded) | new |
| `assets/card-surface-normal.png` | PNG (micro-grain + foil bumps for 3D mesh) | new |
| `assets/fonts/*.ttf` + `*.slug.glb` | TrueType + baked via `slug-bake` | repo fonts where licensed (Inter present); symbol font (Noto Sans Symbols 2 / Symbola); display serif |
| `assets/avatars/<archetype>/*.png` + atlas | pixel-art sprite sheets per archetype + animations | new — sourced or commissioned per design-reference |
| `assets/table/*.glb` | 3D table mesh + materials | new — minimal stylized table |
| `assets/design-reference/*.png` | screenshots of alchemy-cards' baked output | imported as visual target (commit to repo) |
| `assets/demo/canonical-match.json` | deterministic replay seed | authored after rules ship |

Fonts get baked at install/build time via the existing `slug-bake` CLI — same pipeline three-flatland uses for any slug text content; no new tooling.

### 8.E.3 Per-face holo lighting + 3D-driver coupling
- Each face has one `PointLight2D` parented in `atlasFlatland`, positioned over its cell.
- Light position is driven each frame by `cardAtlasLightingDriverSystem` (§6.C.5) from the corresponding card mesh's world transform + the primary 3D directional light.
- Optional perlin micro-jitter (`AtlasLightingContext.jitter`) blended in for idle-feel.
- All face lights on `FLATLAND_LIGHTING_LAYER` (Epic 1 default).
- The atlas's `lightCollector` returns exactly the 29 face lights; Forward+ tiles them in atlas screen space; per-face distance falloff keeps influence within cell bounds.

### 8.E.4 3D card mesh material (the relight)
**All card meshes live as instances of a single `THREE.InstancedMesh`** (3D quad geometry + per-instance attributes), **not** as flatland sprites. The per-instance UV-window is added as a standard three.js `InstancedBufferAttribute` on the geometry — completely separate from the flatland sprite interleaved buffer (`instanceUV`/`instanceColor`/`instanceSystem`/`instanceExtras`), which is untouched. TSL reads the per-instance attributes via `attribute('instanceUVOffset', 'vec2')` / `attribute('instanceUVScale', 'vec2')`.

```ts
import { InstancedMesh, InstancedBufferAttribute, PlaneGeometry } from 'three'
import { NodeMaterial } from 'three/webgpu'
import { texture, attribute, uv } from 'three/tsl'

function createCardMesh(atlasTexture: Texture, surfaceNormalMap: Texture, maxCards: number) {
  const geom = new PlaneGeometry(CARD_WIDTH, CARD_HEIGHT)
  geom.setAttribute('instanceUVOffset', new InstancedBufferAttribute(new Float32Array(maxCards * 2), 2))
  geom.setAttribute('instanceUVScale',  new InstancedBufferAttribute(new Float32Array(maxCards * 2), 2))

  const mat = new NodeMaterial()
  mat.lights = true
  const uvOffset = attribute('instanceUVOffset', 'vec2')
  const uvScale  = attribute('instanceUVScale',  'vec2')
  const uvWindow = uv().mul(uvScale).add(uvOffset)
  mat.colorNode  = texture(atlasTexture, uvWindow)
  mat.normalNode = computeNormalFromMap(surfaceNormalMap, uvWindow)

  return new InstancedMesh(geom, mat, maxCards)
}
```
One `InstancedMesh` → one material → one draw call for **all** visible card meshes (hand + play + deck stack). Per-instance UV-window written via `mesh.geometry.attributes.instanceUVOffset.setXY(i, u, v)` + `.needsUpdate = true` whenever a card's atlas cell or visibility changes (rare — once per `cardDealt` intent, not per frame).

### 8.E.5 Acceptance criteria
- [ ] `slug-bake` produces `assets/fonts/<name>.slug.glb` for each declared font.
- [ ] Atlas authoring scene constructs the 29 face compositions (background + ornament + slug-text layers + foil overlay) in `atlasFlatland`; renders in one `atlasFlatland.render(renderer)` call to the atlas RT (multiple internal draws — one batched `SpriteBatch` + N `SlugText` `InstancedMesh` per font — into the same texture).
- [ ] All face compositions render to `atlasFlatland.texture` without typography artifacts at 256×384 per cell (visual inspection of `card-atlas-frame.png` golden).
- [ ] Card mesh material samples its assigned UV-window correctly — round-trip test: `cellForCard(id)` → `atlasPositionForCard(id)` → `uvWindowForCard(id)` → sampled pixel matches the source face.
- [ ] **MAIN-pass card meshes share one `InstancedMesh` + one material → one draw call for all visible cards** (`pnpm test:perf` asserts MAIN-pass `cardMeshDraws == 1`). Atlas authoring pass is exempt from this assertion by design (it's N draws into one texture).
- [ ] Each avatar archetype (wizard, witch, warlock, knight) ships with at least 5 animation clips: `idle`, `cast`, `hurt`, `victory`, `defeat`. Loaded via `AnimatedSprite2D` with declared animation-set.
- [ ] **Integration:** `card-atlas-frame.png` and `3d-foil-coherency.png` goldens both pass.

### 8.E.6 Phases
- **Phase 1.** Layered composition per §8.E.1 with continuous holo sheen; full-atlas-re-render policy from §7.D.1 Phase 1. State overlays (damage, selection glow, hover) render as 3D-pass overlay sprites near the card mesh, *not* in the atlas.
- **Phase 2.** Move state overlays *inside* the atlas via §7.D.1 Phase 2's scissor partial updates — damage tokens appear in the face content; selection glow tints the face cell. Per-face lights pick up the additional sprites automatically.
- **Phase 3.** 3D-pass card material additions — rim halo on resolve, emission ramp on play, dissolve/burn shader effect when a card is destroyed by a reagent. Pure 3D shader work; doesn't touch the atlas.

---

## 9. Subsystem F — Data flow, state model, ECS

### 9.F.1 Canonical state types
```ts
interface DuelState {
  readonly rngSeed: number
  readonly turn: number
  readonly activePlayer: 0 | 1
  readonly phase: 'commit' | 'reveal' | 'resolve' | 'draw' | 'gameOver'
  readonly players: readonly [PlayerState, PlayerState]
  readonly log: readonly TurnRecord[]
  readonly pending: readonly Action[]
}

interface PlayerState {
  readonly avatar: 'wizard' | 'witch' | 'warlock' | 'knight'
  readonly hp: number
  readonly hand: readonly CardId[]
  readonly deck: readonly CardId[]
  readonly discard: readonly CardId[]
  readonly committed: CardId | null
  readonly statuses: readonly Status[]
}

type Action =
  | { kind: 'commitCard';  cardId: CardId }
  | { kind: 'castReagent'; cardId: CardId; target?: 'self' | 'opponent' | CardId }
  | { kind: 'endTurn' }
```

All state is `readonly`/frozen at the type and (in dev) runtime layer. Mutation paths fail loudly.

### 9.F.2 ECS render state (Koota; per three-flatland conventions)
| Trait | Form | Purpose |
|---|---|---|
| `DuelStateTrait` | AoS singleton `trait(() => ({ state, prev }))` | Canonical state + previous frame's state for diffing |
| `RulesEngineTrait` | AoS singleton | RulesEngine instance + DuelAI strategy |
| `CardEntity` traits: `CardRef`, `Transform` (SoA), `Tween` (SoA), `OverlaySprites` (AoS), `AtlasFaceLightRef` | mixed | Per-visible-card entity |
| `AvatarEntity` traits: `AvatarRef`, `Transform`, `AnimationState` | mixed | Per-player |
| `IntentQueue` | AoS singleton | Frame's pending render intents |
| `AtlasLightingContext` | AoS singleton | 3D→atlas driver config (§6.C.5) |
| `LightingContext` (Epic 1) | AoS singleton | Unchanged |

### 9.F.3 Frame cycle
```
[Input]   pointer → HitTester.pick → Pickable → InputBridge.onPointerDown
            → legalActions filter → Action → RulesEngine.applyAction → state'
            (if AI's turn: DuelAI.chooseAction → applyAction → state'')
            → DuelStateTrait{ state, prev }

[ECS tick — deterministic order]
   duelStateSyncSystem        diff prev↔state → IntentQueue.push(...)
                              spawn/destroy CardEntity for hand/play/deck changes
   intentAnimationSystem      consume IntentQueue → start Tween components
   tweenSystem                advance Tweens → write Transform fields → remove finished
   animationDriverSystem      AvatarEntity animation phases (idle/cast/hurt/victory)
   cardAtlasLightingDriverSystem    (§6.C.5; runs AFTER Transform, BEFORE atlas tick)
   atlasFlatlandSystem        atlasFlatland.tick() — light sync, sprite anims for foil
   lightingSystems            Epic 1's sync/effect/assign for 3D-pass sprite lights

[Render — via ecs-render-graph]
   PRE 1   atlasFlatland.render(renderer)
   PRE 2   shadowPipeline pre-pass
   MAIN    renderer.render(mainScene, pcam)
   POST 1  hudFlatland.render(renderer)
   POST 2  hitTestPass (on demand)
```

### 9.F.4 Intent vocabulary (closed set)
```ts
type Intent =
  | { kind: 'cardDealt';     cardId; player; toHandSlot }
  | { kind: 'cardCommitted'; cardId; player }     // hand → committed slot, face down
  | { kind: 'cardRevealed';  cardId; player }     // flip Y 180°, atlas UV back→face
  | { kind: 'cardClashed';   p0Card; p1Card; winner: 0 | 1 | 'tie' }
  | { kind: 'damageDealt';   target: 0 | 1; amount; source: CardId }
  | { kind: 'statusApplied'; target: 0 | 1; status: Status }
  | { kind: 'cardDiscarded'; cardId; player }
  | { kind: 'matchEnded';    winner: 0 | 1 }
```
New game actions that produce visible change → new intent kind + an animation handler. Daemon serializes intents into the feedback corpus too (personas tag intents directly).

### 9.F.5 Input bridge
```ts
class InputBridge {
  constructor(engine: RulesEngine, getState: () => DuelState)
  onPointerDown(p: Pickable | null): void
  onPointerHover(p: Pickable | null): void
  onDrag(start: Pickable, target: Pickable | null): void
}
```
Filters via `engine.legalActions(state, HUMAN_PLAYER)` before calling `applyAction`. Illegal actions silently ignored in v1 (no error UI).

### 9.F.6 Demo mode + replay
The showcase boots in **demo mode** by default for non-interactive contexts (vitexec golden capture, screenshots): a pre-recorded `assets/demo/canonical-match.json` (initialState + actionLog + seed) replays through the rules engine, exercising every `Intent` kind for visual-regression coverage.
```ts
class DemoPlayer {
  constructor(engine: RulesEngine, match: ReplayFile)
  tick(deltaMs: number): void
}
```
Switching to interactive mode replaces the `DemoPlayer` with `InputBridge`. Same engine, same render path. Replay file format = `{ initialState, actionLog, seed, personaTagsOptional }` and serves three purposes: demo, daemon-session replay, feelbad regression fixtures.

### 9.F.7 Acceptance criteria
- [ ] `DuelStateTrait` round-trip: `applyAction` produces a new immutable state; previous state preserved in `prev`.
- [ ] `duelStateSyncSystem` unit test: given a fixture `prev → state` transition (a `commitCard` action), emits exactly the documented `cardCommitted` intent.
- [ ] Per-intent unit tests: each of 8 intent kinds is emitted by its triggering state delta.
- [ ] `intentAnimationSystem` test: a `cardRevealed` intent attaches a `Tween` to the right CardEntity.
- [ ] `InputBridge.onPointerDown` test: a `Pickable{type:'card'}` on a card the active player owns produces a `commitCard` action; an illegal commit (wrong player's turn) is filtered out without invoking `applyAction`.
- [ ] `DemoPlayer` integration: `assets/demo/canonical-match.json` replays end-to-end without exception; emits every kind in the intent vocabulary at least once across the playlist.
- [ ] **Integration:** demo mode runs the canonical match in the showcase at ≥ 55 fps, producing the visual-regression goldens of §10.

### 9.F.8 Phases
- **Phase 1.** Full state model + diff→intent→tween for all 8 intents + InputBridge + DemoPlayer + replay format.
- **Phase 2.** Branching demo playlist — multiple canonical matches (short aggro, control standoff, finisher win) — golden coverage broadens.
- **Phase 3.** Hot-reload of `balance/current.json` — dev-only: edit numbers, replay the same demo, see the change. Useful for `[REVIEW GATE]` of tuned candidates without rebuilds.

---

## 10. Subsystem G — Testing strategy + bundle hygiene

### 10.G.1 Seven test layers
| # | Layer | Cadence | Tooling |
|---|---|---|---|
| 1 | Unit (GPU mocked) | PR | Vitest, colocated `*.test.ts`, `isNodeShaped` smoke pattern for TSL |
| 2 | Integration (renderless, multi-system) | PR | Vitest |
| 3 | Visual regression (vitexec goldens) | PR (rendering changes) | vitexec + `pixelmatch` (per Epic 1) |
| 4 | Performance regression | PR | Playwright `__flatlandDebug.stats()` + vitexec performance traces |
| 5 | Balance regression | PR + nightly | Vitest (PR fixtures) + CLI nightly sweep |
| 6 | Bundle hygiene | PR + lefthook pre-push | `verify:prod` + `size-limit` + ESLint |
| 7 | Live agent-persona playtest | per release candidate | vitexec scripts piloting renderer via `duel-cli` |

### 10.G.2 The visual-regression goldens
Captured in demo mode with deterministic seed + frozen camera pose via Epic 1's `__flatlandDebug` hooks. Each golden file lives at `test/regression/golden/showcase/<name>.png`; replacement requires explicit `[REVIEW GATE]` approval.

| Golden | What it proves |
|---|---|
| `showcase-demo-frame-001.png` ... `-NNN.png` | Canonical match playback at fixed timestamps |
| `card-atlas-frame.png` | Atlas RT contents (vitexec reads `atlasFlatland.texture` → canvas → save) |
| `3d-foil-coherency.png` | **Headline gate.** 3D directional light + per-card 3D pose → coherent surface specular + atlas foil sheen |
| `card-flip-mid-rotation.png` | UV-swap timing + foil-direction sign-flip during a card flip |
| `billboard-avatars-multi-angle.png[3]` | Cylindrical billboard math at three camera dollies |
| `hud-overlay-states.png` | HUD across game states (full health / low health / status-stacked) |

### 10.G.3 The balance-regression hard gates (PR-time, fast)
- `simulateBatch(currentParams, 1000, fixedSeed)` metrics within band.
- Leave-one-out essentiality (per §5.B.1): for each of 28 cards, asymmetric batch where one side loses `card_i`; the depleted side's winrate must be `≥ 45%`. 28×1000 = 28k sims; runs in seconds. Any card failing → hard gate red.
- Feelbad fixtures all pass: every `balance/feelbad-cases/*.json` replayed against current θ; trigger no longer fires.

Nightly soft gates: full 10k-batch sweep + persona pass (real LLM, curated personas, small batch). Drift posts a diff comment.

### 10.G.4 Performance budgets (asserted in vitexec perf traces, PR-time)
| Metric | Threshold |
|---|---|
| FPS in demo mode @ 1080p | ≥ 55 |
| Draw calls per frame | ≤ `baselineDraws` (committed) |
| PRE 1 (atlas) frame-time | ≤ 2.0 ms typical, ≤ 3.5 ms p95 |
| MAIN frame-time | ≤ 8.0 ms |
| POST 1 (HUD) frame-time | ≤ 1.0 ms |
| Atlas RT memory | ≤ 32 MB |
| Prod bundle size | within `size-limit` budget |

### 10.G.5 Bundle hygiene (PR + lefthook pre-push)
- `pnpm verify:prod` — `scripts/verify-prod-bundle.ts` scans prod chunks for forbidden tokens (per §5.B.8 gate 4). Hard fail.
- `pnpm size-limit` — prod bundle within committed budget. Hard fail.
- ESLint `no-restricted-imports` rule — `src/{rules,renderer,prod-entry}` cannot import from `src/dev/`, `ws`, `cma-es`. Hard fail.
- Lefthook hooks: `pre-push` runs the trio. PRs that pass lefthook still get re-validated in CI.

### 10.G.6 Acceptance criteria (the testing surface itself)
- [ ] `pnpm test` covers Layer 1 unit assertions for every public surface in §4–§9.
- [ ] `pnpm test` covers Layer 2 integration tests for rules+sim+CMA-ES end-to-end, daemon+CLI smoke, ECS system chain, persona-via-CLI stub-LLM run, feelbad regression replay, leave-one-out hard gate.
- [ ] `pnpm test:regression` runs vitexec captures + pixel-diff for all Layer 3 goldens; threshold `< 0.5%`.
- [ ] `pnpm test:smoke` (Playwright) extends Epic 1's smoke with showcase-specific FPS/draws assertions.
- [ ] `pnpm balance:gate` runs Layer 5 PR-time hard gates (simulateBatch + essentiality + feelbad replay) and exits 0/1.
- [ ] `pnpm verify:prod` + `pnpm size-limit` + ESLint scan all wired into both CI and lefthook pre-push.

### 10.G.7 Phases
- **Phase 1.** All seven layers wired against the §4–§9 Phase 1 surface; goldens captured against the canonical demo match.
- **Phase 2.** New goldens for in-atlas state overlays (post §7.D.1 Phase 2 + §8.E.3 Phase 2); new balance fixtures covering state-effect playtests where personas flagged overlay-timing as off.
- **Phase 3.** New goldens for 3D card material additions (rim halo, dissolve effect, multi-light atlas aggregation); new perf budgets for any added pass.

---

## 11. Agent contributor API — skills

The implementer is an agent. The skills are the contributor surface. Each lives at `.claude/skills/<name>/SKILL.md`; each is parameterized for unattended invocation; each surfaces structured output at `[REVIEW GATE]` points.

| Skill | Triggers | Drives |
|---|---|---|
| `balance-playtest` | "playtest", "tune balance" | Daemon up → CMA-ES tune (optional) → N persona subagents in parallel via `duel-cli playloop` → aggregate feedback corpus → consensus report → `[REVIEW GATE] persona-consensus` |
| `balance-tune` | "run CMA-ES", "tune card X" | `pnpm balance:tune` with sensible defaults → metric-deltas vs prior `current.json` → `[REVIEW GATE] tuned θ` |
| `add-card` | "add a card" | Read `deck.json` entry → generate face composition (sprite layout + slug layers) → update `atlasLayout` if grid changes → add effect-table entry stub → run balance regression + leave-one-out + small persona pass → `[REVIEW GATE] new card visual + balance impact` |
| `add-intent` | "add intent X", "wire a new game action" | Add to intent vocabulary → diff-system case → animation handler stub → unit test → capture new golden frame → `[REVIEW GATE] intent + animation` |
| `add-persona` | "add persona Y" | Write persona JSON + system-prompt → add to playtest config → stub-LLM smoke test → small headless sanity run → `[REVIEW GATE] persona spec` |
| `capture-goldens` | "capture goldens", "refresh visual regression" | Boot demo via vitexec → capture goldens at all canonical poses → diff vs committed → `[REVIEW GATE] golden diffs` (any non-trivial diff blocks overwrite) |
| `validate-perf` | "check perf", "run perf gate" | vitexec performance traces at canonical demo poses → assert §10.G.4 budgets → report |
| `verify-prod-bundle` | "check the bundle", "verify prod" | `verify:prod` + `size-limit` + lint scan → report |

Each skill follows the pattern proven by `balance-playtest`: tool-assisted CLI calls + subagent dispatch where parallelism helps + structured output + explicit `[REVIEW GATE]` emission.

## 12. Review gates (the only human-touch points)

| Gate | Surfaces | When |
|---|---|---|
| `[REVIEW GATE] tuned θ` | balance/current.json diff + metric-deltas report + persona-consensus report | After `balance-tune` produces a candidate that passes hard gates |
| `[REVIEW GATE] persona-consensus` | aggregated feelbad/boring/satisfying tags + auto-generated next-tune constraints | After `balance-playtest` headless pass on a converged candidate |
| `[REVIEW GATE] new card visual + balance impact` | golden of the new card face + post-card balance regression diff | After `add-card` |
| `[REVIEW GATE] intent + animation` | new golden frame at mid-animation + diff vs nearest existing | After `add-intent` |
| `[REVIEW GATE] persona spec` | persona JSON + sample match transcript | After `add-persona` |
| `[REVIEW GATE] golden diffs` | per-golden pixel-diff visualization | Whenever `capture-goldens` reports a non-trivial diff |
| `[REVIEW GATE] PR ready` | full test suite + perf + bundle hygiene + visual regression all green | Implementation phase completion |

No other human touchpoints exist. Subagents may not bypass a `[REVIEW GATE]`; if a gate cannot be cleared, the subagent halts and surfaces what's blocking it.

## 13. Issue hierarchy (for `creating-github-issues`)

This is the source breakdown the issue-creator uses as the parent/child tree per its Phase 1 rule. Labels are suggestions; the issue-creator reconciles against the repo's actual label vocabulary.

```
EPIC 2 — Card-Game Showcase (Alchemy Duel)  [epic:2, area:showcase]
│
├─ PARENT — Subsystem A: Rules engine + AI  [area:rules]
│   ├─ Define DuelState, PlayerState, Action types + frozen-in-dev guards
│   ├─ Implement RulesEngine.applyAction with seeded PRNG, pure + deterministic
│   ├─ Implement legalActions matching applyAction's accepted set (fuzzed)
│   ├─ Implement HeuristicAI counter-pick policy (Strategy interface)
│   ├─ Encode element counter-cycle resolution (4×4 pair matrix tests)
│   ├─ Encode 28 card-effect entries + per-card unit tests
│   └─ Integration: full match runs deterministically headless < 100ms
│
├─ PARENT — Subsystem B: Simulator + CMA-ES + personas + daemon + CLI + skill  [area:balance, area:devtools]
│   ├─ simulateMatch + simulateBatch with worker_threads sharding
│   ├─ Metrics aggregator (per §5.B.1) emitting validated schema
│   ├─ CMA-ES wrapper + composite L(θ) + signature-card exemption
│   ├─ Leave-one-out essentiality hard gate
│   ├─ Feelbad-fixture replay system
│   ├─ duel-daemon (WS server, session store, transcript persistence)
│   ├─ duel-cli (all 9 verbs + smoke tests per verb)
│   ├─ 5 persona JSON specs + system prompts (versioned)
│   ├─ Stub-LLM persona harness for CI; real-LLM harness for nightly
│   ├─ .claude/skills/balance-playtest/SKILL.md
│   ├─ .claude/skills/balance-tune/SKILL.md
│   ├─ Production/dev separation: vite.config.ts entries + ESLint rules + lefthook hook
│   ├─ scripts/verify-prod-bundle.ts + size-limit budget
│   └─ Integration: pnpm balance:tune --gen=5 produces loadable current.json; pnpm verify:prod passes
│
├─ PARENT — Subsystem C: Rendering architecture + 3D→atlas light driver  [area:renderer, area:lighting]
│   ├─ atlasFlatland container with renderTarget + clear-color
│   ├─ hudFlatland container (screen-rendered)
│   ├─ Main scene: PerspectiveCamera + table mesh + FlatlandLightsNode on avatars
│   ├─ Pass-graph registration: PRE 1 atlas → PRE 2 shadow → MAIN → POST 1 HUD → POST 2 hit-test
│   ├─ Camera layer config: layer 0 only; assert FLATLAND_LIGHTING_LAYER excluded
│   ├─ AtlasLightingContext trait + AtlasFaceLightRef trait
│   ├─ cardAtlasLightingDriverSystem implementation + unit tests for face-space projection
│   └─ Integration: 3d-foil-coherency.png golden captured and gated; demo mode at ≥55fps
│
├─ PARENT — Subsystem D: Prerequisites P1–P4  [area:prereq]
│   ├─ P1 — atlasLayout helper module + render-graph wiring of atlasFlatland.render
│   ├─ P1 Phase 2 — Flatland scissor-region render support + scissor partial updates
│   ├─ P2 — FlatlandLightsNode.setCamera(PerspectiveCamera|OrthographicCamera, viewport) + Y-sort under perspective
│   ├─ P3 — SpriteGroup.billboard prop (cylindrical + spherical) with vertex shader basis swap
│   ├─ P4 Phase 1 — HitTester hybrid CPU (HUD screen-space + Raycaster meshes + sprite-bounds intersect)
│   ├─ P4 Phase 2 — ID-buffer rasterization pass + readback
│   └─ Integration: billboard-avatars-multi-angle.png[3] + card click invokes commit action
│
├─ PARENT — Subsystem E: Card-face pipeline  [area:assets, area:renderer]
│   ├─ Atlas authoring scene: one batched SpriteGroup with 29 face compositions
│   ├─ Per-face holo PointLight2D + foil overlay sprite + normal map
│   ├─ SlugText components for symbol/numeral/name/category/meaning + slug-bake invocation
│   ├─ Asset authoring: parchment, ornaments, foil-overlay, foil-normal, card-surface-normal
│   ├─ Avatar pixel-art sprite sheets per archetype (wizard/witch/warlock/knight) + animations
│   ├─ Card mesh material: shared NodeMaterial sampling atlas at per-instance UV-window
│   └─ Integration: card-atlas-frame.png golden + drawCalls ≤ baseline
│
├─ PARENT — Subsystem F: State model + ECS + demo mode  [area:ecs, area:state]
│   ├─ DuelStateTrait, RulesEngineTrait, IntentQueue, CardEntity + AvatarEntity traits
│   ├─ duelStateSyncSystem (diff → IntentQueue.push for each of 8 intent kinds)
│   ├─ intentAnimationSystem + tweenSystem + animationDriverSystem
│   ├─ InputBridge with legalActions filtering + pointer event routing
│   ├─ DemoPlayer + canonical-match.json authoring
│   └─ Integration: demo mode runs end-to-end emitting all 8 intent kinds; drives all goldens
│
├─ PARENT — Subsystem G: Testing strategy + bundle hygiene  [area:testing, area:ci]
│   ├─ Layer 1 unit coverage of public surfaces in §4–§9
│   ├─ Layer 2 integration test suite (rules+sim+CMA-ES end-to-end, daemon+CLI smoke, ECS chain, persona stub)
│   ├─ Layer 3 vitexec golden capture infra + per-golden test files
│   ├─ Layer 4 perf gates via Playwright + vitexec perf traces
│   ├─ Layer 5 balance hard gates (PR-time) + nightly soft gates
│   ├─ Layer 6 bundle hygiene (verify:prod + size-limit + ESLint) wired to CI + lefthook
│   └─ Layer 7 live agent-persona playtest harness (vitexec-piloted renderer)
│
└─ PARENT — Agent contributor API (skills)  [area:skills]
    ├─ .claude/skills/add-card/SKILL.md
    ├─ .claude/skills/add-intent/SKILL.md
    ├─ .claude/skills/add-persona/SKILL.md
    ├─ .claude/skills/capture-goldens/SKILL.md
    ├─ .claude/skills/validate-perf/SKILL.md
    └─ .claude/skills/verify-prod-bundle/SKILL.md
    (balance-playtest + balance-tune live under Subsystem B)
```

Each leaf is one work unit (~1–4 phases). Acceptance criteria for each leaf are inherited from the corresponding subsystem's `Acceptance criteria` section in §4–§10 — the issue-creator can quote the relevant bullets verbatim into the issue body.

**Suggested labels** (issue-creator reconciles against actual repo labels via `gh label list`):
`epic:2`, `area:showcase`, `area:rules`, `area:balance`, `area:devtools`, `area:renderer`, `area:lighting`, `area:prereq`, `area:assets`, `area:ecs`, `area:state`, `area:testing`, `area:ci`, `area:skills`, `phase:1`, `phase:2`, `phase:3`.

**Integration rubric (per `creating-github-issues` Phase 8.5):** every feature leaf above declares an integration acceptance criterion in its subsystem section that wires the feature into the showcase and proves it with at least one of (integration test / vitexec golden / Playwright smoke / balance gate). No leaf is `integration-exempt`.

## 14. Dependencies + build sequencing (for `writing-plans`)

When the implementation plan is generated from this spec, it should respect:

**Hard prerequisites:**
- Epic 1 (Lighting Unification) must merge before any showcase work starts. The showcase consumes Epic 1's primitives as given.

**Within-epic sequencing (per subsystem Phase 1):**
1. **Parallel from day one** (renderless, no rendering deps): A (rules) ∥ B (sim+CMA+daemon+CLI+skill) ∥ F (state model + diff/intent/tween infra)
2. **Renderer foundations** (depend on D's prereqs): D.P1 → D.P2 + D.P3 in parallel → D.P4
3. **Rendering integration** (depends on A + D): C (rendering architecture + 3D→atlas driver) → E (card-face pipeline)
4. **Cross-cutting** (depends on all above): G (testing) lands incrementally per subsystem; agent contributor API skills land alongside their subsystem
5. **Showcase assembly** = the integration tests + goldens passing across all subsystems

The plan writer (`superpowers:writing-plans`) is responsible for translating this into bite-sized TDD tasks with frequent commits, per its own discipline.

## 15. Open assumptions (judgment calls made; flag at review)

These were resolved by judgment when the source was silent; they're documented here so the review gate catches them if any are wrong:

- **Atlas dimensions** 2048×1536 (8×4 grid × 256×384 cells). Reasonable for slug-rendered text crispness at face mesh's typical screen size; revisit if rendered text is illegible at distance.
- **CMA-ES population 24, generations 200** as defaults. Standard starting point; tune by wall-clock budget in actual runs.
- **5 v1 personas.** Covers aggro/control/combo/casual/analytical playstyle space cheaply. Adding more is `add-persona` skill work.
- **Hand size 5, HP 30, deck size 28 (mirror).** Sized to produce 12–20 round matches per §5.B.3 length target band.
- **Symbol font: try Noto Sans Symbols 2 first; fall back to Symbola if `slug-bake` reports missing glyphs in `U+1F700`–`U+1F77F`.** Both freely licensed and cover the alchemy block. Concrete selection rule, not "to be picked."
- **Display font for card names: Cinzel (OFL).** Body font: Inter (already in repo). Italics for the meaning line: Inter Italic.
- **Per-instance lit flag preserved** as a TSL `select()` at the output node, per Epic 1's "trap 3" — the showcase must not introduce a path that splits lit/unlit into separate batches.

## 16. References

- Epic 1 plan: `planning/superpowers/plans/2026-05-27-lighting-unification.md`
- Prerequisites precursor (superseded by this spec): `planning/superpowers/specs/2026-05-27-card-game-showcase-prerequisites.md`
- Lighting investigation memory: `~/.claude/projects/-Users-tjw-Developer-three-flatland/memory/project_lighting_stochastic_evaluation.md`
- Stochastic tiled lighting evaluation: `planning/superpowers/specs/stochastic-tiled-lighting-evaluation.md`
- Master lighting doc: `planning/experiments/Unified-2D-Lighting-Architecture.md`
- Render-targets design: `planning/milestones/M10-render-targets.md`
- Render-graph architecture: `planning/ecs-render-graph/02-architecture.md`
- Per-instance buffer design (picking ID reservation): `planning/superpowers/specs/2026-04-23-interleaved-instance-buffer-design.md`
- Alchemy deck source: `~/Developer/alchemy-cards/` (deck.json + Skia bake reference)
- Slug package: `packages/slug/` (`SlugText`, `SlugFont`, `slug-bake`)
- Flatland RTT API: `packages/three-flatland/src/Flatland.ts:84,405,420`
- Article: "Master the Balancing of Your Card Game" — `https://tabletop-creator.com/master-the-balancing-of-your-card-game/`
- Article: Daniel Solis on balance — `https://daniel.games/balance/`
- `creating-github-issues` skill (downstream consumer): `~/Developer/middle/packages/skills/creating-github-issues/SKILL.md`
- `superpowers:writing-plans` skill (downstream consumer)
- `superpowers:subagent-driven-development` skill (plan-execution pattern)

## 17. Reuse reference — existing infrastructure the implementation plan consumes

The implementation plan and downstream subagents MUST consume the following existing primitives directly rather than re-spec'ing their construction. Each line: spec section that depends on it → existing artifact + path. This appendix exists so a fresh subagent dispatched to a single leaf doesn't waste effort rebuilding shipped infrastructure.

**Flatland container + render-to-texture (consumed by §6, §7.D.1, §8):**
- `Flatland` class accepts `renderTarget?: RenderTarget` constructor option → `packages/three-flatland/src/Flatland.ts:84`
- `flatland.texture` getter returns the RT's texture (or `null`) → `Flatland.ts:420`
- `flatland.render(renderer)` redirects to `renderTarget` when set → `Flatland.ts:1257–1278`
- Auto-resize on dimension change → `Flatland.ts:1363–1364`
- Multiple Flatland instances coexist in one app; each owns its own scene + camera + lighting

**Layer infrastructure (consumed by §6.C.4):**
- Layer constants + lighting-layer isolation patterns → `packages/three-flatland/src/pipeline/layers.ts`
- Camera layer setup → `Flatland.ts:347–380` (precedent for adding/excluding layers per camera)

**Sprite + animation primitives (consumed by §6.C.2, §8.E.5):**
- `Sprite2D`, `SpriteGroup`, `SpriteBatch` → `packages/three-flatland/src/sprites/` + `packages/three-flatland/src/pipeline/`
- `AnimatedSprite2D` + `AnimationController` (clip switching, frame advance) → `packages/three-flatland/src/sprites/AnimatedSprite2D.ts` + `packages/three-flatland/src/animation/`. **Already supports `play('clipName')` API the spec requires** — no new animation framework needed.
- Per-instance accessors (`readLitFlag`, `readFlip`, `readShadowRadius`, …) → `packages/three-flatland/src/materials/instanceAttributes.ts`
- Interleaved instance buffer (`instanceUV`, `instanceColor`, `instanceSystem`, `instanceExtras`) → same file; `instanceExtras.y` already reserved for picking ID (just not yet read).

**Slug text + font baking (consumed by §8.E.1, §8.E.2):**
- `SlugText`, `SlugFont`, `SlugFontLoader` → `packages/slug/src/{SlugText,SlugFont,SlugFontLoader}.ts`
- `slug-bake` CLI (TTF → `.slug.glb`, unicode range support, runtime + baked modes) → `packages/slug/src/cli.ts`
- Bake orchestration framework → `packages/bake/src/`

**ECS systems pattern (consumed by §6.C.5, §9.F.3):**
- Koota world + trait system (project ECS) → `packages/three-flatland/src/ecs/`
- `transformSyncSystem` is the canonical iteration-over-transforms precedent → `packages/three-flatland/src/ecs/systems/transformSyncSystem.ts`
- `shadowPipelineSystem` + `postPassSystem` are the precedent for pre/post render passes → same dir
- `lightSyncSystem`, `lightEffectSystem`, `lightMaterialAssignSystem` (Epic 1) — atlas/HUD/avatar light updates ride these
- `LightingContext` trait (AoS singleton) → `packages/three-flatland/src/ecs/traits.ts:262`. Epic 1 updates its field shape; showcase consumes the updated form.

**Epic 1 deliverables (consumed by §6, §7.D.1, §8 — assumed live when showcase work begins):**
- `FlatlandLightsNode extends LightsNode` (tiled forward+ as a LightsNode subclass) → Epic 1 plan Phase 3
- `Flatland2DLightingModel extends LightingModel` (stylized 2D lighting model) → Epic 1 plan Phase 4
- `PointLight2D` / `SpotLight2D` / `DirectionalLight2D` / `AmbientLight2D` subclasses + `isFlatlandLight()` tag + `FLATLAND_LIGHTING_LAYER` + `applyLightingLayer` → Epic 1 plan Phase 2
- `lightCollector` selector primitive + token-list sugar → Epic 1 plan Phase 6
- Per-material `lightsNode` assignment via `EffectMaterial.setFlatlandLighting()` → Epic 1 plan Phase 5 / Task 5.1
- `NormalMapProvider` driving `material.normalNode` → Epic 1 plan Phase 5 / Task 5.2
- Per-instance `lit` flag as TSL `select()` at the output node (preserves single-batch mixed lit/unlit) → Epic 1 plan Phase 5 ("trap 3" preserved)

**Testing + CI infrastructure (consumed by §10):**
- Vitest (root config + GPU mocks via `vitest.setup.ts`) → root `vitest.config.ts`
- `isNodeShaped` TSL smoke-check pattern → established in `packages/nodes/src/lighting/shadows.test.ts:12–54`
- Playwright smoke harness (canvas/FPS/draws stats) → `e2e/smoke-examples.spec.ts`; helper `__flatlandDebug.stats()` pattern wired through `DevtoolsProvider` and `debug-protocol.ts:82–100`
- `vitexec` skill (live-browser inspect + screenshot + perf trace) → `.claude/skills/vitexec/`
- `size-limit@12` (already installed in root) → root `package.json` `devDependencies`
- `lefthook.yml` (pre-commit/post-checkout/post-merge already configured) → root `lefthook.yml`
- ESLint with TypeScript rule infrastructure → root `eslint.config.js`
- Dev/prod guards pattern (`process.env.NODE_ENV` + `import.meta.env.DEV`) → `Flatland.ts:322` is the established precedent

**Asset pipeline (consumed by §8.E.2):**
- `slug-bake` invoked via postinstall script pattern (precedent: `packages/three-flatland/scripts/bake-example-fonts.ts`)
- pnpm workspace catalog for shared deps → `pnpm-workspace.yaml`
- `pnpm.overrides` mapping `@three-flatland/*` → `workspace:*` is established; new package `minis/alchemy-duel` follows it

**Picking-id slot (consumed by §7.D.4):**
- `instanceExtras.y` reserved as per-instance picking ID slot → `planning/superpowers/specs/2026-04-23-interleaved-instance-buffer-design.md`. Slot is allocated in the buffer schema; write/read paths are new (showcase scope).

**Bottom line for the plan-writer:** the ~120–160 hours of "infrastructure" implicit in §4–§10 is already shipped or in Epic 1. New work is the rules engine + AI, daemon + CLI + personas, 8 agent skills, rendering composition (using the existing primitives), card asset authoring, and tests — totaling ~280–350 hours of genuinely-new code + ~40–50 hours of small extensions to the partials listed in audit (`verify-prod-bundle.ts` scanner, CMA-ES wrapper, ECS diff→intent hooks, P2 perspective sprite math, P3 billboard mode). Treat this appendix as the negative-space gate: if a leaf in the implementation plan proposes rebuilding anything in this appendix, that leaf is over-specified and should be deleted in favor of consumption.

## 18. Frontend stack — Koota ECS + React Three Fiber only (no plain three.js variant)

**Decision D13 (added 2026-05-29):** The showcase is an **R3F app**. There is no `examples/three/` variant of this showcase — the standard "examples come in pairs (three + react)" rule (per AGENTS.md) is explicitly waived for this mini. The single deliverable is `minis/alchemy-duel/` as an R3F + WebGPU app.

**Decision D14:** Gameplay ECS is **Koota** — the same ECS the rest of the repo uses; same trait conventions (SoA via `trait({...})`, AoS singletons via `trait(() => ({...}))`). Game state systems, animation/tween systems, the diff→intent system, and the 3D→atlas light driver all run as Koota systems on a dedicated showcase world. The world is owned by a React provider at the showcase root; system scheduling is driven from a single `useFrame` callback in deterministic order (matching §9.F.3).

**Implications across the spec:**
- **§2 package structure:** `minis/alchemy-duel/` is an R3F app (Vite + React + `@react-three/fiber/webgpu` + `three-flatland/react`). Entry is `src/App.tsx` rather than `src/prod-entry.ts`; the prod/dev split in §5.B.8 is enforced via Vite's `import.meta.env.DEV` + `src/dev/` dir exclusion exactly as specified — no change to the split mechanism, just the entry shape.
- **§6.C (rendering):** the three Flatland containers + the 3D MAIN scene are composed as R3F JSX. Plain `THREE.Scene` becomes the R3F root `<Canvas>`. `atlasFlatland` and `hudFlatland` are `<flatland renderTarget={atlasRT}>` and `<flatland>` JSX elements respectively. Avatar `AnimatedSprite2D` instances are `<animatedSprite2D billboard="cylindrical">` JSX. Card meshes are `<instancedMesh>` JSX with per-instance attribute setup in `useEffect`. All flatland primitives are already `extend()`-registered for R3F per the existing `three-flatland/react` subpath; no new registration work.
- **§9 frame cycle:** ECS systems run from a single `useFrame((state, dt) => { … runSystems(world, dt) … })` at the showcase root. The deterministic system order in §9.F.3 is preserved — `useFrame` is the scheduler, the ordered system list is what it calls. R3F's own internal render happens after the `useFrame` callback returns, which gives ECS systems first crack at state and renderer second.
- **§7.D.4 picking:** R3F provides pointer events (`onPointerDown`, `onPointerOver`, `onPointerMissed`) on objects natively, integrated with the same `Raycaster` the spec's `HitTester` uses. The hybrid CPU `HitTester` becomes a thin wrapper that consumes R3F's pointer events for 3D meshes + billboarded sprites + HUD widgets, then routes to `InputBridge` as designed. This is *simpler* than the spec's plain three.js framing.
- **§13 issue tree:** no leaves change in number, but their bodies should reference R3F idioms (JSX components, hooks, providers) rather than imperative three.js construction. The `creating-github-issues` pass should label appropriately (`area:r3f` if the repo's vocabulary uses it; otherwise consume the existing `area:showcase` + `area:renderer`).
- **§14 sequencing:** R3F+Koota is the baseline; there's no parallel three.js track. The build sequencing is unaffected — Epic 1 still gates Subsystems C/D/E.
- **Skill naming:** unchanged. The skills (`balance-playtest`, `add-card`, etc.) operate on the rules engine, daemon, CLI, and assets — all of which are R3F-agnostic.
- **Testing surface (§10):** vitexec captures and Playwright smoke continue to work; the `__flatlandDebug` hooks live as a React effect attaching to `globalThis` in dev mode (matches Epic 1's pattern).

**What this removes from scope:** any "three.js-variant" leaf, any "sync `three/` example with `react/` example" tooling. The `scripts/sync-react-subpaths.ts` script is still consumed for the `three-flatland/react` package itself; the showcase doesn't trigger it.

**What this does NOT change:** the prod/dev split (§5.B.8 still applies — daemon/CLI/tuner/personas in `src/dev/`, prod bundle includes only React app + rules engine + renderer + embedded balance); the agent-first contributor framing (§11–§12 unchanged); the test layers (§10 unchanged); the reuse reference (§17 unchanged — every primitive listed there is already available via R3F's `extend()` mechanism for flatland symbols).
