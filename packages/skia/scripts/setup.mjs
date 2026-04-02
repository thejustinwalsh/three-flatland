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
 *   node scripts/setup.mjs --gl-only    # Build GL variant only (default, webgpu not yet implemented)
 */

import { execSync, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, chmodSync, cpSync, rmSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

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
      env: { ...process.env, PATH: `${TOOLS_BIN}:${process.env.PATH}` },
      ...opts,
    });
  } catch (e) {
    if (opts.silent) return null;
    throw e;
  }
}

function which(name) {
  try {
    const p = execSync(`which ${name}`, { stdio: "pipe", env: { ...process.env, PATH: `${TOOLS_BIN}:${process.env.PATH}` } });
    return p.toString().trim();
  } catch {
    return null;
  }
}

function getVersion(name) {
  try {
    const out = execSync(`${name} --version`, {
      stdio: "pipe",
      env: { ...process.env, PATH: `${TOOLS_BIN}:${process.env.PATH}` },
    });
    return out.toString().trim();
  } catch {
    return null;
  }
}

// ── Download + verify ──

async function downloadGithubRelease(repo, version, binName, { archOverride, expectedSha256 } = {}) {
  const { platform, arch } = getPlatform();
  const effectiveArch = archOverride?.[arch] || arch;

  const displayVersion = version.replace(/^v/, "").replace(/^version_/, "");
  info(`Fetching ${binName} v${displayVersion} from ${repo}...`);

  // Get release asset URL
  const releaseUrl = `https://api.github.com/repos/${repo}/releases/tags/${version}`;
  const releaseJson = execSync(`curl -sL "${releaseUrl}"`, { stdio: "pipe" }).toString();
  let release;
  try {
    release = JSON.parse(releaseJson);
  } catch {
    // Try with 'v' prefix
    const releaseUrl2 = `https://api.github.com/repos/${repo}/releases/tags/v${version}`;
    const releaseJson2 = execSync(`curl -sL "${releaseUrl2}"`, { stdio: "pipe" }).toString();
    release = JSON.parse(releaseJson2);
  }

  if (!release.assets) {
    // Try version_ prefix (binaryen style)
    const releaseUrl3 = `https://api.github.com/repos/${repo}/releases/tags/version_${version}`;
    const releaseJson3 = execSync(`curl -sL "${releaseUrl3}"`, { stdio: "pipe" }).toString();
    release = JSON.parse(releaseJson3);
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
  info("Running Skia setup (deps, patches, GN, source extraction)...");
  console.log("");
  run("bash scripts/setup-skia.sh", { cwd: PKG_ROOT });

  return true;
}

// ── Build ──

function buildWasm(glOnly = true) {
  heading("WASM Build");

  const flags = glOnly ? "--gl-only" : "";
  info(`Building Skia WASM${glOnly ? " (GL only)" : ""}...`);
  console.log("");
  run(`node scripts/build-wasm.mjs ${flags}`, { cwd: PKG_ROOT });

  // Report output
  const wasmPath = resolve(PKG_ROOT, "dist/skia-gl/skia-gl.wasm");
  if (existsSync(wasmPath)) {
    const size = (readFileSync(wasmPath).byteLength / 1024).toFixed(0);
    ok(`dist/skia-gl/skia-gl.wasm (${size} KB)`);
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
  const glOnly = !args.includes("--all"); // default to GL-only

  console.log("");
  console.log(
    `${C.bold}${C.magenta}  ╔══════════════════════════════════════════╗${C.reset}`,
  );
  console.log(
    `${C.bold}${C.magenta}  ║   @three-flatland/skia — WASM Setup     ║${C.reset}`,
  );
  console.log(
    `${C.bold}${C.magenta}  ╚══════════════════════════════════════════╝${C.reset}`,
  );

  const config = loadConfig();

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

  // 3. Skia setup
  if (!buildOnly) {
    const skiaOk = setupSkia(config);
    if (!skiaOk) {
      process.exit(1);
    }
  }

  // 4. Build
  buildWasm(glOnly);

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
