# Codemod artifact template

Copy this as the starting point for any new codemod under `packages/<pkg>/codemods/<slug>.md`. Fill in placeholders; delete sections that don't apply for your migration. Keep the structure.

The "Codemod prompt" section is the **agent input**: write it in second person, addressed to an LLM agent operating in an unknown consumer codebase.

---

```markdown
---
title: '<Human title — e.g., "Sprite2D: setFrame() removed">'
slug: '<matches filename without .md>'
package: '<npm package name, e.g., three-flatland>'
version: '<first version requiring this codemod — e.g., 0.1.0-alpha.6>'
type: 'breaking'
audience: 'consumers'
---

# <Title>

<1–3 sentences: what changed and why the user cares.>

## Migration

| Before | After |
|--------|-------|
| `<old syntax>` | `<new syntax>` |

<If chained calls or multi-line patterns need attention, show them in code blocks below the table.>

## Codemod prompt (LLM-applicable)

You are migrating a TypeScript/JavaScript codebase that uses `<package>`. Apply the following transformation:

### 1. Discover candidate sites

<Generic search guidance — grep/ripgrep with concrete patterns. Specify file extensions.>

```bash
rg -n '<pattern>' --type ts --type tsx --type js --type jsx
```

**Always skip:**
- `node_modules/`
- Build output (`dist/`, `build/`, `.next/`, `out/`, etc.)
- Type declarations generated from source (`*.d.ts` in build output)
- This codemod artifact itself
- Any vendored copies of `<package>` source

### 2. Verify each candidate is in scope

<How to disambiguate from false positives. Use imports, TS inference, or the agent's judgment. If uncertain on a specific site, instruct the agent to ASK the user before transforming.>

**Out of scope:**
- <Other libraries / classes that may share the same identifier>

### 3. Apply the transformation

<Precise pattern → replacement. Preserve user expressions verbatim.>

**Edge cases:**
- <Chained calls, return-value usage, type guards, etc.>

### 4. Update related artifacts

<Comments, docstrings, markdown that reference the old API. Leave historical references in CHANGELOG / migration notes alone.>

### 5. Do NOT touch

- `node_modules/`
- Build output directories
- This codemod artifact (the file you're reading)
- Vendored copies of `<package>` source

## Verification

Run the consumer's normal typecheck and tests:

\```bash
npx tsc --noEmit
npm test
\```

The migration is successful when both pass and:

\```bash
rg '<pattern>' --type ts --type tsx --type js --type jsx \
   --glob '!**/node_modules/**' \
   --glob '!**/dist/**' \
   --glob '!**/build/**' \
   --glob '!**/CHANGELOG*' \
   --glob '!**/codemods/**'
\```

returns zero matches in source code.

## Edge cases

- **<Edge case 1>**: <how to handle>
- **<Edge case 2>**: <how to handle>
- **Reflection / dynamic dispatch**: out of scope; FLAG for human review.
- **Type guards / generic constraints**: FLAG for human review.
- **Mocks (`vi.mock`, `jest.mock`)**: FLAG for human review.

## Related

- Changeset: `.changeset/<entry>.md`
- PR: see CHANGELOG link.
- New API docs: <link to relevant docs>.
```
