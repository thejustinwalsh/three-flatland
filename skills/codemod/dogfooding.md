# Dogfooding a codemod

A codemod artifact ships with the package. Before merging the breaking change that introduces it, prove the artifact works by applying it to this monorepo via a subagent.

## The test

1. The breaking change is landed in the worktree (e.g., `Sprite2D.setFrame()` removed). The monorepo's downstream code (other source files, tests) now fails typecheck.
2. The codemod artifact is written at `packages/<pkg>/codemods/<slug>.md`.
3. Dispatch a subagent with the artifact path. It applies the migration.
4. Verify the worktree compiles + tests pass.

## Dispatch prompt

```
Agent({
  description: "Apply <slug> codemod",
  prompt: "Read the codemod artifact at packages/<pkg>/codemods/<slug>.md and follow its 'Codemod prompt' section EXACTLY. Apply the migration to the codebase rooted at this repo. Do not modify the codemod artifact itself or anything under node_modules/. Report a summary of files changed and any sites you flagged for human review."
})
```

## Pass criteria

- Worktree typechecks (`pnpm typecheck`).
- Worktree tests pass (`pnpm test`).
- The grep command from the artifact's Verification section returns zero matches in source code (matches in CHANGELOG / codemod artifact are expected).
- The subagent's summary lists every file it changed; you can audit each one.

## If the dogfood fails

- **Agent missed sites**: prompt is too vague. Tighten the Discover/Verify phases.
- **Agent transformed sites it shouldn't have**: prompt didn't disambiguate well. Add to the "Out of scope" or "Edge cases" sections.
- **Agent touched files outside the codebase**: skip list is missing entries.
- **Agent silently guessed on edge cases**: change the prompt to FLAG instead of guess.

Iterate until the dogfood passes cleanly without manual cleanup. **A codemod that needs human cleanup on our own repo will need worse cleanup in a stranger's repo.**

## Why dogfood

The author of a codemod knows what they meant. The agent applying it doesn't. The only way to discover the gap is to dispatch an agent that has no context except the artifact, and see what they do with it.

If the prompt is clear enough to migrate our monorepo, it's clear enough for a user's repo.
