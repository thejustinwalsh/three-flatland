#!/usr/bin/env node

/**
 * WASM build orchestration script.
 *
 * Full pipeline:
 *   1. wit-bindgen c  → generate C headers from WIT (if wit-bindgen available)
 *   2. zig build      → compile Skia C++ + Zig bindings to WASM
 *   3. wasm-opt -Oz   → size optimization (optional, if wasm-opt available)
 *   4. wasm-tools component new → wrap as WIT component
 *   5. jco transpile  → generate JS + .d.ts + .core.wasm
 *   6. jco types      → generate standalone TypeScript types from WIT
 *
 * Prerequisites:
 *   - Zig >= 0.14 in PATH
 *   - wasm-tools in PATH
 *   - jco: pnpm add -D @bytecodealliance/jco
 *
 * Optional:
 *   - wasm-opt (binaryen) for size optimization
 *   - wit-bindgen for regenerating C headers from WIT
 *
 * Install all tools:
 *   ./scripts/install-zig.sh
 *   ./scripts/install-wasm-tools.sh
 *
 * Usage:
 *   node scripts/build-wasm.mjs              # Build all variants
 *   node scripts/build-wasm.mjs --gl-only    # Build GL variant only
 *   node scripts/build-wasm.mjs --skip-if-fresh  # Skip if dist/ artifacts exist
 *   node scripts/build-wasm.mjs --wit-only   # Only regenerate WIT bindings + types
 */

import { execSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(__dirname, "..");
const DIST = resolve(PKG_ROOT, "dist");

const args = process.argv.slice(2);
const glOnly = args.includes("--gl-only");
const skipIfFresh = args.includes("--skip-if-fresh");
const witOnly = args.includes("--wit-only");

/** Run a command, printing it first. */
function run(cmd, opts = {}) {
  console.log(`\n> ${cmd}`);
  execSync(cmd, { stdio: "inherit", cwd: PKG_ROOT, ...opts });
}

/** Check if a binary is available in PATH. */
function hasCommand(name) {
  try {
    execSync(`which ${name}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

// ── Resolve tool paths ──

// jco: prefer local devDependency, fall back to global
const jcoBin = resolve(PKG_ROOT, "node_modules/.bin/jco");
const jco = existsSync(jcoBin) ? jcoBin : hasCommand("jco") ? "jco" : null;

const witFile = resolve(PKG_ROOT, "wit/skia.wit");

// ── Step 1: WIT bindings ──

function generateWitBindings() {
  if (!existsSync(witFile)) {
    console.log("Skipping WIT bindings (wit/skia.wit not found).");
    return;
  }

  // Generate C headers for Zig @cImport
  if (hasCommand("wit-bindgen")) {
    console.log("\n=== Generating C bindings from WIT ===");
    const witDir = resolve(PKG_ROOT, "wit");
    run(`wit-bindgen c ${witDir} --world skia-gl --out-dir src/zig/bindings/generated/`);
  } else {
    console.log("wit-bindgen not in PATH — using committed C headers.");
  }

  // Generate standalone TypeScript types
  if (jco) {
    console.log("\n=== Generating TypeScript types from WIT ===");
    mkdirSync(resolve(DIST, "types"), { recursive: true });
    const witDir2 = resolve(PKG_ROOT, "wit");
    run(`${jco} types ${witDir2} --world-name skia-gl -o ${resolve(DIST, "types")}`);
  }
}

generateWitBindings();

if (witOnly) {
  console.log("\nWIT bindings generated (--wit-only).");
  process.exit(0);
}

// ── Pre-flight checks for full build ──

const required = ["zig", "wasm-tools"];
const missing = required.filter((cmd) => !hasCommand(cmd));

if (missing.length > 0) {
  console.error(`\nMissing required tools: ${missing.join(", ")}`);
  console.error("\nInstall them:");
  console.error("  ./scripts/install-zig.sh");
  console.error("  ./scripts/install-wasm-tools.sh");
  process.exit(1);
}

if (!jco) {
  console.error("\nMissing jco. Install: pnpm add -D @bytecodealliance/jco");
  process.exit(1);
}

const hasWasmOpt = hasCommand("wasm-opt");
if (!hasWasmOpt) {
  console.log("wasm-opt not found — skipping size optimization.");
}

// ── Skip check ──

if (skipIfFresh) {
  const glFresh = existsSync(resolve(DIST, "skia-gl/skia-gl.core.wasm"));
  const webgpuFresh =
    glOnly || existsSync(resolve(DIST, "skia-webgpu/skia-webgpu.core.wasm"));
  if (glFresh && webgpuFresh) {
    console.log("WASM artifacts are fresh, skipping build.");
    process.exit(0);
  }
}

// ── Ensure dist directories ──

for (const dir of ["skia-gl", "skia-webgpu"]) {
  mkdirSync(resolve(DIST, dir), { recursive: true });
}

// ── Build variants ──

const variants = glOnly ? ["gl"] : ["gl", "webgpu"];

for (const variant of variants) {
  const name = `skia-${variant}`;
  const wasmRaw = resolve(PKG_ROOT, `zig-out/bin/${name}.wasm`);
  const wasmOpt = resolve(DIST, `${name}/${name}.opt.wasm`);
  const wasmComponent = resolve(DIST, `${name}/${name}.component.wasm`);
  const outDir = resolve(DIST, `${name}`);

  console.log(`\n=== Building ${name} ===`);

  // Step 2: Zig build
  run(`zig build -Doptimize=ReleaseSmall`);

  if (!existsSync(wasmRaw)) {
    console.error(`Expected ${wasmRaw} but not found. Zig build may have failed.`);
    process.exit(1);
  }

  // Step 3: wasm-opt size optimization (optional)
  const wasmInput = hasWasmOpt ? wasmOpt : wasmRaw;
  if (hasWasmOpt) {
    run(`wasm-opt -Oz --strip-debug -o ${wasmOpt} ${wasmRaw}`);
  }

  // Step 4: Wrap as WIT component (with WASI preview1 adapter)
  const wasiAdapter = resolve(PKG_ROOT, "lib/wasi_snapshot_preview1.wasm");
  if (!existsSync(wasiAdapter)) {
    console.log("\n  Downloading WASI adapter...");
    mkdirSync(resolve(PKG_ROOT, "lib"), { recursive: true });
    run(
      `curl -sL https://github.com/bytecodealliance/wasmtime/releases/latest/download/wasi_snapshot_preview1.reactor.wasm -o ${wasiAdapter}`
    );
  }
  run(
    `wasm-tools component new ${wasmInput} --adapt ${wasiAdapter} -o ${wasmComponent}`
  );

  // Step 5: JCO transpile to JS + .d.ts + .core.wasm
  run(`${jco} transpile ${wasmComponent} -o ${outDir} --no-namespaced-exports`);
}

console.log("\nWASM build complete.");
