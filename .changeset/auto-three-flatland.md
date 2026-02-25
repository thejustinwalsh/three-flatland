---
"three-flatland": major
---

✗ Check package details from big refactor commit
  $ cd /home/runner/work/three-flatland/three-flatland && git --no-pager show 8bfc4ce --stat |
  head -20 && echo "---" && git --no-pager show 8bfc4ce:packages/three-flatland/src/index.ts
  2>/dev/null | head -30 && echo "---" && git --no-pager show
  8bfc4ce:packages/three-flatland/package.json 2>/dev/null | python3 -c "import sys,json;
  d=json.load(sys.stdin); print('name:', d.get('name')); print('version:', d.get('version')); ...
  Permission denied and could not request permission from user

✗ Check current package details
  $ cat /home/runner/work/three-flatland/three-flatland/packages/three-flatland/package.json |
  python3 -c "import sys,json; d=json.load(sys.stdin); print('name:', d.get('name'));
  print('version:', d.get('version')); [print('export:', k) for k in
  list(d.get('exports',{}).keys())]" 2>/dev/null; echo "---"; cat
  /home/runner/work/three-flatland/three-flatland/packages/three-flatland/src/index.ts ...
  Permission denied and could not request permission from user

● Read packages/three-flatland/package.json lines 1-50
  └ 50 lines read

● Read packages/three-flatland/src/index.ts
  └ 28 lines read

● Read packages/nodes/package.json lines 1-30
  └ 30 lines read

● Read packages/three-flatland/src/react.ts
  └ 11 lines read

Based on the commit analysis, here is the changelog entry:

---

- Merged `packages/core` and `packages/react` into single `three-flatland` package; old package names are gone
- Moved all TSL shader nodes from `@three-flatland/core` into standalone `@three-flatland/nodes` package
- Deleted `packages/core` and `packages/react`; source now lives in `packages/three-flatland`
- Added `source` condition to all package exports for direct TypeScript resolution in monorepo dev (no build required)
- Restructured React subpath — `three-flatland/react` now re-exports all of core; R3F users need only one import
- Organized React integration into per-category subpath modules (`/react/sprites`, `/react/animation`, etc.)
- Added `source` export condition to `@three-flatland/nodes` and `@three-flatland/presets` as well
- Added `LICENSE` and `README.md` to all three published packages
- Added GitHub Actions workflows: changeset automation, CI, and bundle size checks with size-limit
- Fixed environment detection in `measure.ts` to use correct production check
- Entered alpha prerelease; all packages publish as `0.1.0-alpha.0`

**BREAKING CHANGES**

- Package `@three-flatland/core` no longer exists; replace all imports with `three-flatland`
- Package `@three-flatland/react` no longer exists; replace with `three-flatland/react`
- TSL nodes previously in `@three-flatland/core` are now in `@three-flatland/nodes`

Initial alpha release consolidating the core and React packages into a single `three-flatland` package, with TSL shader nodes extracted into the dedicated `@three-flatland/nodes` package. All packages enter alpha prerelease versioning.
