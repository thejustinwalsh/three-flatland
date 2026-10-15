---
"create-three-flatland": patch
"docs": patch
"starlight-theme": patch
"@three-flatland/vscode": patch
"@three-flatland/ecs-bench": patch
---

Update generated starters and workspace tests to Vitest 4, retaining Vite 7 compatibility.
Update the documentation/image toolchain and CSS selector parser to fixed releases.
Refresh compatible transitive security dependencies, replace Changesets' legacy glob/YAML
dependency chains with its maintained implementation, and explicitly preserve private-package
versioning for the extension and support workspaces.
Preserve the release action's publication-detection contract through a tested structured-output
adapter, without changing release gates or publishing during validation.

Patch the shared HTTP cache policy so client stale directives cannot reuse responses blocked
by authentication, cookies or cache-control directives. Verify the fix with security regressions
while preserving deliberate public/private caching behavior. No audit findings are suppressed.
