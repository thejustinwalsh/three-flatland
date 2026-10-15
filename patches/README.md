# Dependency security patches

## http-cache-semantics 4.3.0

The local patch addresses [GHSA-ch52-4w7c-c8xp](https://github.com/advisories/GHSA-ch52-4w7c-c8xp).
Unpatched 4.2.0 and 4.3.0 both reproduce the reported shared-cache disclosure: a client can use
`max-stale` to reuse a cookie-bearing entry whose freshness was zeroed for security reasons.
The 4.3.0 advisory range alone does not establish a fix.

The patch requires origin validation for security-blocked policies across `max-stale`,
`stale-while-revalidate` and `stale-if-error`. It also checks request matching before error fallback.
Explicit public caching and private caches retain their intentional stale-response behavior.
The regression suite covers new and serialized cache entries, authentication, response directives,
cookies, Vary matching and legitimate stale reuse.

Run `pnpm nx run scripts:security-regressions` after installation. These tests also run in
`scripts:test`. Remove this patch only after a verified upstream release passes the same cases
without it; a green version-based audit is insufficient evidence.

## fast-glob 3.3.3 and starlight-llms-txt 0.11.0

These patches remove the `micromatch → braces` path reported by
[GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).
Matching uses Picomatch 4. The existing fast-glob traversal and public API remain intact, while
brace expansion uses the maintained brace-expansion 5 engine. Workspace package extensions
declare those dependencies, and overrides remove the replaced dependency edges.

The expansion adapter preserves escapes and duplicate handling. It rejects inputs over 4,096
characters, nesting over 100 levels and more than 1,000 expansions. It detects the engine's
truncation and fails explicitly rather than silently omitting matches. Tests cover ranges,
nested/empty alternatives, escaped braces, exclusions, dotfiles, async/stream traversal and
oversized inputs in subprocesses with memory/time limits. The docs matching contract is also
covered by `scripts:security-regressions`; the docs build verifies the real generator.
