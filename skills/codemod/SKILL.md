---
name: codemod
description: Use when the user wants to make/create/author/write a codemod for a three-flatland breaking change, OR when they want to apply/run/execute/migrate using an existing codemod artifact. Routes between authoring (contributors writing migrations) and applying (consumers running migrations) based on the user's intent.
---

# Codemod

A **codemod artifact** is a self-contained Markdown migration recipe shipped with three-flatland packages (and any ecosystem library following the same convention). One file per breaking change. LLM agents read the artifact and apply the migration to whatever codebase they're operating in.

Two distinct workflows live in this skill — route to the right one based on the user's intent:

| User said… | Workflow |
|------------|----------|
| "make a codemod", "write a codemod", "create a codemod for X removal", "ship a breaking change" | **Authoring** — go to the [Authoring](#authoring) section |
| "apply this codemod", "run the codemod", "execute the migration", "migrate my code", "use the codemod at …" | **Applying** — go to the [Applying](#applying) section |

If the user's intent is ambiguous, ask: "Are you writing a new codemod, or applying an existing one?"

---

# Authoring

For contributors introducing a breaking change to a three-flatland package (or any compatible ecosystem library).

## When to author

- Removing or renaming an exported API
- Changing an argument signature, options shape, or import path
- Any breaking change with a 1:1 syntactic migration

## When NOT to author

- Internal refactors with no user-visible API change
- Behavior changes without a syntactic migration (document in changeset instead)
- Removed APIs with no replacement (no transformation possible)

## Quick reference

| Step | Action |
|------|--------|
| 1 | Author artifact at `packages/<pkg>/codemods/<slug>.md` |
| 2 | Use the template at [artifact-template.md](artifact-template.md) |
| 3 | Ensure `codemods/` is in the package's `files[]` in package.json |
| 4 | Update `packages/<pkg>/codemods/README.md` index |
| 5 | Reference the artifact path from the changeset entry |
| 6 | Dogfood via subagent (see [dogfooding.md](dogfooding.md)) |

## Core rule

**Codemods are user-facing, not monorepo-scoped.** The applying agent has zero context about three-flatland's source layout. Write the prompt for an unknown consumer codebase.

## Format requirements

See [artifact-template.md](artifact-template.md) for the full structure. Required:

- **Frontmatter**: `title`, `slug` (matches filename), `package`, `version`, `type: breaking`, `audience: consumers`
- **Migration**: human-readable before/after table
- **Codemod prompt (LLM-applicable)**: second-person instructions for the applying agent, structured as numbered phases (Discover → Verify → Apply → Update related → Skip list)
- **Verification**: generic consumer commands (`npx tsc --noEmit`, `npm test`)
- **Edge cases**: anything requiring human judgment is FLAGGED, not silently assumed

## The artifact format is a DSL we own

The Markdown structure isn't a stylistic accident — it's a **domain-specific language** for instructing applying agents. Phase headers (`### 1. Discover…`), the "Do NOT touch" list, the FLAG-don't-guess convention — all of these are conventions agents have been observed to honor.

You can extend the DSL when natural-language phases aren't enough:

- **Structured tags** inside the prompt section, e.g. `<scope:include>...</scope:include>` blocks for in-scope verification rules.
- **Annotated code fences** like ` ```codemod:pattern` or ` ```codemod:replacement` that the skill can teach agents to parse.
- **`[FLAG]:` line prefixes** for edge cases that must be human-reviewed.
- **Typed frontmatter fields** beyond the required set when a class of migrations needs new metadata.

Two rules when extending:

1. **Update this skill** to teach agents how to read the new annotation. The skill is loaded into the authoring/applying agent's context; the artifact alone is loaded into the applying agent's context. Annotations the skill doesn't explain will be ignored.
2. **Backward compatibility.** Old artifacts must remain applyable. Extend by ADDING optional structure, not by changing required sections.

## Rationalization table (authoring)

| Excuse | Reality |
|--------|---------|
| "I'll scope to our monorepo for now" | The artifact ships in the npm package; users in any repo apply it. Scoping breaks every consumer. |
| "The agent will figure out what to skip" | Without an explicit skip list, agents try to migrate `node_modules`, build output, and the codemod artifact itself. List them. |
| "Generic verification is too vague" | The consumer's tooling isn't your problem. `npx tsc --noEmit` + "run your tests" covers it. |
| "It's just a docs change, no codemod needed" | If user code references the removed/renamed API, the codemod migrates those references. Authoring is part of the breaking-change checklist. |
| "ts-codemod / jscodeshift would be more robust" | Future addition, out of scope here. This skill defines the Markdown LLM-applicable format. |
| "I'll bundle two breaking changes into one codemod" | One artifact = one breaking change. Auditable, replayable, separately version-pinned. |
| "Pattern is obvious; agent doesn't need disambiguation rules" | False positives exist (other libs with same method names, mocked references, type guards). Tell the agent how to verify scope. |
| "Edge cases are rare, I'll skip them" | The codemod runs on codebases you've never seen. Enumerate the edge cases you considered; instruct the agent to FLAG anything outside them. |

## Red flags (authoring) — STOP and rewrite

- Codemod prompt references monorepo paths (`packages/three-flatland/...`, `examples/...`, `pnpm test`)
- No "Do NOT touch" list (always: `node_modules/`, build output, the codemod artifact itself)
- First-person prompt ("I'm migrating...") instead of second-person ("You are migrating...")
- Verification assumes our tooling (`pnpm`) — must be generic (`npx`, `npm`)
- Edge cases silently assumed instead of flagged for human review
- Filename doesn't match `slug` in frontmatter
- Multiple breaking changes packed into one artifact

## Authoring checklist

- [ ] File at `packages/<pkg>/codemods/<slug>.md`; slug matches filename
- [ ] Frontmatter has all required fields
- [ ] Prompt is second-person, agent-facing
- [ ] No references to monorepo paths or our tooling
- [ ] Skip list includes `node_modules/`, build output, the artifact itself
- [ ] Edge cases that need human judgment are FLAGGED
- [ ] Package's `codemods/` dir is in `files[]` in package.json
- [ ] `codemods/README.md` index updated
- [ ] Changeset entry references the artifact path
- [ ] Dogfooded via subagent (worktree compiles + tests pass after applying)

---

# Applying

For consumers (game devs, library extenders) or any LLM agent in any repo asked to migrate code using an existing codemod artifact.

## When to apply

- A three-flatland (or compatible ecosystem package) upgrade has a breaking change with a codemod artifact published
- The user references a codemod by path or asks to migrate their code through one
- The user is upgrading and the CHANGELOG points to a codemod artifact

## Where codemods live

Codemod artifacts ship with the package they're for. After installing the package, find them under:

```
node_modules/<package-name>/codemods/<slug>.md
```

E.g. `node_modules/three-flatland/codemods/sprite2d-setframe-removal.md`.

The package's `codemods/README.md` (if shipped) lists all available codemods with a one-line description.

## Application flow

**1. Locate the artifact.** Either the user provided a path, or you find it under `node_modules/<package>/codemods/`. If multiple codemods are available and the user didn't specify which, list them and ask.

**2. Read the artifact in full.** It contains:
- Frontmatter (title, package, version it applies to)
- Human-readable Migration section (before/after table)
- A "Codemod prompt (LLM-applicable)" section — **this is your instruction set**

**3. Follow the artifact's "Codemod prompt" section EXACTLY.** It will tell you:
- How to discover candidate sites (search patterns, file types to scan)
- How to verify each candidate is in scope (imports, type inference, etc.)
- How to apply the transformation (precise pattern → replacement)
- What edge cases require human FLAG instead of guessing
- What paths to SKIP (always: `node_modules/`, build output, the artifact itself)

**4. Always skip:** `node_modules/`, `dist/`, `build/`, `.next/`, `out/`, any vendored copies of the package source, and the codemod artifact itself. The artifact will reinforce this — do not deviate.

**5. Report what you changed.** After applying:
- List every file you modified, with a one-line description of the change in each
- List every site you FLAGGED for human review (with `file:line` and the reason)
- Note any deviations from the artifact's prompt you had to make (with rationale)

**6. Do NOT run the user's tests.** The artifact's "Verification" section names the commands the user should run themselves (`npx tsc --noEmit`, `npm test`). They verify; you don't.

## Rationalization table (applying)

| Excuse | Reality |
|--------|---------|
| "I'll improve on the artifact's prompt" | Don't. The artifact's author knew the migration; you don't. Follow it literally. |
| "The user obviously wants me to update tests too" | Only if the artifact says so. Otherwise update what the prompt tells you to update. |
| "node_modules has matches; user probably wants those migrated too" | NEVER touch node_modules. Skip lists are absolute. |
| "This edge case is rare; I'll just guess" | The artifact says FLAG, not guess. Add the site to your report and let the user decide. |
| "Tests are part of source, I'll change them" | Only if the artifact's discover/scope includes test files. Read the prompt. |
| "I'll run their tests to verify" | No. Report what changed; the user runs verification. Running their build/tests is out of scope. |

## Red flags (applying) — STOP and ask the user

- The artifact's "Codemod prompt" section is missing or empty
- You can't determine whether a call site is in scope from the artifact's guidance
- The artifact references package APIs that don't exist in the user's installed version (version mismatch)
- The transformation would touch files outside the skip list
- The transformation is destructive (deletes large code blocks) and the artifact didn't describe it that way

## Dispatch shape (for harnesses that dispatch subagents)

If you're orchestrating a subagent to apply a codemod (rather than applying it directly), the dispatch prompt looks like:

```
You are an LLM agent applying a three-flatland codemod artifact.

Read the codemod artifact at:
  <absolute path to .md file>

Then follow its "Codemod prompt (LLM-applicable)" section EXACTLY. Apply the migration
to the codebase rooted at:
  <consumer's repo root>

Rules:
- Do NOT modify the codemod artifact itself.
- Do NOT touch anything under node_modules/, dist/, build/, or any other build output.
- Follow the artifact's skip list.
- If the artifact says to FLAG something, list it in your report — do not guess.

Report when done:
1. List of files you modified, one per line, with a one-line change summary.
2. Sites flagged for human review (with file:line and reason).
3. Any deviations from the artifact's prompt with rationale.
```

---

## Related files in this skill

- [artifact-template.md](artifact-template.md) — copy-paste template for authoring a new codemod artifact
- [dogfooding.md](dogfooding.md) — how to test an authored codemod by dispatching a subagent to apply it in the monorepo (used during authoring, not by consumers)
