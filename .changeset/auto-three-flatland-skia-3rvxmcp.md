---
"@three-flatland/skia": patch
---

> Branch: fix/dissolve-instant-vanish
> PR: https://github.com/thejustinwalsh/three-flatland/pull/158

## Bug Fixes

- Fixed intermittent WASM toolchain download failures ("No release asset found ... Available: none") during skia builds on CI
  - Cause: unauthenticated GitHub API calls in `setup.mjs` hit the 60/hr rate limit on shared CI runner IPs; the size job was hit hardest since it has no `skia-tools` cache to fall back on
  - `setup.mjs` now authenticates its GitHub releases API requests with `GITHUB_TOKEN` when available, raising the cap to 5,000/hr; token is passed via curl argv, never the shell, to avoid leaking into logs
  - `build.yml` and `size.yml` now pass `GITHUB_TOKEN` through to the build step
  - Error output now surfaces the GitHub API's actual message instead of hiding a rate-limit response behind "Available: none"
  - Local behavior unchanged when no token is set

CI-only reliability fix for the skia WASM toolchain setup; no changes to published package behavior.
