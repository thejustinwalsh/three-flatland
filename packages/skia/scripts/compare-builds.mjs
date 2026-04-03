#!/usr/bin/env node

/**
 * Compare @three-flatland/skia against CanvasKit.
 * Fetches canvaskit-wasm from npm (cached in .tools/), builds our WASM,
 * and produces a size comparison table.
 */

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(__dirname, "..");
const TOOLS_DIR = resolve(PKG_ROOT, ".tools");
const TOOLS_BIN = resolve(TOOLS_DIR, "bin");
const env = { ...process.env, PATH: `${TOOLS_BIN}:${process.env.PATH}` };

process.chdir(PKG_ROOT);

const C = {
  reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
  cyan: "\x1b[36m", green: "\x1b[32m", yellow: "\x1b[33m",
};

function run(cmd) {
  return execSync(cmd, { cwd: PKG_ROOT, stdio: "pipe", env, maxBuffer: 50 * 1024 * 1024 });
}

function kb(bytes) { return (bytes / 1024).toFixed(0); }
function mb(bytes) { return (bytes / 1024 / 1024).toFixed(1); }
function pct(a, b) { return ((1 - a / b) * 100).toFixed(0); }
function frac(a, b) { return (a / b).toFixed(2); }

// ── Fetch CanvasKit ──

async function getCanvasKit() {
  mkdirSync(TOOLS_DIR, { recursive: true });

  // Get latest version from npm
  const registryJson = run("curl -sL https://registry.npmjs.org/canvaskit-wasm/latest").toString();
  const version = JSON.parse(registryJson).version;
  const cached = resolve(TOOLS_DIR, `canvaskit-${version}.wasm`);

  if (existsSync(cached)) {
    console.log(`  ${C.green}✓${C.reset} CanvasKit ${version} (cached)`);
  } else {
    process.stdout.write(`  ${C.cyan}→${C.reset} Downloading CanvasKit ${version}...`);
    run(`curl -sL "https://unpkg.com/canvaskit-wasm@${version}/bin/canvaskit.wasm" -o "${cached}"`);
    console.log(" done");
  }

  const raw = readFileSync(cached);
  const gz = run(`gzip -c "${cached}"`);
  const br = run(`brotli -c "${cached}"`);

  return { name: `CanvasKit ${version}`, rawSize: raw.byteLength, gzSize: gz.byteLength, brSize: br.byteLength };
}

// ── Build ours ──

function buildOurs() {
  process.stdout.write(`  ${C.cyan}→${C.reset} Building @three-flatland/skia...`);
  run("node scripts/build-wasm.mjs --gl-only");
  console.log(" done");

  const wasm = resolve(PKG_ROOT, "dist/skia-gl/skia-gl.wasm");
  const raw = readFileSync(wasm);
  const gz = run(`gzip -c "${wasm}"`);
  const br = run(`brotli -c "${wasm}"`);
  const simd = run(`wasm-tools print "${wasm}" 2>/dev/null | grep -c 'v128'`).toString().trim();

  return { name: "@three-flatland/skia", rawSize: raw.byteLength, gzSize: gz.byteLength, brSize: br.byteLength, simd: parseInt(simd) };
}

// ── Main ──

async function main() {
  console.log(`\n  ${C.bold}${C.cyan}Skia WASM Size Comparison${C.reset}\n`);

  const ck = await getCanvasKit();
  const ours = buildOurs();

  // Table
  console.log(`
  ${C.bold}┌─────────────────────────┬────────────┬────────────┬────────────┐${C.reset}
  ${C.bold}│ Build                   │ Unpacked   │ Gzipped    │ Brotli     │${C.reset}
  ${C.bold}├─────────────────────────┼────────────┼────────────┼────────────┤${C.reset}
  │ ${ck.name.padEnd(23)} │ ${(mb(ck.rawSize) + " MB").padStart(10)} │ ${(kb(ck.gzSize) + " KB").padStart(10)} │ ${(kb(ck.brSize) + " KB").padStart(10)} │
  │ ${ours.name.padEnd(23)} │ ${(mb(ours.rawSize) + " MB").padStart(10)} │ ${(kb(ours.gzSize) + " KB").padStart(10)} │ ${(kb(ours.brSize) + " KB").padStart(10)} │
  ${C.bold}├─────────────────────────┼────────────┼────────────┼────────────┤${C.reset}
  │ ${C.green}Savings${C.reset}                 │ ${(pct(ours.rawSize, ck.rawSize) + "%").padStart(10)} │ ${(pct(ours.gzSize, ck.gzSize) + "%").padStart(10)} │ ${(pct(ours.brSize, ck.brSize) + "%").padStart(10)} │
  │ ${C.green}Fraction${C.reset}                │ ${(frac(ours.rawSize, ck.rawSize) + "x").padStart(10)} │ ${(frac(ours.gzSize, ck.gzSize) + "x").padStart(10)} │ ${(frac(ours.brSize, ck.brSize) + "x").padStart(10)} │
  ${C.bold}└─────────────────────────┴────────────┴────────────┴────────────┘${C.reset}

  ${C.dim}SIMD instructions: ${ours.simd.toLocaleString()} v128 ops${C.reset}
  ${C.dim}CanvasKit ships with SIMD disabled${C.reset}
`);
}

main().catch(e => { console.error(e); process.exit(1); });
