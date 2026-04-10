/**
 * lefthook check: verify the Skia submodule ref matches the pinned commit.
 * Rejects commit if the submodule is staged at any revision other than the pin.
 *
 * No silent pass-throughs — if this script runs, it must verify or reject.
 */

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname!, "..");

// Read the pinned commit — reject if missing
const pkg = JSON.parse(readFileSync(resolve(ROOT, "packages/skia/package.json"), "utf-8"));
const pinned = pkg.skiaDependencies?.skia?.commit;
const branch = pkg.skiaDependencies?.skia?.branch || "";

if (!pinned) {
  console.error(`\x1b[31m✗ No skiaDependencies.skia.commit in packages/skia/package.json\x1b[0m`);
  process.exit(1);
}

// Read the staged submodule commit — reject if unparseable
const diff = execSync("git diff --cached --submodule=short packages/skia/third_party/skia", {
  cwd: ROOT,
  encoding: "utf-8",
});

const match = diff.match(/\+Subproject commit ([a-f0-9]+)/);
if (!match) {
  console.error(`\x1b[31m✗ Could not determine staged Skia submodule commit\x1b[0m`);
  process.exit(1);
}

// Verify match — only exact match passes
const staged = match[1];
if (staged !== pinned) {
  console.error(`\x1b[31m✗ Skia submodule commit doesn't match pin!\x1b[0m`);
  console.error(`  staged: ${staged}`);
  console.error(`  pinned: ${pinned} (${branch})`);
  console.error(`\n  Update skiaDependencies.skia.commit in packages/skia/package.json`);
  process.exit(1);
}
