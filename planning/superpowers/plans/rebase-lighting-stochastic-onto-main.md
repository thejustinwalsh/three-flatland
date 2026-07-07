# Rebase Plan: `lighting-stochastic-adoption` → `origin/main` (post docs-refresh)

Generated 2026-05-14. Investigation done with `git merge-tree` against the current remotes.

## Situation

- Merge base: `6ad4f2b9` (PR #26 changeset-release).
- Branch `lighting-stochastic-adoption`: **140 commits** ahead of base (2D lighting system,
  devtools package, SDF/Forward+, normals, bake CLI, etc.). 14 are pure `ci: generate changesets`
  → dropped during rebase, leaving **126** real commits.
- `origin/main`: **354 commits** ahead of base — the docs refresh (PR #33) plus the whole
  issue-#32 audio/theme/brand workstream. Foundation refresh swapped the docs stack to
  Astro 6 + Starlight 0.38 + a vendored `packages/starlight-theme` plugin.
- Backup tag: `backup/lighting-stochastic-adoption-prerebase`.

## Execution hygiene (learned the hard way)

- **NEVER `git add -A` / `git add .` during conflict resolution** — it sweeps in untracked
  files (`.claude/skills/excalidraw-diagram-skill/`, this plan file) and folds them into a
  replayed commit. The rebase machinery already stages non-conflicted changes; only
  `git add <the specific files you resolved>`.
- During the rebase, this plan lives at `/tmp/rebase-lighting-stochastic-onto-main.md` and
  the untracked excalidraw skill dir is moved to `/tmp/` — restored at the end.
- `rerere` is enabled — recorded resolutions auto-replay on restart.

## Conflict surface (from `git merge-tree`)

### A. Generated artifacts — do NOT hand-merge
| File | Action |
|---|---|
| `pnpm-lock.yaml` | Take **main's** (`--ours`) at every stop; `pnpm install` to regenerate at end. |
| `docs/public/llms.txt`, `docs/public/llms-full.txt` | modify/delete — main deleted both. Accept deletion; re-run `/llms-sync` after. |
| `.changeset/*` | The 14 `ci: generate changesets` commits are dropped, so the branch no longer touches `.changeset/`. If `pre.json` still conflicts, take main's. |

### B. modify/delete — dragons
| File | What happened | Resolution |
|---|---|---|
| `docs/src/styles/retro-theme.css` | main deleted it (theme → `packages/starlight-theme/styles/`, `data-theme` attr dropped). Branch added `:not(.tf-annot__hotspot):not(.tf-mermaid__btn)` button-selector exclusions. | Accept deletion. Branch tweak likely obsolete — **verify** `.tf-annot__hotspot`/`.tf-mermaid__btn` render OK against new theme; if not, port into `starlight-theme/styles/`. |
| `docs/src/content/docs/guides/debug-controls.mdx` | Branch deleted it (superseded by new `devtools.mdx`). main modified it (`4430a7ff` Tabs/TabItem refactor). | Keep branch's deletion. Skim `4430a7ff` for content worth folding into `devtools.mdx`. |

### C. Examples — take BRANCH's side through the replay, reapply main's gem-background at end
main wired `gemGradientNode`/`GEM` into every example; branch rewrote the same examples
heavily (tweakpane→devtools, 6× churn on `pass-effects/App.tsx`). Policy: `git checkout --theirs`
for conflicting `examples/**` files at every stop; reapply main's gem-background wiring as one
final commit. New `GemBackground`/`gem` files from main arrive clean.

### D. Docs content (.mdx) — small surgical edits, easy to silently drop
~90% additive: 5 new content pages + 5 new Astro components + media/tooling land clean.
`debug-controls.mdx` deleted (see B). ~10 guides auto-merge (asides, `<Mermaid>`, `<Compare>`).
Three conflict:
- `introduction.mdx` — 2 one-liners. **Watch:** branch says "Early Alpha"; main says "Alpha" — keep main's.
- `index.mdx` — 1 line: `<Tabs>` → `<Tabs syncKey="framework">`.
- `pass-effects.mdx` — +156, real merge: `<Compare>`, `<Mermaid>`, asides onto main's refreshed version.
Cross-cutting: component import paths must resolve; `:::tip`/`<Aside>` must render under Starlight 0.38;
no dangling links to `guides/debug-controls`.

### E. `docs/astro.config.mjs` — REIMPLEMENTATION (STOP-AND-CHEW, at END of rebase)
main rewrote this for Astro 6 / Starlight 0.38 / `starlight-theme` — 430+/236-. A 3-way merge is
meaningless. Policy: take **main's** (`--ours`) at every stop during the rebase. After the rebase
completes, **stop and reimplement** — take main's file verbatim, hand-reapply branch intent:
1. **`copyDevtools()` vite plugin** — `import { copyDevtools } from './vite-plugins/copy-devtools.js'`,
   insert into vite `plugins` array after `copyExamples()`. `copy-devtools.js` arrives clean.
2. **Sidebar IA** — branch added "Concepts" group (Flatland, Batch Rendering, 2D Lighting,
   Shadows), trimmed Guides to how-tos, added Tilemaps + Baking, swapped Debug Controls → Devtools,
   renamed "Project" → "Resources", added Lighting example. main's sidebar already changed
   (Examples removed from sidebar entirely, still lists Debug Controls). Re-apply branch IA onto
   main's *current* shape. New slugs (`guides/devtools`, `guides/lighting`, `guides/shadows`,
   `guides/baking`) MUST be wired or pages are orphaned.
3. Broken `.claude/worktrees` watch-ignore removal — moot, main already dropped the `vite.server` block.

`docs/package.json` — normal merge: keep main's stack deps + add branch's `"mermaid": "^11.4.1"`.

### F. Small root config — resolve per-stop
`package.json`, `examples/package.json`, `vitest.config.ts`, `README.md`,
`packages/presets/src/index.ts`, `packages/three-flatland/src/index.ts`. `CLAUDE.md`/`.gitignore` auto-merge.

## Steps

1. **Prep** — done: fast-forwarded, backup tag created, `rerere` enabled.
2. **Rebase** — `GIT_SEQUENCE_EDITOR` drops the 14 `ci: generate changesets` commits:
   `git rebase -i --onto origin/main 6ad4f2b9 lighting-stochastic-adoption`
3. **Resolve per category above.** Explicit `git add <paths>` only. `GIT_EDITOR=true git rebase --continue`.
4. **Post-rebase regenerate:** `pnpm install`, `pnpm sync:pack`, `pnpm sync:react`, `/llms-sync`.
5. **Reimplement `astro.config.mjs`** (section E) — the stop-and-chew checkpoint.
6. **Reapply main's gem-background** to examples as one commit (section C).
7. **Verify:** `pnpm -r typecheck`, `pnpm -r test`, `pnpm --filter docs build`, `pnpm dev` +
   load one Three.js + one React example (gem bg + devtools pane both work). Visually check
   `.tf-annot__hotspot`/`.tf-mermaid__btn`.
8. **Restore** excalidraw skill dir + this plan file from `/tmp`.
9. `git push --force-with-lease` once green — confirm with stakeholder first (shared branch).

## Risk register

- No authored work dropped — only the 14 regenerable `ci: generate changesets` commits.
- Highest volume: ~20 example files, all same take-`--theirs` shape; rerere amortizes.
- Highest judgment: `pass-effects.mdx`, `astro.config.mjs` reimplementation.
- `retro-theme.css` deletion — the one place branch work could silently vanish; verified in step 7.
- Abort path: `git rebase --abort` → backup tag. (Note: abort does `reset --hard` — any
  file made tracked by a bad `git add -A` mid-rebase gets deleted. Keep stray files out of the tree.)
