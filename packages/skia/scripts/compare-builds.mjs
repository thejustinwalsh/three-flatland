#!/usr/bin/env node

/**
 * Compare @three-flatland/skia (GL + WebGPU) against CanvasKit.
 * Fetches canvaskit-wasm from npm (cached in .tools/), builds our WASM,
 * and produces a size comparison table.
 */

import { execSync } from "node:child_process";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(__dirname, "..");
const TOOLS_DIR = resolve(PKG_ROOT, ".tools");
const TOOLS_BIN = resolve(TOOLS_DIR, "bin");
const env = {
  ...process.env,
  PATH: `${TOOLS_BIN}:${process.env.PATH}`,
  ...(process.env.WSL_DISTRO_NAME && !process.env.ZIG_LOCAL_CACHE_DIR
    ? { ZIG_LOCAL_CACHE_DIR: `/tmp/skia-zig-cache`, ZIG_GLOBAL_CACHE_DIR: `/tmp/skia-zig-global-cache` }
    : {}),
};

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

// ── Measure a WASM variant ──

function measureVariant(name, wasmPath) {
  if (!existsSync(wasmPath)) return null;

  const raw = readFileSync(wasmPath);
  const gz = run(`gzip -c "${wasmPath}"`);
  const br = run(`brotli -c "${wasmPath}"`);

  let simd = 0;
  try {
    simd = parseInt(run(`wasm-tools print "${wasmPath}" 2>/dev/null | grep -c 'v128'`).toString().trim());
  } catch { /* wasm-tools may not be available */ }

  return { name, rawSize: raw.byteLength, gzSize: gz.byteLength, brSize: br.byteLength, simd };
}

// ── Build ours ──

function buildOurs() {
  process.stdout.write(`  ${C.cyan}→${C.reset} Building @three-flatland/skia (GL + WebGPU)...`);
  run("node scripts/build-wasm.mjs");
  console.log(" done");

  return {
    gl: measureVariant("skia (GL)", resolve(PKG_ROOT, "dist/skia-gl/skia-gl.wasm")),
    wgpu: measureVariant("skia (WebGPU)", resolve(PKG_ROOT, "dist/skia-wgpu/skia-wgpu.wasm")),
  };
}

// ── Table rendering ──

function row(label, entry, padName = 25) {
  return `  │ ${label.padEnd(padName)} │ ${(mb(entry.rawSize) + " MB").padStart(10)} │ ${(kb(entry.gzSize) + " KB").padStart(10)} │ ${(kb(entry.brSize) + " KB").padStart(10)} │`;
}

function savingsRow(label, entry, baseline, padName = 25) {
  return `  │ ${label.padEnd(padName)} │ ${(pct(entry.rawSize, baseline.rawSize) + "%").padStart(10)} │ ${(pct(entry.gzSize, baseline.gzSize) + "%").padStart(10)} │ ${(pct(entry.brSize, baseline.brSize) + "%").padStart(10)} │`;
}

// ── Main ──

async function main() {
  console.log(`\n  ${C.bold}${C.cyan}Skia WASM Size Comparison${C.reset}\n`);

  const ck = await getCanvasKit();
  const ours = buildOurs();

  const divider = `  ${C.bold}├─────────────────────────┼────────────┼────────────┼────────────┤${C.reset}`;

  console.log(`
  ${C.bold}┌─────────────────────────┬────────────┬────────────┬────────────┐${C.reset}
  ${C.bold}│ Build                   │ Unpacked   │ Gzipped    │ Brotli     │${C.reset}
${divider}
${row(ck.name, ck)}
${divider}`);

  if (ours.gl) {
    console.log(row(ours.gl.name, ours.gl));
  }
  if (ours.wgpu) {
    console.log(row(ours.wgpu.name, ours.wgpu));
  }

  console.log(divider);

  if (ours.gl) {
    console.log(savingsRow(`${C.green}GL vs CanvasKit${C.reset}`, ours.gl, ck));
  }
  if (ours.wgpu) {
    console.log(savingsRow(`${C.green}WebGPU vs CanvasKit${C.reset}`, ours.wgpu, ck));
  }

  console.log(`  ${C.bold}└─────────────────────────┴────────────┴────────────┴────────────┘${C.reset}`);

  // SIMD stats
  const simdEntries = [ours.gl, ours.wgpu].filter(Boolean);
  if (simdEntries.some(e => e.simd > 0)) {
    console.log();
    for (const e of simdEntries) {
      console.log(`  ${C.dim}${e.name}: ${e.simd.toLocaleString()} SIMD (v128) ops${C.reset}`);
    }
    console.log(`  ${C.dim}CanvasKit ships with SIMD disabled${C.reset}`);
  }

  console.log();
}

main().catch(e => { console.error(e); process.exit(1); });
