# uikit fork — session handoff (continuation plan)

**Worktree:** `/Users/tjw/Developer/three-flatland/.claude/worktrees/uikit-fork` · branch `feat/uikit-fork` ·
**PR #179 (DRAFT — never mark ready without stakeholder approval).** ~46 commits ahead of `origin/main`.
Second draft PR **#181** (Flatland aspect fix) is independent and also draft.

## STEP 0 — the immediate next action

**One workflow is still running: `wxjyh9m6w` (PE — panel edge precision).** It notifies on completion.
When it lands (or if already landed), do STEP 1. Do NOT commit anything until PE settles — the tree is
mid-edit and panels render broken in PE's intermediate state (expected).

If PE is stuck/spiraled (check: `git diff --stat packages/uikit/src/panel/material/shader.ts` — should
be a focused ~50-line change; screenshot shows broken panels): stop it (`TaskStop wxjyh9m6w`), revert
its files (`git checkout packages/uikit/src/panel/material/`), and re-dispatch the dilation with the
**hard invariant below**.

## STEP 1 — verify the whole batch with PIXELS, then commit

Uncommitted work sitting in the tree from two workflows (all done except PE):

| Unit              | Files                                                                                                                                                                                                                                                               | Fix                                                                                                 | Verify                                                                                                                                                     |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **U4 tabs**       | `packages/uikit-default/src/tabs/content.ts` (+1 line)                                                                                                                                                                                                              | `flexDirection: 'column'` on TabsContent so Card stretches to 400                                   | Card = 400 on BOTH Account & Password, no resize on switch, no trigger overflow                                                                            |
| **U5 video**      | `packages/uikit/src/components/video.ts`                                                                                                                                                                                                                            | `readyState` gate on first texture copy + `loadeddata`/`seeked` self-heal                           | ?component=video: frame at t2 ≠ t5 (advancing); no `CopyExternalImageToTexture` warning after first frame                                                  |
| **F5 retina**     | `packages/slug/src/{SlugText,SlugBatch,SlugStackText}.ts`, `packages/uikit/src/panel/instance/group-manager.ts`, `context.ts`, `components/component.ts`, `svg/render/instanced-shape-group.ts`, `text/render/instanced-glyph-group.ts`, new `SlugViewport.test.ts` | viewport = renderer drawing-buffer (device px) so slugDilate AA is DPR-correct                      | text AA not over-dilated at DPR 2; DPR-1 identical                                                                                                         |
| **PE panel-edge** | `packages/uikit/src/panel/material/{shader,create}.ts`, new `reference.{ts,test.ts}`                                                                                                                                                                                | half-pixel quad dilation for rounded-corner AA headroom + content clips to inner (border-inset) box | **radios ROUND at 20× (no flat tangents), badge white icon does NOT bleed past black border, box does NOT shift/swim, ZERO shader warnings both backends** |

**PIXEL GATE (the whole point — do NOT commit on green tests alone):**

- Dev servers: conformance `http://localhost:5182/?component=<name>` (uikit-default), game UI
  `http://localhost:5180/three/uikit/` and `/react/uikit/`. Restart if down (see STEP 4).
- Screenshot + PIL 20× crop a radio ring → must be round, no flat cardinal tangents.
- Screenshot the badge (Zap icon) → white must not bleed past the black border.
- **Box-doesn't-swim check (stakeholder's explicit invariant): the dilation is RENDER-ONLY. A 16×16
  radio must still lay out at 16×16 — the quad outsets ~1px in screen space, the SDF is computed
  against the ORIGINAL box, extra fragments carry only AA falloff. If everything shifted/misaligned,
  PE violated this — bounce it.**
- Tabs: Account vs Password card both 400, no resize.
- Grep vitexec console for shader warnings — any new one means a discard/conditional-fwidth crept in
  (violates the Q2 uniformity invariant) → bounce.

Gates (all should pass): `pnpm exec vitest run packages/slug/src` (~392), `packages/uikit/src` (~66),
typechecks (slug, uikit, uikit-default, examples), eslint 0, prettier. `pnpm --filter=<pkg> test`
SILENTLY EXITS 0 — always use `vitest run`.

**Commit** in logical batches (scoped paths), each with a real message. **Preserve** the landed fixes:
panel matrix COMPACTION (`panel/instance/mesh.ts`), baseline half-leading, pixelSnap=false, SlugBatch
bit-identity, the three patch. Never add a Co-Authored-By/AI trailer. Use the repo identity
(`Justin Walsh <contact.me@thejustinwalsh.com>`), never the harness `@obsidian-cipher.systems` email.

## STEP 2 — update the bug ledger with confirmed verdicts

`planning/superpowers/bug-ledger.md`. Mark:

- **U4 Tabs → CONFIRMED UPSTREAM BUG, PR candidate.** TabsContent defaults to row; Card is fit-content
  not stretched. Verified against upstream main AND released 1.0.74 (both 399.69/384.10, unstable).
  Upstream only _looks_ right because MSDF Inter's wrapped-line measure lands near 400; **our Slug TTF
  metrics (~10% narrower wrapped lines) exposed the latent bug.** One-line fix = shadcn parity.
- **U5 Video → upstream-shared**, fixed (readyState gate + self-heal). Hard-freeze didn't reproduce on
  current Chrome (autoplay-policy reject on synthetic click suspected).
- **PE panel-edge → NOT an algo limitation** (stakeholder confirmed the classic 1-2px AA-border trick).
  Upstream has the same tangent-clipping; our dilation makes fully-rounded shapes crisper than upstream.

## STEP 3 — the pending build queue (in priority order)

1. **BENTO GALLERY (stakeholder wants it):** a single fullscreen bento-grid example per kit exercising
   EVERY component in one attractive view — one for `uikit-default`, one for `uikit-horizon`, and each
   future kit. Distinct from the tabbed conformance example (which is a QA harness). Lives in the
   example dirs (`packages/uikit-default/example/` gets a bento route/view; `uikit-horizon` needs its
   own example scaffold). Dispatch AFTER STEP 1 commits (clean tree). Use the same our-fork gotchas
   brief as the conformance port (canvasInputProps, Slug font via SlugFontLoader, native DPR, R3F
   native events, no forwardHtmlEvents, extend()).
2. **Scrollbar thumb polish** (`design-polish.md` P1): theme the scroll thumb — uikit draws its own
   scrollbar as a scene panel (OS-independent), so round it + theme it to the kit radius/color scale.
3. **Tab hitch:** stakeholder wants tab content PRE-BUILT (toggle visibility, not add/remove on switch)
   so the three demo doesn't hitch. The three patch fixed the frame-lag; the remaining hitch is the
   first-show BUILD (shaping glyphs/panels). Consider pre-building all tab content. ("react activity"
   was the stakeholder's analogy for the React side.)
4. **Task #1 — Chrome perf capture:** 10-min soak then trace, both twins. Confirm the matrix-compaction
   leak fix holds long-term (React heap was 391→497MB over 30s — watch the 10-min trend).
5. **React twin full pixel gate:** confirm it renders the game UI at parity after the batch (the earlier
   `export named 't'` error was a stale Vite cache from the three patch; fixed by force-restart).

## STEP 4 — environment notes

- **Dev servers** (restart if down): conformance = `cd packages/uikit-default/example && npx vite dev
--port 5182 --strictPort`; game-UI MPA = `EXAMPLES_PORT=5180 pnpm --filter=examples dev`. VS Code
  squats 5174 — don't use it. After a three patch or dep change, **clear ALL `.vite` caches** (`find .
-name .vite -type d | xargs rm -rf`) and restart with `--force`, or you get phantom
  `does not provide an export named 't'` errors from stale optimized deps.
- **A/B upstream:** isolated clone at `/tmp/uikit-upstream` (fresh, installed cleanly OUTSIDE our repo
  so pnpm doesn't fight). Its `default` example needs lucide codegen (`packages/icons/lucide` convert)
  to run; the docs codesandbox (docs.pmnd.rs/uikit) is a flaky lazy boot. For A/B, prefer running the
  isolated clone's demos or reading its source for diffs.
- **three patch:** `patches/three@0.183.1.patch` (backport of merged mrdoob/three.js#33615, InstanceNode
  updateBefore) via `patchedDependencies` in package.json. Patched both `src` and `build/three.webgpu.js`.
  Persists across installs.
- **vitexec** for pixel verification: `cd <example-dir> && pnpm dlx vitexec --path <path> --config
vite.config.ts --gpu --timeout 45 --screenshot <abs.png> '<snippet>'`. `--gpu` REQUIRED. PIL is
  available for crop-zoom. Headless is DPR 1 (chunkier than retina) — the tangent-clipping is geometric
  so it shows at any DPR, but crispness comparisons need the real retina screen.

## Key ledgers / docs

- `planning/superpowers/bug-ledger.md` — all bugs by owner + PR-extraction process (reformat to
  upstream style, revert `@react-three/*` renames, minimal diff off upstream main).
- `planning/superpowers/upstream-uikit-bugs.md` — draft repros for U1/U2/U3 (getStarProperties,
  ClassList, label-subtext). Filing needs stakeholder sign-off.
- `planning/superpowers/design-polish.md` — scrollbar, DPR lever.
- `planning/superpowers/specs/2026-07-10-slug-text-engine-boundary.md` — the Slug/uikit API boundary.
- `pr-body` draft in scratchpad — includes the correction that R3F's `internal.subscribe` was NOT
  removed (my earlier false claim); v10 just never iterates `internal.subscribers`.
