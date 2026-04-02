#!/usr/bin/env bash
set -euo pipefail

# Install wasm-tools and wit-bindgen for the current platform.
#
# Usage:
#   ./scripts/install-wasm-tools.sh
#
# Installs to $INSTALL_DIR (default: ~/.local/bin)

INSTALL_DIR="${INSTALL_DIR:-$HOME/.local/bin}"
mkdir -p "$INSTALL_DIR"

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

info()  { echo -e "${BLUE}[info]${NC}  $*"; }
ok()    { echo -e "${GREEN}[ok]${NC}    $*"; }
error() { echo -e "${RED}[error]${NC} $*" >&2; }

OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"

case "$OS" in
  linux)  PLATFORM="linux" ;;
  darwin) PLATFORM="macos" ;;
  *)      error "Unsupported OS: $OS"; exit 1 ;;
esac

case "$ARCH" in
  x86_64)       ARCH_SLUG="x86_64" ;;
  aarch64|arm64) ARCH_SLUG="aarch64" ;;
  *)             error "Unsupported architecture: $ARCH"; exit 1 ;;
esac

install_from_github() {
  local repo="$1"
  local bin_name="$2"

  if command -v "$bin_name" &>/dev/null; then
    ok "$bin_name already installed: $($bin_name --version 2>&1)"
    return
  fi

  info "Fetching latest $bin_name release..."
  local url
  url=$(curl -sL "https://api.github.com/repos/$repo/releases/latest" | python3 -c "
import json, sys
data = json.load(sys.stdin)
for asset in data['assets']:
    name = asset['name']
    if '${ARCH_SLUG}-${PLATFORM}' in name and name.endswith('.tar.gz'):
        print(asset['browser_download_url'])
        break
")

  if [ -z "$url" ]; then
    error "Could not find $bin_name release for $PLATFORM-$ARCH_SLUG"
    return 1
  fi

  local tmp_dir
  tmp_dir="$(mktemp -d)"
  info "Downloading $url..."
  curl -sL "$url" | tar -xz -C "$tmp_dir"

  # Find the binary in extracted directory
  local bin_path
  bin_path="$(find "$tmp_dir" -name "$bin_name" -type f | head -1)"
  if [ -z "$bin_path" ]; then
    error "Binary $bin_name not found in archive"
    rm -rf "$tmp_dir"
    return 1
  fi

  cp "$bin_path" "$INSTALL_DIR/$bin_name"
  chmod +x "$INSTALL_DIR/$bin_name"
  rm -rf "$tmp_dir"

  ok "$bin_name installed: $("$INSTALL_DIR/$bin_name" --version 2>&1)"
}

echo ""
echo "=== Installing WASM build tools ==="
echo ""

install_from_github "bytecodealliance/wasm-tools" "wasm-tools"
install_from_github "bytecodealliance/wit-bindgen" "wit-bindgen"

# wasm-opt (binaryen) — different release naming convention
install_wasm_opt() {
  local bin_name="wasm-opt"

  if command -v "$bin_name" &>/dev/null; then
    ok "$bin_name already installed: $($bin_name --version 2>&1)"
    return
  fi

  info "Fetching latest wasm-opt (binaryen) release..."
  # Binaryen uses "arm64" instead of "aarch64" in release names
  local binaryen_arch="$ARCH_SLUG"
  if [ "$binaryen_arch" = "aarch64" ]; then
    binaryen_arch="arm64"
  fi
  local url
  url=$(curl -sL "https://api.github.com/repos/WebAssembly/binaryen/releases/latest" | python3 -c "
import json, sys
data = json.load(sys.stdin)
for asset in data['assets']:
    name = asset['name']
    if '${binaryen_arch}-${PLATFORM}' in name and name.endswith('.tar.gz') and not name.endswith('.sha256'):
        print(asset['browser_download_url'])
        break
")

  if [ -z "$url" ]; then
    error "Could not find wasm-opt release for $PLATFORM-$ARCH_SLUG"
    return 1
  fi

  local tmp_dir
  tmp_dir="$(mktemp -d)"
  info "Downloading $url..."
  curl -sL "$url" | tar -xz -C "$tmp_dir"

  local bin_path
  bin_path="$(find "$tmp_dir" -name "wasm-opt" -type f | head -1)"
  if [ -z "$bin_path" ]; then
    error "wasm-opt not found in archive"
    rm -rf "$tmp_dir"
    return 1
  fi

  cp "$bin_path" "$INSTALL_DIR/wasm-opt"
  chmod +x "$INSTALL_DIR/wasm-opt"

  # Binaryen ships a shared lib that wasm-opt needs at @rpath/../lib/
  local lib_dir
  lib_dir="$(find "$tmp_dir" -name "libbinaryen*" -type f -print -quit 2>/dev/null | xargs dirname 2>/dev/null)"
  if [ -n "$lib_dir" ] && [ -d "$lib_dir" ]; then
    local target_lib="$(dirname "$INSTALL_DIR")/lib"
    mkdir -p "$target_lib"
    cp "$lib_dir"/libbinaryen* "$target_lib/"
  fi

  rm -rf "$tmp_dir"

  ok "wasm-opt installed: $("$INSTALL_DIR/wasm-opt" --version 2>&1)"
}

install_wasm_opt

echo ""

# PATH check
if ! echo "$PATH" | tr ':' '\n' | grep -q "$INSTALL_DIR"; then
  echo "  Add to your shell profile (~/.bashrc or ~/.zshrc):"
  echo "    export PATH=\"$INSTALL_DIR:\$PATH\""
  echo ""
fi
