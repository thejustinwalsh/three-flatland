---
"@three-flatland/skia": patch
---

> Branch: feat/esm-oxc-migration
> PR: https://github.com/thejustinwalsh/three-flatland/pull/196

- Fixed all real-source oxlint errors across the monorepo (0 errors remaining); `exhaustive-deps` kept as advisory warnings, matching prior eslint config
- Applied oxlint autofixes and reformatting (unused imports/vars removed, `import type` enforced, floating promises voided, useless spreads removed)
- Excluded e2e/spec test harnesses from lint scope (previously uncovered by eslint)
- No functional/API changes — internal code-quality and tooling cleanup only, verified via typecheck (45/45) and build (46/46)

No breaking changes.

Internal lint and code-quality cleanup as part of the ESM/oxlint migration; no user-facing behavior changes.
