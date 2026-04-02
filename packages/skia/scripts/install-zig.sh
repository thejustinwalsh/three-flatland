#!/usr/bin/env bash
set -euo pipefail

# Install Zig for the current platform.
#
# Usage:
#   ./scripts/install-zig.sh              # Install latest stable
#   ./scripts/install-zig.sh 0.14.1       # Install specific version
#   ZIG_INSTALL_DIR=/opt ./scripts/install-zig.sh  # Custom install location
#
# Installs to $ZIG_INSTALL_DIR (default: ~/.local) with:
#   - Binary at $ZIG_INSTALL_DIR/bin/zig
#   - Lib at $ZIG_INSTALL_DIR/lib/zig/
#
# Supports: Linux x86_64/aarch64, macOS x86_64/aarch64

ZIG_VERSION="${1:-0.14.1}"
INSTALL_DIR="${ZIG_INSTALL_DIR:-$HOME/.local}"

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

info()  { echo -e "${BLUE}[info]${NC}  $*"; }
ok()    { echo -e "${GREEN}[ok]${NC}    $*"; }
error() { echo -e "${RED}[error]${NC} $*" >&2; }

# ── Detect platform ──
OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"

case "$OS" in
  linux)  PLATFORM="linux" ;;
  darwin) PLATFORM="macos" ;;
  *)      error "Unsupported OS: $OS"; exit 1 ;;
esac

case "$ARCH" in
  x86_64)  ARCH_SLUG="x86_64" ;;
  aarch64|arm64) ARCH_SLUG="aarch64" ;;
  *)       error "Unsupported architecture: $ARCH"; exit 1 ;;
esac

# ── Check if already installed ──
if command -v zig &>/dev/null; then
  CURRENT="$(zig version 2>/dev/null)"
  if [ "$CURRENT" = "$ZIG_VERSION" ]; then
    ok "Zig $ZIG_VERSION is already installed: $(which zig)"
    exit 0
  fi
  info "Zig $CURRENT found, upgrading to $ZIG_VERSION..."
fi

# ── Download ──
TARBALL="zig-${ARCH_SLUG}-${PLATFORM}-${ZIG_VERSION}.tar.xz"
URL="https://ziglang.org/download/${ZIG_VERSION}/${TARBALL}"
TMP_DIR="$(mktemp -d)"

info "Downloading Zig $ZIG_VERSION for $PLATFORM-$ARCH_SLUG..."
info "URL: $URL"

if ! curl -fL -o "$TMP_DIR/$TARBALL" "$URL" 2>&1; then
  error "Download failed. Check version exists at https://ziglang.org/download/"
  rm -rf "$TMP_DIR"
  exit 1
fi

# ── Extract ──
info "Extracting..."
tar -xJf "$TMP_DIR/$TARBALL" -C "$TMP_DIR"
EXTRACTED="$TMP_DIR/zig-${ARCH_SLUG}-${PLATFORM}-${ZIG_VERSION}"

if [ ! -x "$EXTRACTED/zig" ]; then
  error "Extraction failed — zig binary not found at $EXTRACTED/zig"
  rm -rf "$TMP_DIR"
  exit 1
fi

# ── Install ──
mkdir -p "$INSTALL_DIR/bin" "$INSTALL_DIR/lib"

# Remove old installation if present
rm -f "$INSTALL_DIR/bin/zig"
rm -rf "$INSTALL_DIR/lib/zig"

# Copy the full Zig directory (binary + lib) to a stable location
ZIG_HOME="$INSTALL_DIR/lib/zig-${ZIG_VERSION}"
rm -rf "$ZIG_HOME"
mv "$EXTRACTED" "$ZIG_HOME"

# Symlink binary
ln -sf "$ZIG_HOME/zig" "$INSTALL_DIR/bin/zig"

# ── Cleanup ──
rm -rf "$TMP_DIR"

# ── Verify ──
if [ -x "$INSTALL_DIR/bin/zig" ]; then
  ok "Zig $ZIG_VERSION installed to $INSTALL_DIR/bin/zig"
else
  error "Installation failed"
  exit 1
fi

# ── PATH check ──
if ! echo "$PATH" | tr ':' '\n' | grep -q "$INSTALL_DIR/bin"; then
  echo ""
  echo "  Add to your shell profile (~/.bashrc or ~/.zshrc):"
  echo "    export PATH=\"$INSTALL_DIR/bin:\$PATH\""
  echo ""
fi

"$INSTALL_DIR/bin/zig" version
