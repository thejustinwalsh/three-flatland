#!/usr/bin/env node

/**
 * Skia WASM build — single setup & build orchestrator.
 *
 * Reads tool versions from package.json "skia" section.
 * Downloads tools to .tools/bin/ (gitignored, local to package).
 * Runs the full pipeline: submodule → deps → patches → GN → zig → wasm-opt → dist.
 *
 * Usage:
 *   node scripts/setup.mjs              # Full setup + build
 *   node scripts/setup.mjs --check      # Check prerequisites only
 *   node scripts/setup.mjs --tools      # Install/update tools only
 *   node scripts/setup.mjs --build      # Build only (skip setup)
 *   node scripts/setup.mjs --ensure     # Idempotent: setup + build, skip steps already done
 *   node scripts/setup.mjs --gl-only    # Build GL variant only
 *   node scripts/setup.mjs --wgpu-only  # Build WebGPU variant only
 */

import { execSync, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, chmodSync, cpSync, rmSync } from "node:fs";
import { resolve, dirname, delimiter } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { canBuildWasm } from "./host-capability.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(__dirname, "..");
const TOOLS_DIR = resolve(PKG_ROOT, ".tools");
const TOOLS_BIN = resolve(TOOLS_DIR, "bin");
const TOOLS_LIB = resolve(TOOLS_DIR, "lib");
const SKIA_DIR = resolve(PKG_ROOT, "third_party/skia");

// ── Colors ──

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
};

const ok = (msg) => console.log(`  ${C.green}✓${C.reset} ${msg}`);
const info = (msg) => console.log(`  ${C.blue}→${C.reset} ${msg}`);
const warn = (msg) => console.log(`  ${C.yellow}⚠${C.reset} ${msg}`);
const fail = (msg) => console.log(`  ${C.red}✗${C.reset} ${msg}`);
const heading = (msg) => console.log(`\n${C.bold}${C.cyan}── ${msg} ──${C.reset}\n`);

// ── Config from package.json ──

function loadConfig() {
  const pkg = JSON.parse(readFileSync(resolve(PKG_ROOT, "package.json"), "utf-8"));
  if (!pkg.skiaDependencies) throw new Error("Missing 'skiaDependencies' section in package.json");
  return pkg.skiaDependencies;
}

// ── Platform detection ──

function getPlatform() {
  const os = process.platform;
  const arch = process.arch;

  const platform = os === "darwin" ? "macos" : os === "linux" ? "linux" : null;
  if (!platform) {
    fail(`Unsupported OS: ${os}`);
    process.exit(1);
  }

  // Canonical arch slugs vary by project
  const archSlug = arch === "arm64" ? "aarch64" : arch === "x64" ? "x86_64" : null;
  if (!archSlug) {
    fail(`Unsupported architecture: ${arch}`);
    process.exit(1);
  }

  return { platform, arch: archSlug };
}

// ── Shell helpers ──

function run(cmd, opts = {}) {
  try {
    return execSync(cmd, {
      stdio: opts.silent ? "pipe" : "inherit",
      cwd: opts.cwd || PKG_ROOT,
      env: { ...process.env, PATH: `${TOOLS_BIN}${delimiter}${process.env.PATH}` },
      ...opts,
    });
  } catch (e) {
    if (opts.silent) return null;
    throw e;
  }
}

function which(name) {
  try {
    const p = execSync(`which ${name}`, { stdio: "pipe", env: { ...process.env, PATH: `${TOOLS_BIN}${delimiter}${process.env.PATH}` } });
    return p.toString().trim();
  } catch {
    return null;
  }
}

function getVersion(name) {
  try {
    const out = execSync(`${name} --version`, {
      stdio: "pipe",
      env: { ...process.env, PATH: `${TOOLS_BIN}${delimiter}${process.env.PATH}` },
    });
    return out.toString().trim();
  } catch {
    return null;
  }
}

// ── Download + verify ──

// Unauthenticated api.github.com requests are capped at 60/hr per IP, a limit
// routinely exhausted on shared CI runner IP pools — the API then answers 403
// with `{"message":"API rate limit exceeded"}` (no `assets` key), which reads
// downstream as "no release asset found ... Available: none". Authenticating
// with the token CI already has raises the cap to 5,000/hr and removes the
// flake; locally, with no token set, behaviour is unchanged (unauthenticated).
const GH_TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";

// Fetch a URL with curl, passing the GitHub token via argv (never the shell, so
// it can't leak into logs or process listings) when one is available.
function ghFetch(url) {
  const args = ["-sL"];
  if (GH_TOKEN) args.push("-H", `Authorization: Bearer ${GH_TOKEN}`);
  args.push(url);
  return execFileSync("curl", args, { stdio: "pipe" }).toString();
}

async function downloadGithubRelease(repo, version, binName, { archOverride, expectedSha256 } = {}) {
  const { platform, arch } = getPlatform();
  const effectiveArch = archOverride?.[arch] || arch;

  const displayVersion = version.replace(/^v/, "").replace(/^version_/, "");
  info(`Fetching ${binName} v${displayVersion} from ${repo}...`);

  // Get release asset URL
  const releaseUrl = `https://api.github.com/repos/${repo}/releases/tags/${version}`;
  const releaseJson = ghFetch(releaseUrl);
  let release;
  try {
    release = JSON.parse(releaseJson);
  } catch {
    // Try with 'v' prefix
    const releaseUrl2 = `https://api.github.com/repos/${repo}/releases/tags/v${version}`;
    release = JSON.parse(ghFetch(releaseUrl2));
  }

  if (!release.assets) {
    // Try version_ prefix (binaryen style)
    const releaseUrl3 = `https://api.github.com/repos/${repo}/releases/tags/version_${version}`;
    release = JSON.parse(ghFetch(releaseUrl3));
  }

  const asset = release.assets?.find(
    (a) =>
      a.name.includes(`${effectiveArch}-${platform}`) &&
      a.name.endsWith(".tar.gz") &&
      !a.name.endsWith(".sha256"),
  );

  if (!asset) {
    fail(`No release asset found for ${binName} ${version} (${platform}-${effectiveArch})`);
    console.log(
      `  Available: ${release.assets?.map((a) => a.name).join(", ") || "none"}`,
    );
    // A message with no assets means the API rejected the request (rate limit,
    // not found) rather than the tag genuinely lacking assets — surface it so
    // the real cause isn't hidden behind "Available: none".
    if (release.message) {
      console.log(`  GitHub API: ${release.message}${GH_TOKEN ? "" : " (requests are unauthenticated — set GITHUB_TOKEN)"}`);
    }
    return false;
  }

  // Download tarball to temp file for checksum verification
  const tmpDir = execSync("mktemp -d", { stdio: "pipe" }).toString().trim();
  const tarball = resolve(tmpDir, asset.name);
  info(`Downloading ${asset.name}...`);
  execSync(`curl -sL -o "${tarball}" "${asset.browser_download_url}"`, { stdio: "pipe" });

  // SHA256 verification
  if (expectedSha256) {
    const fileData = readFileSync(tarball);
    const actualHash = createHash("sha256").update(fileData).digest("hex");
    if (actualHash !== expectedSha256) {
      fail(`SHA256 mismatch for ${asset.name}!`);
      fail(`  expected: ${expectedSha256}`);
      fail(`  actual:   ${actualHash}`);
      rmSync(tmpDir, { recursive: true, force: true });
      return false;
    }
    ok(`SHA256 verified: ${actualHash.slice(0, 16)}...`);
  } else {
    warn(`No SHA256 checksum configured for ${binName} (${effectiveArch}-${platform})`);
  }

  // Extract
  execSync(`tar -xzf "${tarball}" -C "${tmpDir}"`, { stdio: "pipe" });

  // Find the binary
  const binPath = execSync(`find "${tmpDir}" -name "${binName}" -type f | head -1`, {
    stdio: "pipe",
  })
    .toString()
    .trim();

  if (!binPath) {
    fail(`Binary '${binName}' not found in archive`);
    rmSync(tmpDir, { recursive: true, force: true });
    return false;
  }

  // Install binary
  mkdirSync(TOOLS_BIN, { recursive: true });
  cpSync(binPath, resolve(TOOLS_BIN, binName));
  chmodSync(resolve(TOOLS_BIN, binName), 0o755);

  // For binaryen: also copy shared library
  if (binName === "wasm-opt") {
    const libDir = execSync(
      `find "${tmpDir}" -name "libbinaryen*" -type f -print -quit 2>/dev/null | xargs dirname 2>/dev/null`,
      { stdio: "pipe" },
    )
      .toString()
      .trim();

    if (libDir && existsSync(libDir)) {
      mkdirSync(TOOLS_LIB, { recursive: true });
      const libs = execSync(`ls "${libDir}"/libbinaryen*`, { stdio: "pipe" })
        .toString()
        .trim()
        .split("\n");
      for (const lib of libs) {
        if (lib) cpSync(lib, resolve(TOOLS_LIB, lib.split("/").pop()));
      }
    }
  }

  rmSync(tmpDir, { recursive: true, force: true });
  return true;
}

function verifyToolVersion(binName, expectedVersion) {
  const versionOut = getVersion(resolve(TOOLS_BIN, binName));
  if (!versionOut) return false;
  return versionOut.includes(expectedVersion);
}

// ── Prerequisites ──

function checkPrerequisites(config) {
  heading("Prerequisites");
  let allGood = true;

  // Git
  if (which("git")) {
    ok(`git: ${getVersion("git")?.split("\n")[0]}`);
  } else {
    fail("git not found");
    allGood = false;
  }

  // Python 3
  if (which("python3")) {
    ok(`python3: ${getVersion("python3")}`);
  } else {
    fail("python3 not found");
    info("Install: brew install python3 (macOS) / apt install python3 (Linux)");
    allGood = false;
  }

  // C compiler
  const cc = which("cc") || which("clang") || which("gcc");
  if (cc) {
    ok(`C compiler: ${cc}`);
  } else {
    fail("No C compiler found (cc, clang, or gcc)");
    info("Install: xcode-select --install (macOS) / apt install build-essential (Linux)");
    allGood = false;
  }

  // Zig — user's responsibility
  const zigPath = which("zig");
  let zigVersion = null;
  if (zigPath) {
    try {
      zigVersion = execSync("zig version", { stdio: "pipe" }).toString().trim();
    } catch {}
  }

  if (zigPath && zigVersion?.includes(config.zig)) {
    ok(`zig: ${zigVersion} (${zigPath})`);
  } else if (zigPath) {
    warn(`zig: ${zigVersion} (expected ${config.zig})`);
    info(`Update: https://ziglang.org/download/`);
    allGood = false;
  } else {
    fail(`zig not found (need ${config.zig})`);
    const { platform } = getPlatform();
    if (platform === "macos") {
      info("Install: brew install zig");
    } else {
      info(`Install: https://ziglang.org/download/`);
    }
    info(`Required version: ${config.zig}`);
    allGood = false;
  }

  return allGood;
}

// ── Tool installation ──

async function installTools(config) {
  heading("WASM Tools");

  mkdirSync(TOOLS_BIN, { recursive: true });

  const tools = config.tools;
  let allGood = true;

  const { platform, arch } = getPlatform();
  const platformKey = `${arch}-${platform}`;

  // Helper: resolve expected checksum for this platform
  const getChecksum = (toolConfig) => {
    if (!toolConfig.sha256) return undefined;
    // Try exact match, then binaryen's arm64 variant
    return toolConfig.sha256[platformKey] || toolConfig.sha256[platformKey.replace("aarch64", "arm64")];
  };

  // wasm-tools
  if (verifyToolVersion("wasm-tools", tools["wasm-tools"].version)) {
    ok(`wasm-tools: v${tools["wasm-tools"].version} (cached)`);
  } else {
    const success = await downloadGithubRelease(
      tools["wasm-tools"].repo,
      `v${tools["wasm-tools"].version}`,
      "wasm-tools",
      { expectedSha256: getChecksum(tools["wasm-tools"]) },
    );
    if (success && verifyToolVersion("wasm-tools", tools["wasm-tools"].version)) {
      ok(`wasm-tools: v${tools["wasm-tools"].version} (installed)`);
    } else {
      fail(`wasm-tools: failed to install v${tools["wasm-tools"].version}`);
      allGood = false;
    }
  }

  // wit-bindgen
  if (verifyToolVersion("wit-bindgen", tools["wit-bindgen"].version)) {
    ok(`wit-bindgen: v${tools["wit-bindgen"].version} (cached)`);
  } else {
    const success = await downloadGithubRelease(
      tools["wit-bindgen"].repo,
      `v${tools["wit-bindgen"].version}`,
      "wit-bindgen",
      { expectedSha256: getChecksum(tools["wit-bindgen"]) },
    );
    if (success && verifyToolVersion("wit-bindgen", tools["wit-bindgen"].version)) {
      ok(`wit-bindgen: v${tools["wit-bindgen"].version} (installed)`);
    } else {
      fail(`wit-bindgen: failed to install v${tools["wit-bindgen"].version}`);
      allGood = false;
    }
  }

  // wasm-opt (binaryen) — uses different naming conventions
  if (verifyToolVersion("wasm-opt", tools.binaryen.version)) {
    ok(`wasm-opt: v${tools.binaryen.version} (cached)`);
  } else {
    const success = await downloadGithubRelease(
      tools.binaryen.repo,
      `version_${tools.binaryen.version}`,
      "wasm-opt",
      {
        archOverride: { aarch64: "arm64" }, // binaryen uses arm64, not aarch64
        expectedSha256: getChecksum(tools.binaryen),
      },
    );
    if (success && verifyToolVersion("wasm-opt", tools.binaryen.version)) {
      ok(`wasm-opt: v${tools.binaryen.version} (installed)`);
    } else {
      fail(`wasm-opt: failed to install v${tools.binaryen.version}`);
      allGood = false;
    }
  }

  if (allGood) {
    info(`Tools installed to ${C.dim}.tools/bin/${C.reset}`);
  }

  return allGood;
}

// ── Skia submodule + setup ──

function setupSkia(config) {
  heading("Skia Source");

  // Check submodule
  if (!existsSync(resolve(SKIA_DIR, ".git")) && !existsSync(resolve(SKIA_DIR, "include"))) {
    info("Initializing Skia submodule (shallow clone)...");
    run("git submodule update --init --depth 1 packages/skia/third_party/skia", {
      cwd: resolve(PKG_ROOT, "../.."),
    });
  }

  if (!existsSync(resolve(SKIA_DIR, "include"))) {
    fail("Skia submodule not found at third_party/skia/");
    info("Run from repo root:");
    info("  git submodule add --depth 1 https://github.com/google/skia.git packages/skia/third_party/skia");
    return false;
  }

  // Verify Skia commit matches pinned version
  const expectedCommit = config.skia?.commit;
  const expectedBranch = config.skia?.branch;
  if (expectedCommit) {
    try {
      const actualCommit = execSync("git rev-parse HEAD", { stdio: "pipe", cwd: SKIA_DIR }).toString().trim();
      if (actualCommit === expectedCommit) {
        ok(`Skia: ${expectedBranch || ""} @ ${actualCommit.slice(0, 12)}`);
      } else {
        warn(`Skia: ${actualCommit.slice(0, 12)} (expected ${expectedBranch || ""} @ ${expectedCommit.slice(0, 12)})`);
        info("Run: cd third_party/skia && git fetch origin && git checkout " + expectedCommit.slice(0, 12));
      }
    } catch {
      warn("Could not verify Skia submodule commit");
    }
  } else {
    ok("Skia submodule present");
  }

  // Run setup-skia.sh (deps, patches, GN, source extraction)
  // The script is idempotent — it checks for existing deps/patches/GN output internally.
  info("Running Skia setup (deps, patches, GN, source extraction)...");
  console.log("");
  run("bash scripts/setup-skia.sh", { cwd: PKG_ROOT });

  return true;
}

// ── Build ──

function buildWasm(glOnly = false, wgpuOnly = false, skipIfFresh = false) {
  heading("WASM Build");

  const flagParts = [];
  if (glOnly) flagParts.push("--gl-only");
  if (wgpuOnly) flagParts.push("--wgpu-only");
  if (skipIfFresh) flagParts.push("--skip-if-fresh");
  const flags = flagParts.join(" ");
  const label = glOnly ? " (GL only)" : wgpuOnly ? " (WebGPU only)" : " (GL + WebGPU)";
  info(`Building Skia WASM${label}...`);
  console.log("");
  run(`node scripts/build-wasm.mjs ${flags}`, { cwd: PKG_ROOT });

  // Report output
  for (const variant of glOnly ? ["gl"] : wgpuOnly ? ["wgpu"] : ["gl", "wgpu"]) {
    const wasmPath = resolve(PKG_ROOT, `lib/skia-${variant}.wasm`);
    if (existsSync(wasmPath)) {
      const size = (readFileSync(wasmPath).byteLength / 1024).toFixed(0);
      ok(`lib/skia-${variant}.wasm (${size} KB)`);
    }
  }

  return true;
}

// ── Main ──

async function main() {
  // Always run from the package root, regardless of where the script is invoked
  process.chdir(PKG_ROOT);

  const args = process.argv.slice(2);
  const checkOnly = args.includes("--check");
  const toolsOnly = args.includes("--tools");
  const buildOnly = args.includes("--build");
  const ensure = args.includes("--ensure");
  const glOnly = args.includes("--gl-only");
  const wgpuOnly = args.includes("--wgpu-only");

  const config = loadConfig();

  // --ensure: quick check if everything is already built, exit early if so
  if (ensure) {
    const variants = glOnly ? ["gl"] : wgpuOnly ? ["wgpu"] : ["gl", "wgpu"];
    const allFresh = variants.every((v) =>
      existsSync(resolve(PKG_ROOT, `lib/skia-${v}.wasm`)),
    );
    if (allFresh) {
      // WASM exists — just verify tools + submodule are present (fast path)
      const hasZig = !!which("zig");
      const hasSubmodule = existsSync(resolve(SKIA_DIR, "include"));
      const hasTools = existsSync(resolve(TOOLS_BIN, "wasm-tools"));
      if (hasZig && hasSubmodule && hasTools) {
        return; // Everything is in place, nothing to do
      }
    }
  }

  console.log("");
  console.log(
    `${C.bold}${C.magenta}  ╔══════════════════════════════════════════╗${C.reset}`,
  );
  console.log(
    `${C.bold}${C.magenta}  ║    @three-flatland/skia — WASM Setup     ║${C.reset}`,
  );
  console.log(
    `${C.bold}${C.magenta}  ╚══════════════════════════════════════════╝${C.reset}`,
  );

  // 1. Prerequisites
  const prereqOk = checkPrerequisites(config);
  if (!prereqOk) {
    console.log("");
    fail("Missing prerequisites. Install them and re-run.");
    process.exit(1);
  }
  if (checkOnly) {
    console.log("");
    ok("All prerequisites met.");
    process.exit(0);
  }

  // 2. Tools
  const toolsOk = await installTools(config);
  if (!toolsOk) {
    console.log("");
    fail("Tool installation failed.");
    process.exit(1);
  }
  if (toolsOnly) {
    console.log("");
    ok("All tools installed.");
    process.exit(0);
  }

  // Host capability gate: with tools (incl. Zig) installed, can Zig link a
  // native binary here? macOS 26.4+/27 dropped the arm64 libSystem slice
  // (ziglang/zig#31658), so the submodule -> GN -> zig pipeline can't run here.
  // The compiled lib/*.wasm are COMMITTED to the repo (CI rebuilds + commits
  // them on skia changes), so on such a host we use the committed libs — we do
  // NOT fetch a remote prebuilt (that would overwrite the tracked libs and dirty
  // git history). If the libs are missing, fail — never fetch.
  if (!canBuildWasm()) {
    const variants = glOnly ? ["gl"] : wgpuOnly ? ["wgpu"] : ["gl", "wgpu"];
    const libsPresent = variants.every((v) =>
      existsSync(resolve(PKG_ROOT, `lib/skia-${v}.wasm`)),
    );
    if (libsPresent) {
      ok("Can't compile WASM on this host — using the committed lib/*.wasm (CI rebuilds on skia changes).");
      return;
    }
    fail("Committed skia lib/*.wasm are missing and this host can't compile them — restore them (git) or build on Linux/CI. NOT fetching a remote prebuilt.");
    process.exit(1);
  }

  // 3. Skia setup (submodule + deps + GN + source extraction)
  if (!buildOnly) {
    const skiaOk = setupSkia(config);
    if (!skiaOk) {
      process.exit(1);
    }
  }

  // 4. Build WASM
  buildWasm(glOnly, wgpuOnly, ensure);

  // Done
  heading("Done");
  ok("Skia WASM build complete!");
  info(`Test: ${C.dim}npx serve . -p 3333${C.reset} then open ${C.dim}http://localhost:3333/test/browser-test.html${C.reset}`);
  console.log("");
}

main().catch((e) => {
  fail(e.message);
  process.exit(1);
});
