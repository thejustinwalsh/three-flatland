#!/usr/bin/env bash
set -euo pipefail

# Setup script for Skia build dependencies and source extraction.
#
# This script:
#   1. Checks prerequisites (Python 3, C compiler)
#   2. Fetches gn and ninja via Skia's own fetch scripts
#   3. Syncs only the Skia third-party deps we need (freetype, harfbuzz, expat, abseil-cpp)
#   4. Runs GN to generate build files with our feature flags
#   5. Exports compile_commands.json via ninja
#   6. Runs parse_compile_commands.py to generate skia_sources.zig
#
# Usage:
#   ./scripts/setup-skia.sh                  # Full setup
#   ./scripts/setup-skia.sh --deps-only      # Only sync Skia deps (steps 1-3)
#   ./scripts/setup-skia.sh --extract-only   # Only GN + extraction (steps 4-6, deps already synced)
#
# Prerequisites:
#   - Git
#   - Python 3
#   - A C/C++ compiler (cc/gcc/clang) — needed by GN's detection scripts
#   - Skia submodule cloned at third_party/skia/

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PKG_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SKIA_DIR="$PKG_ROOT/third_party/skia"

# ── Colors ──
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info()  { echo -e "${BLUE}[info]${NC}  $*"; }
ok()    { echo -e "${GREEN}[ok]${NC}    $*"; }
warn()  { echo -e "${YELLOW}[warn]${NC}  $*"; }
error() { echo -e "${RED}[error]${NC} $*" >&2; }

# ── Parse args ──
DEPS_ONLY=false
EXTRACT_ONLY=false

for arg in "$@"; do
  case "$arg" in
    --deps-only)    DEPS_ONLY=true ;;
    --extract-only) EXTRACT_ONLY=true ;;
    --help|-h)
      echo "Usage: $0 [--deps-only | --extract-only]"
      echo ""
      echo "  --deps-only      Only sync Skia third-party deps"
      echo "  --extract-only   Only run GN + source extraction (deps already synced)"
      exit 0
      ;;
    *)
      error "Unknown argument: $arg"
      exit 1
      ;;
  esac
done

# ── Preflight checks ──

echo ""
echo "=== three-flatland/skia — Skia Build Setup ==="
echo ""
info "Checking prerequisites..."

# Skia submodule
if [ ! -d "$SKIA_DIR/.git" ] && [ ! -f "$SKIA_DIR/.git" ]; then
  error "Skia submodule not found at $SKIA_DIR"
  echo ""
  echo "  Run from the repo root:"
  echo "    git submodule add --depth 1 https://github.com/google/skia.git packages/skia/third_party/skia"
  echo ""
  echo "  Or if already added:"
  echo "    git submodule update --init --depth 1 packages/skia/third_party/skia"
  exit 1
fi
ok "Skia submodule found"

# Python 3
if ! command -v python3 &>/dev/null; then
  error "Python 3 is required but not found in PATH"
  echo ""
  echo "  Install:"
  echo "    Ubuntu/Debian: sudo apt install python3"
  echo "    macOS:         brew install python3"
  exit 1
fi
ok "Python 3: $(python3 --version 2>&1)"

# C compiler (needed by GN's is_clang.py detection)
CC_CMD=""
for cc_candidate in cc gcc clang; do
  if command -v "$cc_candidate" &>/dev/null; then
    CC_CMD="$cc_candidate"
    break
  fi
done

if [ -z "$CC_CMD" ]; then
  error "No C compiler found (cc, gcc, or clang)"
  echo ""
  echo "  GN requires a C compiler for build detection. Install one:"
  echo "    Ubuntu/Debian: sudo apt install build-essential"
  echo "    macOS:         xcode-select --install"
  exit 1
fi
ok "C compiler: $CC_CMD ($($CC_CMD --version 2>&1 | head -1))"

echo ""

# ── Step 1: Fetch gn and ninja via Skia's scripts ──
fetch_build_tools() {
  info "Fetching build tools (gn + ninja) via Skia's fetch scripts..."

  (cd "$SKIA_DIR" && python3 bin/fetch-gn) 2>&1 | sed 's/^/  /'
  if [ ! -x "$SKIA_DIR/bin/gn" ]; then
    error "Failed to fetch gn"
    exit 1
  fi
  ok "gn: $("$SKIA_DIR/bin/gn" --version 2>&1)"

  (cd "$SKIA_DIR" && python3 bin/fetch-ninja) 2>&1 | sed 's/^/  /'
  # ninja lands in third_party/ninja/ninja
  local ninja_bin="$SKIA_DIR/third_party/ninja/ninja"
  if [ ! -x "$ninja_bin" ]; then
    # Some versions put it elsewhere, try to find it
    ninja_bin=$(find "$SKIA_DIR/third_party/ninja" -name "ninja" -type f 2>/dev/null | head -1)
  fi
  if [ -z "$ninja_bin" ] || [ ! -x "$ninja_bin" ]; then
    error "Failed to fetch ninja"
    exit 1
  fi
  ok "ninja: $($ninja_bin --version 2>&1)"

  # Export for use in later steps
  export GN_BIN="$SKIA_DIR/bin/gn"
  export NINJA_BIN="$ninja_bin"
}

# ── Step 2: Sync Skia's vendored third-party deps ──
sync_skia_deps() {
  info "Syncing Skia third-party dependencies..."
  info "Using targeted sync (only freetype, harfbuzz, expat, abseil-cpp)"
  echo ""

  "$SCRIPT_DIR/sync-skia-deps.sh"
}

# ── Step 3: Run GN to generate build configuration ──

# Ensure stub emscripten tools exist (GN needs them for WASM toolchain
# detection, but we compile with Zig, not Emscripten)
ensure_emscripten_stubs() {
  local emsdk_bin="$SKIA_DIR/third_party/externals/emsdk/upstream/emscripten"
  mkdir -p "$emsdk_bin/cache/sysroot/include"
  for tool in emcc em++ emar; do
    if [ ! -x "$emsdk_bin/$tool" ]; then
      printf '#!/bin/sh\nexec cc "$@" 2>/dev/null || true\n' > "$emsdk_bin/$tool"
      chmod +x "$emsdk_bin/$tool"
    fi
  done
}

# Shared GN args for both variants
GN_SHARED_ARGS='
    is_official_build=true
    is_debug=false
    target_cpu="wasm"
    skia_use_freetype=true
    skia_use_system_freetype=false
    skia_use_harfbuzz=true
    skia_use_system_harfbuzz=false
    skia_enable_skshaper=true
    skia_enable_svg=true
    skia_use_expat=true
    skia_use_system_expat=false
    skia_enable_pdf=false
    skia_enable_skottie=false
    skia_enable_skparagraph=false
    skia_use_icu=false
    skia_use_client_icu=false
    skia_use_libpng=false
    skia_use_libjpeg_turbo=false
    skia_use_libwebp=false
    skia_use_libavif=false
    skia_use_zlib=false
'

run_gn() {
  info "Running GN to generate build files..."

  ensure_emscripten_stubs

  # ── Variant 1: WebGL (Ganesh) ──
  (cd "$SKIA_DIR" && "$GN_BIN" gen out/wasm --args="
    $GN_SHARED_ARGS
    skia_enable_ganesh=true
    skia_enable_graphite=false
    skia_use_gl=true
    skia_use_webgl=true
    skia_gl_standard=\"webgl\"
    skia_use_dawn=false
  ")
  ok "GN build files generated at out/wasm/ (GL variant)"

  # ── Variant 2: WebGPU (Graphite + Dawn) ──
  (cd "$SKIA_DIR" && "$GN_BIN" gen out/wasm-webgpu --args="
    $GN_SHARED_ARGS
    skia_enable_ganesh=false
    skia_enable_graphite=true
    skia_use_gl=false
    skia_use_webgl=false
    skia_use_dawn=true
    skia_use_webgpu=true
  ")
  ok "GN build files generated at out/wasm-webgpu/ (WebGPU variant)"
}

# ── Step 4: Export compile_commands.json ──
export_compile_commands() {
  info "Exporting compilation databases..."

  # GL variant
  (cd "$SKIA_DIR" && "$NINJA_BIN" -C out/wasm -t compdb > compile_commands.json)
  local count_gl
  count_gl=$(python3 -c "import json; print(len(json.load(open('$SKIA_DIR/compile_commands.json'))))")
  ok "compile_commands.json exported ($count_gl entries, GL variant)"

  # WebGPU variant
  (cd "$SKIA_DIR" && "$NINJA_BIN" -C out/wasm-webgpu -t compdb > compile_commands_webgpu.json)
  local count_wgpu
  count_wgpu=$(python3 -c "import json; print(len(json.load(open('$SKIA_DIR/compile_commands_webgpu.json'))))")
  ok "compile_commands_webgpu.json exported ($count_wgpu entries, WebGPU variant)"
}

# ── Step 5: Generate skia_sources.zig ──
generate_sources_zig() {
  info "Generating skia_sources.zig from both compile_commands..."

  python3 "$PKG_ROOT/scripts/parse_compile_commands.py" \
    --gl "$SKIA_DIR/compile_commands.json" \
    --wgpu "$SKIA_DIR/compile_commands_webgpu.json"

  ok "skia_sources.zig generated (shared + GL + WebGPU)"
}

# ── Run ──

fetch_build_tools

if [ "$EXTRACT_ONLY" = false ]; then
  sync_skia_deps
fi

# Apply patches (always — idempotent)
info "Applying Skia patches..."
"$SCRIPT_DIR/patch-skia.sh"

# Generate WebGPU shim headers and WIT from Dawn's code generator
info "Generating WebGPU shim headers..."
python3 "$SCRIPT_DIR/generate-wgpu-shim.py"
info "Generating WebGPU WIT interface..."
python3 "$SCRIPT_DIR/generate-wgpu-wit.py"

if [ "$DEPS_ONLY" = true ]; then
  echo ""
  ok "Done (deps only). Run with --extract-only next to generate source lists."
  exit 0
fi

echo ""
run_gn
export_compile_commands
generate_sources_zig

echo ""
ok "Skia source setup complete"
echo "  Generated: packages/skia/src/zig/generated/skia_sources.zig"
echo ""
