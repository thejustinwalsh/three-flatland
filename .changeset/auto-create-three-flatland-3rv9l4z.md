---
"create-three-flatland": minor
---

> Branch: feat/create-three-flatland
> PR: https://github.com/thejustinwalsh/three-flatland/pull/203

### 10b6353a7544b3b03cbdd8be732afa15b9f154b9
fix: type the shared leak-guard module
tsc --noEmit failed with TS7016 on the .mjs import — vitest's typecheck did not
surface it, the package's own tsc run does. The implementation stays plain ESM
so consumer-smoke.mjs can import it without a build step; this sibling
declaration gives the test suite real types instead of an implicit any.
Files: packages/create-three-flatland/leak-guard.d.mts
Stats: 1 file changed, 13 insertions(+)

### d017f3da3db509f1f5df529c4626e5b455a8c980
fix: ignore scaffolder templates via oxlintrc, not a CLI negation
The root lint runs before build in CI, and the templates deliberately omit
customConditions: ["source"] — the very leak they exist to avoid — so their
three-flatland import resolves to dist types that don't exist yet and type-aware
lint reports Flatland as an error type. Examples escape this only because they
DO carry the source condition.

Two negation-glob attempts on the lint script did nothing: oxlint ignores
negations for explicitly-passed directories. Proved it by appending a real lint
error to a template and watching the root sweep still report it. ignorePatterns
in .oxlintrc.json is the mechanism this repo actually uses (it is how
**/*.test.ts is excluded), and it works — same probe, zero hits.

Also drops the templates' nx lint target. With the files ignored globally it
linted nothing while reporting success, which is a vacuous green. Template
correctness is covered by typecheck (nx orders it after ^build) and by the
consumer smoke, which installs, builds and renders them.
Files: .oxlintrc.json, package.json, packages/create-three-flatland/templates/react/package.json, packages/create-three-flatland/templates/three/package.json
Stats: 4 files changed, 28 insertions(+), 26 deletions(-)

### 621bef2dfc9d572d94c8c42faf8ffe901ac145e9
refactor: single source of truth for the scaffold leak guard
The banned-string lists were duplicated byte-for-byte between scaffold.test.ts
and consumer-smoke.mjs, with a comment calling them twins — which documents the
drift risk without preventing it. Extracted to leak-guard.mjs: plain ESM, no
deps, so both a vitest suite and a bare node script import it without a build
step. It stays out of the published tarball; it is tooling, not product.

The two callers still check different things, which is the point of sharing the
list rather than the check: the unit test guards the templates as authored, the
smoke guards the project a consumer receives after a real registry install.

Verified load-bearing: adding a string to the shared list fails the suite, and
removing it restores 33/33.
Files: packages/create-three-flatland/leak-guard.mjs, packages/create-three-flatland/src/scaffold.test.ts, scripts/consumer-smoke.mjs
Stats: 3 files changed, 45 insertions(+), 43 deletions(-)

### 5ef58746a2c209d0d67655b226eaa47f46a1b08a
fix: restore StrictMode in the React template
The template shipped without StrictMode, justified by a comment asserting that
@react-three/fiber 10.0.0-alpha.2 tears down Canvas event listeners 500ms after
a StrictMode dev double-mount. That claim came from a headless-browser probe and
was never reproduced in a real dev server; the maintainer reports pointer events
working fine in dev.

Every examples/react/* app uses StrictMode, so the template was the odd one out,
and the comment would have taught the same unverified claim to everyone reading
the scaffolded project.
Files: packages/create-three-flatland/templates/react/src/main.tsx
Stats: 1 file changed, 6 insertions(+), 5 deletions(-)

### 7c8d9e7f1eb099b8a8a7533b02c5adec6551fcfa
fix: BASE_URL-safe asset path and complete HMR teardown
Files: packages/create-three-flatland/templates/react/src/App.tsx, packages/create-three-flatland/templates/three/src/main.ts
Stats: 2 files changed, 26 insertions(+), 10 deletions(-)

### 9cb47d64c6b78d5d80500a7218cb4b684a82b5ae
feat: ship AGENTS.md + CLAUDE.md agent guidance in both templates
Files: packages/create-three-flatland/templates/react/AGENTS.md, packages/create-three-flatland/templates/react/CLAUDE.md, packages/create-three-flatland/templates/three/AGENTS.md, packages/create-three-flatland/templates/three/CLAUDE.md
Stats: 4 files changed, 273 insertions(+)

### 04f94a484f55613e82f8480f6dea4afa1946c779
fix: close data-loss, symlink-escape, and silent-no-op holes
Found by adversarial review and verified by reproduction:

- A lone '/' target normalized to '', which resolve() turns into process.cwd();
  with --overwrite that emptied the user's current directory. Format the target
  before deciding whether one was supplied, matching create-vite.
- copyDir wrote through existing destination symlinks, scattering template files
  outside the target. Reject symlinked destinations.
- @clack prompts never settle on EOF, so a non-TTY invocation hung main(),
  drained the event loop, and exited 0 having scaffolded nothing. Refuse to
  prompt without a TTY and name the flags that would have avoided it.
- An invalid --template opened a picker instead of erroring, violating the
  non-interactive contract.

Regression tests cover the symlink escape and the root-target normalization.
Files: packages/create-three-flatland/src/index.ts, packages/create-three-flatland/src/scaffold.test.ts, packages/create-three-flatland/src/scaffold.ts
Stats: 3 files changed, 100 insertions(+), 8 deletions(-)

### 45e723745534416920a0c0b168fecbf21be0dc1f
feat: three.js and React starter templates
Files: .changeset/config.json, packages/create-three-flatland/templates/react/_gitignore, packages/create-three-flatland/templates/react/index.html, packages/create-three-flatland/templates/react/package.json, packages/create-three-flatland/templates/react/public/sprite.svg, packages/create-three-flatland/templates/react/src/App.tsx, packages/create-three-flatland/templates/react/src/main.tsx, packages/create-three-flatland/templates/react/tsconfig.json, packages/create-three-flatland/templates/react/vite.config.ts, packages/create-three-flatland/templates/three/_gitignore, packages/create-three-flatland/templates/three/index.html, packages/create-three-flatland/templates/three/package.json, packages/create-three-flatland/templates/three/public/sprite.svg, packages/create-three-flatland/templates/three/src/main.ts, packages/create-three-flatland/templates/three/tsconfig.json, pnpm-workspace.yaml
Stats: 16 files changed, 4135 insertions(+), 1 deletion(-)

### 32ae0eac57eab9791e5e4ccf15a206e432452d27
feat: scaffolder CLI with create-vite-compatible flags
Files: .changeset/create-three-flatland-initial.md, packages/create-three-flatland/package.json, packages/create-three-flatland/src/index.ts, packages/create-three-flatland/src/scaffold.test.ts, packages/create-three-flatland/src/scaffold.ts, packages/create-three-flatland/tsconfig.json, packages/create-three-flatland/tsdown.config.ts
Stats: 7 files changed, 555 insertions(+)
