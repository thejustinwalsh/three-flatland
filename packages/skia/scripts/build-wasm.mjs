#!/usr/bin/env node

/**
 * WASM build orchestration script.
 *
 * Pipeline per variant:
 *   zig build → wasm-opt -Oz → wasm-tools component new → jco transpile
 *
 * Prerequisites:
 *   - Zig >= 0.13 in PATH
 *   - wasm-opt (binaryen) in PATH
 *   - wasm-tools in PATH
 *   - jco: npm install @bytecodealliance/jco
 *
 * Usage:
 *   node scripts/build-wasm.mjs              # Build all variants
 *   node scripts/build-wasm.mjs --gl-only    # Build GL variant only
 *   node scripts/build-wasm.mjs --skip-if-fresh  # Skip if dist/ artifacts exist
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

// ── Pre-flight checks ──

const required = ["zig", "wasm-opt", "wasm-tools"];
const missing = required.filter((cmd) => !hasCommand(cmd));

if (missing.length > 0) {
  console.error(`\nMissing required tools: ${missing.join(", ")}`);
  console.error("\nInstall them:");
  console.error("  zig       → https://ziglang.org/download/");
  console.error("  wasm-opt  → npm install -g binaryen  OR  https://github.com/WebAssembly/binaryen");
  console.error("  wasm-tools → cargo install wasm-tools");
  process.exit(1);
}

// jco can be a local devDependency
const jcoBin = resolve(PKG_ROOT, "node_modules/.bin/jco");
const hasJco = hasCommand("jco") || existsSync(jcoBin);
if (!hasJco) {
  console.error("\nMissing jco. Install: npm install @bytecodealliance/jco");
  process.exit(1);
}
const jco = existsSync(jcoBin) ? jcoBin : "jco";

// ── Skip check ──

if (skipIfFresh) {
  const glFresh = existsSync(resolve(DIST, "skia-gl/skia-gl.core.wasm"));
  const webgpuFresh = glOnly || existsSync(resolve(DIST, "skia-webgpu/skia-webgpu.core.wasm"));
  if (glFresh && webgpuFresh) {
    console.log("WASM artifacts are fresh, skipping build.");
    process.exit(0);
  }
}

// ── Ensure dist directories ──

for (const dir of ["skia-gl", "skia-webgpu", "types"]) {
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

  // Step 1: Zig build
  run(`zig build -Doptimize=ReleaseSmall`);

  if (!existsSync(wasmRaw)) {
    console.error(`Expected ${wasmRaw} but not found. Zig build may have failed.`);
    process.exit(1);
  }

  // Step 2: wasm-opt size optimization
  run(`wasm-opt -Oz --strip-debug -o ${wasmOpt} ${wasmRaw}`);

  // Step 3: Wrap as WIT component
  run(`wasm-tools component new ${wasmOpt} -o ${wasmComponent}`);

  // Step 4: JCO transpile to JS + .d.ts + .core.wasm
  run(`${jco} transpile ${wasmComponent} -o ${outDir} --no-namespaced-exports`);

  // Cleanup intermediate files
  // Keep .component.wasm for debugging, remove .opt.wasm
}

// ── Generate standalone types from WIT ──

const witFile = resolve(PKG_ROOT, "wit/skia.wit");
if (existsSync(witFile)) {
  console.log("\n=== Generating standalone types from WIT ===");
  run(`${jco} types ${witFile} -o ${resolve(DIST, "types")}`);
} else {
  console.log("\nSkipping type generation (wit/skia.wit not found yet).");
}

console.log("\nWASM build complete.");
